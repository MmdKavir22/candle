import '@fontsource-variable/vazirmatn';
import './admin.css';
import type { Category, DataName, Homepage, Product, Settings } from '../shared/types';
import { validateCategories, validateHomepage, validateProduct, validateProducts, validateSettings, IMG_RE } from '../shared/validate';
import { html, mount, raw, $, $$, type Safe } from '../utils/dom';
import { asset, dateFa, faNum, money, onSale, slugify, unitPrice } from '../utils/format';
import { normFa } from '../utils/catalog';

const SITE_REPO = import.meta.env.VITE_SITE_REPO ?? '';
const DEFAULT_DATA_REPO = import.meta.env.VITE_DATA_REPO ?? '';
const SESSION_KEY = 'candle-admin-session';
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const root = $('#admin')!;

class ApiError extends Error { constructor(readonly status: number, m: string) { super(m); } }
/** The admin's own GitHub token: kept only in memory (+ sessionStorage for this tab) and sent only to api.github.com. */
let creds: { token: string; repo: string } | null = null;

let busyN = 0;
const busy = (d: number) => { busyN += d; document.body.classList.toggle('busy', busyN > 0); };
async function gh(path: string, init: RequestInit = {}, rawMedia = false): Promise<Response> {
  busy(1);
  try { return await ghRaw(path, init, rawMedia); } finally { busy(-1); }
}
async function ghRaw(path: string, init: RequestInit = {}, rawMedia = false): Promise<Response> {
  if (!creds) throw new ApiError(401, 'وارد نشده‌اید.');
  let r: Response;
  try {
    r = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${creds.token}`, Accept: rawMedia ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch { throw new ApiError(0, 'اتصال به GitHub برقرار نشد.'); }
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { message?: string };
    const m = r.status === 401 ? 'توکن نامعتبر یا منقضی است.'
      : r.status === 403 ? 'دسترسی توکن کافی نیست (روی مخزن داده: Contents → Read and write) یا محدودیت نرخ GitHub.'
      : r.status === 404 ? 'مخزن یا فایل پیدا نشد (یا توکن به آن دسترسی ندارد).'
      : r.status === 409 || r.status === 422 ? 'فایل هم‌زمان تغییر کرده است؛ «بازخوانی» را بزنید و دوباره تلاش کنید.'
      : (b.message ?? r.statusText);
    throw new ApiError(r.status, m);
  }
  return r;
}
const toB64 = (t: string) => { let b = ''; new TextEncoder().encode(t).forEach((c) => { b += String.fromCharCode(c); }); return btoa(b); };
const fromB64 = (t: string) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const R = () => `/repos/${creds!.repo}`;

async function getFile(path: string): Promise<{ sha: string; text: string } | null> {
  try {
    const j = (await (await gh(`${R()}/contents/${path}`)).json()) as { sha: string; content: string };
    return { sha: j.sha, text: fromB64(j.content) };
  } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
}
async function putFile(path: string, b64: string, message: string, sha?: string): Promise<string> {
  const r = await gh(`${R()}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64, ...(sha ? { sha } : {}) }) });
  return ((await r.json()) as { content: { sha: string } }).content.sha;
}

interface Doc<T> { content: T; sha: string }
interface Commit { message: string; date: string; author: string }
const db: { products?: Doc<Product[]>; categories?: Doc<Category[]>; homepage?: Doc<Homepage>; settings?: Doc<Settings> } = {};
let history: Commit[] = [];
let user = '';
type Tab = 'overview' | 'products' | 'homepage' | 'settings';
let tab: Tab = 'overview';
let editing: { p: Product; isNew: boolean; orig: string[] } | null = null;
let hp: Homepage | null = null;
let errors: string[] = [];
let pendingWarn = '';
let q = '', fcat = '', sortBy: 'name' | 'price' | 'new' = 'name';
let lastRun: { status: string; conclusion: string | null; url: string; date: string } | null = null;
async function loadRun() {
  if (!SITE_REPO) return;
  try {
    const j = (await (await gh(`/repos/${SITE_REPO}/actions/runs?per_page=1&branch=main`)).json()) as { workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[] };
    const r = j.workflow_runs[0];
    lastRun = r ? { status: r.status, conclusion: r.conclusion, url: r.html_url, date: r.created_at } : null;
  } catch { /* needs Actions: read; optional */ }
}

let mt = 0;
function note(m: string, err = false) {
  const el = $('#msg') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'msg', role: 'status' }));
  el.textContent = pendingWarn ? `${m} ${pendingWarn}` : m; el.className = err || pendingWarn ? 'err' : ''; el.hidden = false;
  pendingWarn = '';
  clearTimeout(mt); mt = window.setTimeout(() => { el.hidden = true; }, 7000);
}
const fail = (e: unknown) => note(e instanceof Error ? e.message : 'خطای ناشناخته', true);

async function loadHistory() {
  try {
    const l = (await (await gh(`${R()}/commits?path=data&per_page=8`)).json()) as { commit: { message: string; author: { name: string; date: string } } }[];
    history = l.map((c) => ({ message: c.commit.message.split('\n')[0] ?? '', author: c.commit.author.name, date: c.commit.author.date }));
  } catch { /* history is optional */ }
}
/** Starter content for a file missing from the private repo: the site's bundled sample, minus references to files that don't exist there. */
async function defaultFor(n: DataName): Promise<unknown> {
  if (n === 'products') return [];
  const r = await fetch(asset(`data/${n}.json`));
  if (!r.ok) throw new ApiError(0, `نمونه اولیه ${n}.json در سایت پیدا نشد.`);
  const d = (await r.json()) as Record<string, unknown>;
  if (n === 'homepage') { d.featuredIds = []; d.banners = []; }
  return d;
}
let createdFiles: string[] = [];
async function loadAll() {
  const names: DataName[] = ['products', 'categories', 'homepage', 'settings'];
  createdFiles = [];
  for (const n of names) { // sequential: parallel commits to one branch can conflict
    let f = await getFile(`data/${n}.json`);
    if (!f) {
      const content = await defaultFor(n);
      const text = JSON.stringify(content, null, 2) + '\n';
      const sha = await putFile(`data/${n}.json`, toB64(text), `admin(${user}): create ${n}.json`);
      f = { sha, text };
      createdFiles.push(`${n}.json`);
    }
    (db as Record<string, unknown>)[n] = { content: JSON.parse(f.text), sha: f.sha };
  }
  await Promise.all([loadHistory(), loadRun()]);
}
/** Ask the public site repo to rebuild so changes go live (needs Actions: write on the site repo). */
async function publish() {
  if (!SITE_REPO) { pendingWarn = 'انتشار خودکار تنظیم نشده؛ workflow سایت را دستی اجرا کنید.'; return; }
  try { await gh(`/repos/${SITE_REPO}/actions/workflows/deploy.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }); }
  catch { pendingWarn = 'ذخیره شد اما انتشار خودکار انجام نشد؛ به توکن دسترسی Actions روی مخزن سایت بدهید یا workflow را دستی اجرا کنید.'; }
}
async function save(name: DataName, content: unknown) {
  const doc = db[name] as Doc<unknown>;
  const sha = await putFile(`data/${name}.json`, toB64(JSON.stringify(content, null, 2) + '\n'), `admin(${user}): update ${name}.json`, doc.sha);
  (db as Record<string, unknown>)[name] = { content, sha };
  await Promise.all([loadHistory(), publish()]);
  setTimeout(async () => { await loadRun(); if (tab === 'overview' && !editing && user) paint(); }, 5000);
}

/* ---------- private-repo image previews ---------- */
const MIME: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' };
const previews = new Map<string, string>();
async function imgSrc(path: string): Promise<string> {
  const hit = previews.get(path);
  if (hit) return hit;
  try {
    const r = await ghRaw(`${R()}/contents/${path}`, {}, true);
    const u = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: MIME[path.split('.').pop() ?? ''] ?? 'image/webp' }));
    previews.set(path, u);
    return u;
  } catch { return asset(path); }
}
function hydrate() {
  $$<HTMLImageElement>('img[data-p]').forEach((i) => { const p = i.dataset.p; if (p) void imgSrc(p).then((u) => { i.src = u; }); });
}
async function removeImage(path: string) {
  try {
    if (!/^images\/(products|banners|categories)\//.test(path)) return;
    const used = JSON.stringify([db.products?.content, db.homepage?.content, db.categories?.content]);
    if (used.includes(`"${path}"`)) return;
    const f = await getFile(path);
    if (f) await gh(`${R()}/contents/${path}`, { method: 'DELETE', body: JSON.stringify({ message: `admin(${user}): delete ${path}`, sha: f.sha }) });
  } catch { /* leaving an orphan file is harmless */ }
}

/* ---------- image handling ---------- */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
async function optimize(file: File): Promise<{ type: string; data: string }> {
  if (!ALLOWED.includes(file.type)) throw new Error('فقط JPG، PNG یا WebP مجاز است.');
  if (file.size > 10 * 1024 * 1024) throw new Error('حجم فایل بیش از ۱۰ مگابایت است.');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('بهینه‌سازی تصویر ممکن نشد.');
  if (blob.size > 1_800_000) throw new Error('حجم تصویر پس از بهینه‌سازی هنوز زیاد است؛ تصویر کوچک‌تری انتخاب کنید.');
  const data = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob!); });
  return { type: blob.type, data };
}
async function upload(file: File, dir: 'products' | 'banners' | 'categories', base: string): Promise<string> {
  const o = await optimize(file);
  const rel = `images/${dir}/${slugify(base) || 'image'}-${Date.now().toString(36)}.${o.type === 'image/webp' ? 'webp' : 'jpg'}`;
  await putFile(rel, o.data, `admin(${user}): upload ${rel}`);
  previews.set(rel, `data:${o.type};base64,${o.data}`);
  return rel;
}

/* ---------- form helpers ---------- */
const val = (f: HTMLFormElement, n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
const chk = (f: HTMLFormElement, n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.checked ?? false;
const FA = '۰۱۲۳۴۵۶۷۸۹';
const num = (s: string): number | null => { const t = s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٬,\s]/g, ''); return t === '' ? null : Number(t); };
const err = () => (errors.length ? html`<div class="errors" role="alert"><strong>لطفاً خطاها را اصلاح کنید:</strong><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div>` : '');
const field = (label: string, name: string, v: string | number, extra = '') => html`<label>${label}<input name="${name}" value="${v}" ${raw(extra)} /></label>`;

function readProduct(f: HTMLFormElement, base: Product): Product {
  const specs: Record<string, string> = {};
  val(f, 'specs').split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) specs[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  const alts = base.images.map((_, i) => val(f, `alt${i}`).trim());
  return {
    ...base, id: base.id || val(f, 'id').trim(), name: val(f, 'name').trim(), description: val(f, 'description').trim(),
    price: num(val(f, 'price')) ?? NaN, discountPrice: num(val(f, 'discountPrice')), category: val(f, 'category'),
    imageAlts: alts, fragrance: val(f, 'fragrance').trim(), size: val(f, 'size').trim(), waxType: val(f, 'waxType').trim(),
    burningDuration: val(f, 'burningDuration').trim(), available: chk(f, 'available'), featured: chk(f, 'featured'),
    isNew: chk(f, 'isNew'), bestSeller: chk(f, 'bestSeller'), specs,
  };
}
function readHome(f: HTMLFormElement, base: Homepage): Homepage {
  let extra: Partial<Homepage> = {};
  try { extra = JSON.parse(val(f, 'adv') || '{}') as Partial<Homepage>; } catch { errors = ['JSON بخش «محتوای پیشرفته» معتبر نیست.']; }
  return {
    ...base, ...extra, heroTitle: val(f, 'heroTitle').trim(), heroDescription: val(f, 'heroDescription').trim(),
    banners: base.banners.map((b, i) => ({ ...b, title: val(f, `bt${i}`).trim(), text: val(f, `bx${i}`).trim(), link: val(f, `bl${i}`).trim() })),
    featuredIds: Array.from(f.querySelectorAll<HTMLInputElement>('input[name=feat]:checked')).map((i) => i.value),
  };
}

const SITE_URL = location.origin + import.meta.env.BASE_URL;
let pf = { q: '', cat: '', status: '', sort: 'new' };
let dirty = false;
let deploy: { status: string; conclusion: string | null; url: string; at: string } | null = null;
const leave = () => { if (dirty && !confirm('تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟')) return false; dirty = false; return true; };

async function loadDeploy() {
  if (!SITE_REPO) return;
  try {
    const j = (await (await gh(`/repos/${SITE_REPO}/actions/workflows/deploy.yml/runs?per_page=1`)).json()) as { workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[] };
    const r = j.workflow_runs[0];
    deploy = r ? { status: r.status, conclusion: r.conclusion, url: r.html_url, at: r.created_at } : null;
  } catch { deploy = null; }
}

function health(): { ok: boolean; text: string; tab?: Tab }[] {
  const ps = db.products!.content, s = db.settings!.content, h = db.homepage!.content, c = s.contact;
  const noAlt = ps.filter((p) => p.images.some((_, i) => !p.imageAlts?.[i]?.trim())).length;
  const short = ps.filter((p) => p.description.trim().length < 40).length;
  return [
    { ok: s.telegramUsername !== 'YOUR_TELEGRAM_USERNAME', text: 'نام کاربری تلگرام واقعی تنظیم شده است', tab: 'settings' },
    { ok: ps.length > 0, text: 'حداقل یک محصول ثبت شده است', tab: 'products' },
    { ok: noAlt === 0, text: noAlt ? `${faNum(noAlt)} محصول تصویر بدون متن جایگزین (alt) دارد` : 'همه تصاویر متن جایگزین دارند', tab: 'products' },
    { ok: short === 0, text: short ? `${faNum(short)} محصول توضیحات کوتاه دارد (بهتر است ۴۰ نویسه یا بیشتر)` : 'توضیحات محصولات کافی است', tab: 'products' },
    { ok: h.featuredIds.length > 0, text: 'محصولات ویژه صفحه اصلی انتخاب شده‌اند', tab: 'homepage' },
    { ok: !!(c.phone || c.email || c.address), text: 'حداقل یک راه تماس ثبت شده است', tab: 'settings' },
    { ok: !!s.shippingInfo.trim(), text: 'اطلاعات ارسال نوشته شده است', tab: 'settings' },
    { ok: !!SITE_REPO, text: 'انتشار خودکار فعال است' },
  ];
}

function exportBackup() {
  const data = { exportedAt: new Date().toISOString(), products: db.products!.content, categories: db.categories!.content, homepage: db.homepage!.content, settings: db.settings!.content };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `candle-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- views ---------- */
function shell(body: Safe): Safe {
  const T: [Tab, string, string][] = [['overview', '◈', 'نمای کلی'], ['products', '▣', 'محصولات'], ['homepage', '⌂', 'صفحه اصلی'], ['settings', '⚙', 'تنظیمات']];
  return html`<div class="app"><aside class="side"><div class="brandmark">🕯 ${db.settings!.content.brandName}<small>پنل مدیریت</small></div>
    <nav aria-label="بخش‌ها">${T.map(([k, i, t]) => html`<button type="button" data-act="tab" data-id="${k}" aria-current="${tab === k}"><span aria-hidden="true">${i}</span>${t}</button>`)}</nav>
    <div class="who"><span class="muted">${user}</span><div class="row-actions"><a class="btn ghost sm" href="${SITE_URL}" target="_blank" rel="noopener">مشاهده سایت ↗</a><button class="btn ghost sm" data-act="reload" type="button">بازخوانی</button><button class="btn ghost sm" data-act="logout" type="button">خروج</button></div></div></aside>
    <main class="content view">${err()}${body}</main></div>`;
}

function overview(): Safe {
  const ps = db.products!.content, cats = db.categories!.content;
  const avg = ps.length ? Math.round(ps.reduce((a, p) => a + unitPrice(p), 0) / ps.length) : 0;
  const stat = (n: string, l: string, tone = '') => html`<div class="panel stat ${tone}"><b>${n}</b><span>${l}</span></div>`;
  const counts = cats.map((c) => ({ c, n: ps.filter((p) => p.category === c.id).length }));
  const max = Math.max(1, ...counts.map((x) => x.n));
  const hs = health();
  const okN = hs.filter((x) => x.ok).length;
  const dep = !deploy ? ['نامشخص', ''] : deploy.status !== 'completed' ? ['در حال انتشار…', 'warn'] : deploy.conclusion === 'success' ? ['آخرین انتشار موفق بود', 'ok'] : ['آخرین انتشار ناموفق بود', 'bad'];
  return html`<h1>نمای کلی</h1>
    <div class="stats">${stat(faNum(ps.length), 'کل محصولات')}${stat(faNum(ps.filter((p) => p.available).length), 'موجود', 'ok')}${stat(faNum(ps.filter((p) => !p.available).length), 'ناموجود', 'bad')}${stat(faNum(ps.filter((p) => p.featured).length), 'ویژه')}${stat(faNum(ps.filter(onSale).length), 'تخفیف‌دار')}${stat(faNum(avg), `میانگین قیمت (${db.settings!.content.currency})`)}</div>
    <div class="cols2">
      <div class="panel"><h2>انتشار سایت</h2><p><span class="pill ${dep[1]}">${dep[0]}</span> ${deploy ? html`<span class="muted">${dateFa(deploy.at)}</span> <a href="${deploy.url}" target="_blank" rel="noopener">جزئیات ↗</a>` : ''}</p>
        <div class="row-actions"><button class="btn primary sm" type="button" data-act="deploynow">انتشار دستی</button><button class="btn ghost sm" type="button" data-act="refreshdeploy">بروزرسانی وضعیت</button><button class="btn ghost sm" type="button" data-act="new">+ محصول جدید</button><button class="btn ghost sm" type="button" data-act="export">دانلود پشتیبان JSON</button></div></div>
      <div class="panel"><h2>توزیع دسته‌بندی‌ها</h2>${counts.map(({ c, n }) => html`<div class="barrow"><span>${c.name}</span><div class="bar"><i style="--w:${Math.round((n / max) * 100)}%"></i></div><b>${faNum(n)}</b></div>`)}</div>
    </div>
    <div class="panel"><h2>چک‌لیست سلامت سایت <span class="muted">(${faNum(okN)} از ${faNum(hs.length)})</span></h2><div class="meter"><i style="--w:${Math.round((okN / hs.length) * 100)}%"></i></div>
      <ul class="health">${hs.map((x) => html`<li class="${x.ok ? 'ok' : 'warn'}"><span aria-hidden="true">${x.ok ? '✓' : '!'}</span>${x.text}${!x.ok && x.tab ? html` <button class="link" type="button" data-act="tab" data-id="${x.tab}">اصلاح</button>` : ''}</li>`)}</ul></div>
    <div class="panel"><h2>آخرین تغییرات</h2>${history.length ? html`<ul class="timeline">${history.map((c) => html`<li>${c.message}<span class="muted"> — ${c.author} · ${dateFa(c.date)}</span></li>`)}</ul>` : html`<p class="muted">تغییری ثبت نشده است.</p>`}</div>`;
}

function filtered(): Product[] {
  const map: Record<string, Filters['sort']> = { new: 'newest', asc: 'asc', desc: 'desc', name: 'newest' };
  let l = filterProducts(db.products!.content, { q: pf.q, cat: pf.cat, sort: map[pf.sort] ?? 'newest', avail: false }, db.categories!.content);
  if (pf.status === 'in') l = l.filter((p) => p.available);
  else if (pf.status === 'out') l = l.filter((p) => !p.available);
  else if (pf.status === 'feat') l = l.filter((p) => p.featured);
  else if (pf.status === 'sale') l = l.filter(onSale);
  if (pf.sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return l;
}

function productRows(): Safe {
  const cats = db.categories!.content, cur = db.settings!.content.currency;
  const l = filtered();
  return html`<p class="muted">${faNum(l.length)} از ${faNum(db.products!.content.length)} محصول</p><div class="tbl"><table><thead><tr><th></th><th>نام</th><th>دسته</th><th>قیمت</th><th>موجودی</th><th></th></tr></thead><tbody>
    ${l.length ? l.map((p) => html`<tr><td><img class="thumb" data-p="${p.images[0] ?? ''}" alt="" /></td>
      <td><strong>${p.name}</strong><br /><small class="muted" dir="ltr">${p.id}</small> ${p.featured ? html`<span class="tag">ویژه</span>` : ''}${p.isNew ? html`<span class="tag">جدید</span>` : ''}${p.bestSeller ? html`<span class="tag">پرفروش</span>` : ''}</td>
      <td>${cats.find((c) => c.id === p.category)?.name ?? p.category}</td>
      <td>${faNum(unitPrice(p))} ${cur}${onSale(p) ? html`<br /><del class="muted">${faNum(p.price)}</del>` : ''}</td>
      <td><button class="switch" type="button" role="switch" aria-checked="${p.available}" aria-label="موجودی ${p.name}" data-act="toggle" data-id="${p.id}"></button></td>
      <td><div class="row-actions"><button class="btn ghost sm" type="button" data-act="edit" data-id="${p.id}">ویرایش</button><button class="btn ghost sm" type="button" data-act="dup" data-id="${p.id}">کپی</button><button class="btn danger sm" type="button" data-act="del" data-id="${p.id}">حذف</button></div></td></tr>`)
      : html`<tr><td colspan="6" class="muted">موردی پیدا نشد.</td></tr>`}</tbody></table></div>`;
}

function productsView(): Safe {
  if (editing) return productForm();
  const cats = db.categories!.content;
  return html`<h1>محصولات</h1>
    <form class="panel toolbar" data-form="pfilter" role="search">
      <label>جستجو<input type="search" name="q" value="${pf.q}" placeholder="نام، رایحه…" /></label>
      <label>دسته<select name="cat"><option value="">همه</option>${cats.map((c) => html`<option value="${c.id}" ${c.id === pf.cat ? html`selected` : ''}>${c.name}</option>`)}</select></label>
      <label>وضعیت<select name="status">${[['', 'همه'], ['in', 'موجود'], ['out', 'ناموجود'], ['feat', 'ویژه'], ['sale', 'تخفیف‌دار']].map(([v, t]) => html`<option value="${v}" ${v === pf.status ? html`selected` : ''}>${t}</option>`)}</select></label>
      <label>مرتب‌سازی<select name="sort">${[['new', 'جدیدترین'], ['name', 'نام'], ['asc', 'ارزان‌ترین'], ['desc', 'گران‌ترین']].map(([v, t]) => html`<option value="${v}" ${v === pf.sort ? html`selected` : ''}>${t}</option>`)}</select></label>
      <button class="btn primary" type="button" data-act="new">+ افزودن محصول</button></form>
    <div class="panel" id="ptable">${productRows()}</div>
    <form class="panel" data-form="cats"><h2>دسته‌بندی‌ها</h2>
    ${cats.map((c, i) => html`<div class="grid2"><label>شناسه<input name="cid${i}" value="${c.id}" dir="ltr" /></label><label>نام<input name="cn${i}" value="${c.name}" /></label><label>توضیح<input name="cd${i}" value="${c.description ?? ''}" /></label><label>تصویر<input name="ci${i}" value="${c.image ?? ''}" dir="ltr" /></label></div>`)}
    <div class="row-actions"><button class="btn ghost sm" type="button" data-act="addcat">افزودن دسته</button><button class="btn primary sm" type="submit">ذخیره دسته‌بندی‌ها</button></div></form>`;
}

function previewPanel(p: Product): Safe {
  const cur = db.settings!.content.currency, brand = db.settings!.content.brandName;
  const sale = Number.isFinite(p.price) && p.discountPrice !== null && !Number.isNaN(p.discountPrice) && p.discountPrice < p.price;
  const pct = sale ? Math.round((1 - (p.discountPrice as number) / p.price) * 100) : 0;
  const title = `${p.name || 'نام محصول'} | ${brand}`;
  const tl = title.length, dl = p.description.length;
  return html`<div class="pvcard"><div class="pvimg">${p.images[0] ? html`<img data-p="${p.images[0]}" alt="" />` : html`<span class="muted">بدون تصویر</span>`}${sale ? html`<b class="pct">٪${faNum(pct)}</b>` : ''}${!p.available ? html`<b class="pct off">ناموجود</b>` : ''}</div>
    <div class="pvb"><strong>${p.name || 'نام محصول'}</strong><span class="muted">${p.fragrance}</span><span class="price">${Number.isFinite(p.price) ? `${faNum((sale ? p.discountPrice : p.price) as number)} ${cur}` : '—'} ${sale ? html`<del class="muted">${faNum(p.price)}</del>` : ''}</span></div></div>
    <div class="serp"><small dir="ltr">${SITE_URL}products/${p.id}/</small><h4>${title}</h4><p>${p.description.slice(0, 155) || 'توضیحات محصول اینجا در گوگل نمایش داده می‌شود…'}</p></div>
    <ul class="tips"><li class="${tl <= 60 ? 'ok' : 'warn'}">طول عنوان: ${faNum(tl)} از ۶۰</li><li class="${dl >= 70 && dl <= 155 ? 'ok' : 'warn'}">طول توضیح: ${faNum(dl)} (ایده‌آل ۷۰ تا ۱۵۵)</li><li class="${p.images.length && (p.imageAlts ?? []).every((a) => a.trim()) ? 'ok' : 'warn'}">متن جایگزین (alt) تصاویر</li><li class="${p.images.length > 1 ? 'ok' : 'warn'}">بیش از یک تصویر</li></ul>`;
}

function productForm(): Safe {
  const { p, isNew } = editing!;
  const cats = db.categories!.content;
  const sp = Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  return html`<h1>${isNew ? 'محصول جدید' : `ویرایش: ${p.name}`}</h1><div class="editor">
  <form class="panel" data-form="product"><div class="grid2">
    <label>شناسه (لاتین، مثل candle-009)<input name="id" value="${p.id}" ${isNew ? '' : html`readonly`} dir="ltr" required /></label>
    ${field('نام', 'name', p.name, 'required maxlength="120"')}
    <label>قیمت (${db.settings!.content.currency})<input name="price" value="${Number.isFinite(p.price) ? p.price : ''}" inputmode="numeric" required /></label>
    <label>قیمت با تخفیف (اختیاری)<input name="discountPrice" value="${p.discountPrice ?? ''}" inputmode="numeric" /></label>
    <label>دسته‌بندی<select name="category">${cats.map((c) => html`<option value="${c.id}" ${c.id === p.category ? html`selected` : ''}>${c.name}</option>`)}</select></label>
    ${field('رایحه', 'fragrance', p.fragrance)}${field('اندازه', 'size', p.size)}${field('نوع موم', 'waxType', p.waxType)}${field('مدت سوختن', 'burningDuration', p.burningDuration)}</div>
    <label>توضیحات<textarea name="description" maxlength="2000" required>${p.description}</textarea></label>
    <label>مشخصات بیشتر (هر خط «عنوان: مقدار»)<textarea name="specs">${sp}</textarea></label>
    <div class="checks"><label class="chk"><input type="checkbox" name="available" ${p.available ? html`checked` : ''}/>موجود</label><label class="chk"><input type="checkbox" name="featured" ${p.featured ? html`checked` : ''}/>ویژه</label><label class="chk"><input type="checkbox" name="isNew" ${p.isNew ? html`checked` : ''}/>جدید</label><label class="chk"><input type="checkbox" name="bestSeller" ${p.bestSeller ? html`checked` : ''}/>پرفروش</label></div>
    <h3>تصاویر (۱ تا ۸؛ اولی تصویر اصلی است)</h3>
    ${p.images.map((src, i) => html`<div class="imgrow"><img data-p="${src}" alt="" /><label>متن جایگزین (alt)<input name="alt${i}" value="${p.imageAlts?.[i] ?? ''}" maxlength="160" /></label><div class="row-actions">${i > 0 ? html`<button class="btn ghost sm" type="button" data-act="mainimg" data-id="${i}">اصلی</button><button class="btn ghost sm" type="button" data-act="upimg" data-id="${i}" aria-label="بالا">↑</button>` : ''}${i < p.images.length - 1 ? html`<button class="btn ghost sm" type="button" data-act="downimg" data-id="${i}" aria-label="پایین">↓</button>` : ''}<button class="btn danger sm" type="button" data-act="rmimg" data-id="${i}">حذف</button></div></div>`)}
    <label>افزودن تصویر (JPG, PNG, WebP)<input type="file" data-upload="product" accept="image/jpeg,image/png,image/webp" /></label>
    <div class="row-actions sticky"><button class="btn primary" type="submit">ذخیره محصول (Ctrl+S)</button><button class="btn ghost" type="button" data-act="cancel">انصراف</button></div></form>
  <aside class="pvwrap"><div class="panel" id="pv"><h3>پیش‌نمایش زنده</h3>${previewPanel(p)}</div></aside></div>`;
}

function heroPreview(h: { heroTitle: string; heroDescription: string; heroImage: string }): Safe {
  return html`<div class="hv"><img data-p="${h.heroImage}" alt="" /><div><strong>${h.heroTitle || '—'}</strong><p>${h.heroDescription}</p></div></div>`;
}

function homeView(): Safe {
  hp ??= structuredClone(db.homepage!.content);
  const h = hp;
  const { banners, intro, careTips, faq, collections, testimonials } = h;
  const adv = JSON.stringify({ intro, careTips, faq, collections, testimonials }, null, 2);
  return html`<form class="panel" data-form="home"><h1>صفحه اصلی</h1>
    ${field('عنوان اصلی', 'heroTitle', h.heroTitle, 'required')}<label>توضیح اصلی<textarea name="heroDescription">${h.heroDescription}</textarea></label>
    <div class="imgrow"><img data-p="${h.heroImage}" alt="" /><label>تصویر اصلی<input type="file" data-upload="hero" accept="image/jpeg,image/png,image/webp" /></label><span></span></div>
    <div id="hv" class="panel">${heroPreview(h)}</div><h3>محصولات ویژه صفحه اصلی</h3><div class="checks">${db.products!.content.map((p) => html`<label class="chk"><input type="checkbox" name="feat" value="${p.id}" ${h.featuredIds.includes(p.id) ? html`checked` : ''}/>${p.name}</label>`)}</div>
    <h3>بنرها</h3>${banners.map((b, i) => html`<div class="panel"><div class="grid2">${field('عنوان', `bt${i}`, b.title)}${field('متن', `bx${i}`, b.text)}<label>لینک (#/shop یا https://)<input name="bl${i}" value="${b.link}" dir="ltr" /></label></div>
      <div class="imgrow">${b.image ? html`<img data-p="${b.image}" alt="" />` : html`<span></span>`}<label>تصویر بنر<input type="file" data-upload="banner" data-id="${i}" accept="image/jpeg,image/png,image/webp" /></label><button class="btn danger sm" type="button" data-act="rmbanner" data-id="${i}">حذف بنر</button></div></div>`)}
    <button class="btn ghost sm" type="button" data-act="addbanner">افزودن بنر</button>
    <h3>محتوای پیشرفته (JSON)</h3><p class="muted">معرفی برند، نکات نگهداری، پرسش‌های متداول، مجموعه‌ها و نظرات مشتریان (فقط نظرات واقعی).</p>
    <textarea class="code" name="adv">${adv}</textarea>
    <p><button class="btn primary" type="submit">ذخیره صفحه اصلی</button></p></form>`;
}

function settingsView(): Safe {
  const s = db.settings!.content;
  const o = s.customOrder;
  return html`<form class="panel" data-form="settings"><h1>تنظیمات فروشگاه</h1><div class="grid2">
    <label>نام کاربری تلگرام (بدون @)<input name="tg" value="${s.telegramUsername}" dir="ltr" required /><small><a href="https://t.me/${s.telegramUsername}" target="_blank" rel="noopener noreferrer">تست لینک تلگرام ↗</a></small></label>${field('نام برند', 'brandName', s.brandName, 'required')}${field('واحد پول', 'currency', s.currency, 'required')}
    ${field('ایمیل', 'email', s.contact.email)}${field('تلفن', 'phone', s.contact.phone)}${field('نشانی', 'address', s.contact.address)}
    <label>اینستاگرام (https://)<input name="instagram" value="${s.social.instagram ?? ''}" dir="ltr" /></label><label>کانال تلگرام (https://)<input name="telegramChannel" value="${s.social.telegramChannel ?? ''}" dir="ltr" /></label><label>پینترست (https://)<input name="pinterest" value="${s.social.pinterest ?? ''}" dir="ltr" /></label></div>
    <label>توضیح برند<textarea name="brandDescription">${s.brandDescription}</textarea></label><label>اطلاعات ارسال<textarea name="shippingInfo">${s.shippingInfo}</textarea></label>
    <h3>سفارش سفارشی</h3><div class="grid2"><label class="chk"><input type="checkbox" name="coOn" ${o.enabled ? html`checked` : ''}/>فعال</label>${field('قیمت پایه', 'coBase', o.basePrice)}${field('برچسب بسته‌بندی هدیه', 'giftLabel', o.giftPackaging.label)}${field('هزینه بسته‌بندی هدیه', 'giftExtra', o.giftPackaging.extra)}</div>
    <label>گزینه‌ها (JSON: هر گروه آرایه‌ای از {label, extra})<textarea class="code" name="groups">${JSON.stringify(o.groups, null, 2)}</textarea></label>
    <p><button class="btn primary" type="submit">ذخیره تنظیمات</button></p></form>`;
}

function paint() {
  if (!user) return;
  const body = tab === 'overview' ? overview() : tab === 'products' ? productsView() : tab === 'homepage' ? homeView() : settingsView();
  mount(root, shell(body));
  hydrate();
}
function loginView(msg = '') {
  mount(root, html`<form class="login panel" data-form="login"><h1>پنل مدیریت</h1>
    <p class="muted">توکن GitHub خودتان را وارد کنید. توکن فقط در حافظه همین تب می‌ماند و فقط به api.github.com ارسال می‌شود.</p>
    ${msg ? html`<p class="errors" role="alert">${msg}</p>` : ''}
    <label>توکن GitHub (Fine-grained)<input type="password" name="token" autocomplete="off" required dir="ltr" /></label>
    <label>مخزن خصوصی داده (owner/name)<input name="repo" value="${DEFAULT_DATA_REPO}" placeholder="USERNAME/candle-data" required dir="ltr" /></label>
    <p><button class="btn primary" type="submit">ورود</button></p></form>`);
}
async function login(token: string, repo: string) {
  if (!REPO_RE.test(repo)) throw new Error('نام مخزن باید به شکل owner/name باشد.');
  creds = { token, repo };
  try {
    user = ((await (await gh('/user')).json()) as { login: string }).login;
    const r = (await (await gh(R())).json()) as { private: boolean; permissions?: { push?: boolean } };
    if (!r.private) throw new Error('این مخزن عمومی است. داده‌ها باید در یک مخزن خصوصی باشند.');
    if (!r.permissions?.push) throw new Error('توکن اجازه نوشتن روی این مخزن را ندارد.');
    await loadAll();
    if (createdFiles.length) setTimeout(() => note(`فایل‌های اولیه در مخزن ساخته شد: ${createdFiles.join('، ')}`), 300);
  } catch (e) { creds = null; user = ''; throw e; }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds));
}

/* ---------- actions ---------- */
const newProduct = (): Product => ({ id: `candle-${String(db.products!.content.length + 1).padStart(3, '0')}`, name: '', description: '', price: NaN, discountPrice: null, category: db.categories!.content[0]?.id ?? '', images: [], imageAlts: [], fragrance: '', size: '', waxType: '', burningDuration: '', available: true, featured: false, isNew: true, bestSeller: false, specs: {}, createdAt: new Date().toISOString() });
const syncProduct = () => { const f = $<HTMLFormElement>('form[data-form=product]'); if (f && editing) editing.p = readProduct(f, editing.p); };
const syncHome = () => { const f = $<HTMLFormElement>('form[data-form=home]'); if (f && hp) { const keep = errors; hp = readHome(f, hp); if (keep.length) errors = keep; } };

function moveImg(i: number, d: number) {
  syncProduct();
  const p = editing!.p, a = p.imageAlts ?? [];
  const j = i + d;
  if (j < 0 || j >= p.images.length) return;
  [p.images[i], p.images[j]] = [p.images[j] as string, p.images[i] as string];
  [a[i], a[j]] = [a[j] ?? '', a[i] ?? ''];
  dirty = true; paint();
}

const actions: Record<string, (el: HTMLElement) => Promise<void> | void> = {
  tab: (el) => { if (!leave()) return; tab = el.dataset.id as Tab; editing = null; hp = null; errors = []; paint(); },
  reload: async () => { dirty = false; await loadAll(); hp = null; editing = null; errors = []; paint(); note('بازخوانی شد.'); },
  logout: () => { creds = null; user = ''; sessionStorage.removeItem(SESSION_KEY); previews.forEach((u) => URL.revokeObjectURL(u)); previews.clear(); loginView(); },
  new: () => { editing = { p: newProduct(), isNew: true, orig: [] }; errors = []; paint(); },
  edit: (el) => { const p = db.products!.content.find((x) => x.id === el.dataset.id); if (p) { editing = { p: structuredClone(p), isNew: false, orig: [...p.images] }; errors = []; paint(); } },
  cancel: () => { if (!leave()) return; editing = null; errors = []; paint(); },
  del: async (el) => {
    const id = el.dataset.id!;
    const p = db.products!.content.find((x) => x.id === id);
    if (!p || !confirm(`محصول «${p.name}» حذف شود؟ این کار در مخزن GitHub ثبت می‌شود.`)) return;
    await save('products', db.products!.content.filter((x) => x.id !== id));
    const hpd = db.homepage!.content;
    if (hpd.featuredIds.includes(id)) await save('homepage', { ...hpd, featuredIds: hpd.featuredIds.filter((x) => x !== id) });
    await Promise.all(p.images.filter((i) => !i.endsWith('.svg')).map((i) => removeImage(i)));
    paint(); note('محصول حذف شد. انتشار سایت چند دقیقه طول می‌کشد.');
  },
  dup: (el) => {
    const o = db.products!.content.find((x) => x.id === el.dataset.id);
    if (!o) return;
    let id = `${o.id}-copy`; let n = 2;
    while (db.products!.content.some((x) => x.id === id)) id = `${o.id}-copy-${n++}`;
    editing = { p: { ...structuredClone(o), id, name: `${o.name} (کپی)`, isNew: true, available: false, createdAt: new Date().toISOString() }, isNew: true, orig: [] };
    errors = []; paint();
  },
  deploy: async () => { pendingWarn = ''; await publish(); await loadRun(); paint(); note('درخواست انتشار ارسال شد.'); },
  backup: () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), products: db.products!.content, categories: db.categories!.content, homepage: db.homepage!.content, settings: db.settings!.content }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `candle-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); note('فایل پشتیبان دانلود شد.');
  },
  toggle: async (el) => {
    await save('products', db.products!.content.map((p) => (p.id === el.dataset.id ? { ...p, available: !p.available } : p)));
    paint(); note('وضعیت موجودی تغییر کرد.');
  },
  dup: (el) => {
    const p = db.products!.content.find((x) => x.id === el.dataset.id);
    if (!p) return;
    const ids = new Set(db.products!.content.map((x) => x.id));
    let id = `${p.id}-copy`, n = 2;
    while (ids.has(id)) id = `${p.id}-copy-${n++}`;
    editing = { p: { ...structuredClone(p), id, name: `${p.name} (کپی)`, createdAt: new Date().toISOString() }, isNew: true, orig: [] };
    tab = 'products'; dirty = true; errors = []; paint();
  },
  export: () => { exportBackup(); note('فایل پشتیبان دانلود شد.'); },
  deploynow: async () => { await publish(); await loadDeploy(); paint(); note('درخواست انتشار ارسال شد.'); },
  refreshdeploy: async () => { await loadDeploy(); paint(); },
  mainimg: (el) => { syncProduct(); const i = Number(el.dataset.id); const p = editing!.p; p.images.unshift(...p.images.splice(i, 1)); const a = p.imageAlts ?? []; a.unshift(...a.splice(i, 1)); dirty = true; paint(); },
  upimg: (el) => { moveImg(Number(el.dataset.id), -1); },
  downimg: (el) => { moveImg(Number(el.dataset.id), 1); },
  addcat: () => { const l = db.categories!.content; l.push({ id: `category-${l.length + 1}`, name: 'دسته جدید' }); paint(); },
  addbanner: () => { syncHome(); hp!.banners.push({ title: 'بنر جدید', text: '', link: '#/shop' }); paint(); },
  rmbanner: (el) => { syncHome(); hp!.banners.splice(Number(el.dataset.id), 1); paint(); },
};

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  const act = el?.dataset.act;
  if (!el || !act) return;
  if (act === 'rmimg') { syncProduct(); editing!.p.images.splice(Number(el.dataset.id), 1); editing!.p.imageAlts?.splice(Number(el.dataset.id), 1); paint(); return; }
  Promise.resolve(actions[act]?.(el)).catch(fail);
});

root.addEventListener('change', (e) => {
  const inp = e.target as HTMLInputElement;
  const kind = inp.dataset.upload;
  const file = inp.files?.[0];
  const tg = inp.dataset.tg as 'available' | 'featured' | undefined;
  if (tg && inp.dataset.id) {
    const id = inp.dataset.id;
    (async () => {
      await save('products', db.products!.content.map((x) => (x.id === id ? ({ ...x, [tg]: inp.checked } as Product) : x)));
      note('ذخیره شد. انتشار چند دقیقه طول می‌کشد.');
    })().catch((x) => { fail(x); paint(); });
    return;
  }
  if (!kind || !file) return;
  (async () => {
    note('در حال بهینه‌سازی و بارگذاری تصویر…');
    if (kind === 'product') { syncProduct(); const p = editing!.p; if (p.images.length >= 8) throw new Error('حداکثر ۸ تصویر.'); p.images.push(await upload(file, 'products', p.id || p.name)); p.imageAlts = [...(p.imageAlts ?? []), ''];
    } else if (kind === 'hero') { syncHome(); hp!.heroImage = await upload(file, 'banners', 'hero');
    } else { syncHome(); const b = hp!.banners[Number(inp.dataset.id)]; if (b) b.image = await upload(file, 'banners', b.title); }
    paint(); note('تصویر بارگذاری شد. با ذخیره فرم، تغییر نهایی می‌شود.');
  })().catch(fail);
});

root.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.f) {
    if (t.dataset.f === 'q') q = t.value; else if (t.dataset.f === 'cat') fcat = t.value; else sortBy = t.value as typeof sortBy;
    mount($('#prow')!, productRows()); hydrate(); return;
  }
  const f = t.closest<HTMLFormElement>('form[data-form=product]');
  if (f && editing) { mount($('#pv')!, pvCard(readProduct(f, editing.p))); hydrate(); }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const f = $<HTMLFormElement>('form[data-form=product], form[data-form=home], form[data-form=settings]');
    if (f) { e.preventDefault(); f.requestSubmit(); }
  }
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  (async () => {
    errors = [];
    const kind = f.dataset.form;
    if (kind === 'login') {
      try { await login(val(f, 'token').trim(), val(f, 'repo').trim()); paint(); }
      catch (e) { loginView(e instanceof Error ? e.message : 'ورود ناموفق بود.'); }
      return;
    }
    if (kind === 'product' && editing) {
      const p = readProduct(f, editing.p);
      if (p.discountPrice === null || Number.isNaN(p.discountPrice)) p.discountPrice = null;
      const list = editing.isNew ? [...db.products!.content, p] : db.products!.content.map((x) => (x.id === p.id ? p : x));
      errors = [...validateProduct(p), ...(validateProducts(list).filter((m) => m.includes('تکراری')))];
      if (errors.length) return paint();
      await save('products', list);
      const gone = editing.orig.filter((i) => !p.images.includes(i) && !i.endsWith('.svg'));
      await Promise.all(gone.map((i) => removeImage(i)));
      dirty = false; editing = null; paint(); note('ذخیره شد. انتشار سایت چند دقیقه طول می‌کشد.');
    } else if (kind === 'cats') {
      const list: Category[] = db.categories!.content.map((_, i) => {
        const c: Category = { id: val(f, `cid${i}`).trim(), name: val(f, `cn${i}`).trim() };
        const d = val(f, `cd${i}`).trim(); const im = val(f, `ci${i}`).trim();
        if (d) c.description = d;
        if (im) c.image = im;
        return c;
      });
      errors = validateCategories(list);
      if (errors.length) return paint();
      await save('categories', list); paint(); dirty = false; note('دسته‌بندی‌ها ذخیره شد.');
    } else if (kind === 'home' && hp) {
      const h = readHome(f, hp);
      errors = [...errors, ...validateHomepage(h)];
      if (errors.length) { hp = h; return paint(); }
      await save('homepage', h); hp = null; paint(); dirty = false; note('صفحه اصلی ذخیره شد.');
    } else if (kind === 'settings') {
      const cur = db.settings!.content;
      let groups: Settings['customOrder']['groups'];
      try { groups = JSON.parse(val(f, 'groups')) as typeof groups; } catch { errors = ['JSON گزینه‌های سفارش سفارشی معتبر نیست.']; return paint(); }
      const s: Settings = {
        ...cur, telegramUsername: val(f, 'tg').trim().replace(/^@/, ''), brandName: val(f, 'brandName').trim(), brandDescription: val(f, 'brandDescription').trim(),
        currency: val(f, 'currency').trim(), shippingInfo: val(f, 'shippingInfo').trim(),
        contact: { email: val(f, 'email').trim(), phone: val(f, 'phone').trim(), address: val(f, 'address').trim() },
        social: { instagram: val(f, 'instagram').trim(), telegramChannel: val(f, 'telegramChannel').trim(), pinterest: val(f, 'pinterest').trim() },
        customOrder: { enabled: chk(f, 'coOn'), basePrice: num(val(f, 'coBase')) ?? 0, groups, giftPackaging: { label: val(f, 'giftLabel').trim(), extra: num(val(f, 'giftExtra')) ?? 0 } },
      };
      errors = validateSettings(s);
      if (errors.length) return paint();
      await save('settings', s); paint(); dirty = false; note('تنظیمات ذخیره شد.');
    }
  })().catch((x) => { fail(x); paint(); });
});

root.addEventListener('input', (e) => {
  const f = (e.target as HTMLElement).closest<HTMLFormElement>('form');
  if (!f) return;
  const kind = f.dataset.form;
  if (kind === 'pfilter') {
    pf = { q: val(f, 'q'), cat: val(f, 'cat'), status: val(f, 'status'), sort: val(f, 'sort') };
    mount($('#ptable')!, productRows()); hydrate();
  } else if (kind === 'product' && editing) {
    editing.p = readProduct(f, editing.p); dirty = true;
    mount($('#pv')!, html`<h3>پیش‌نمایش زنده</h3>${previewPanel(editing.p)}`); hydrate();
  } else if (kind === 'home' && hp) {
    dirty = true;
    mount($('#hv')!, heroPreview({ heroTitle: val(f, 'heroTitle'), heroDescription: val(f, 'heroDescription'), heroImage: hp.heroImage })); hydrate();
  } else if (kind) dirty = true;
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const f = $<HTMLFormElement>('form[data-form=product], form[data-form=home], form[data-form=settings]');
    if (f) { e.preventDefault(); f.requestSubmit(); }
  }
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

async function init() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as { token?: string; repo?: string } | null;
    if (saved?.token && saved.repo) { await login(saved.token, saved.repo); paint(); return; }
  } catch { sessionStorage.removeItem(SESSION_KEY); }
  loginView();
}
void init();
void IMG_RE; void $$;
