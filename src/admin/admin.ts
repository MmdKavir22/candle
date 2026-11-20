import '@fontsource-variable/vazirmatn';
import './admin.css';
import type { Category, DataName, Homepage, Product, Settings } from '../shared/types';
import { validateCategories, validateHomepage, validateProduct, validateProducts, validateSettings, validators, isImageRef, IMG_RE } from '../shared/validate';
import { DEFAULT_TEMPLATE, ORDER_STATUSES, STATUS_LABEL, renderOrderMessage, type Order, type OrderStatus } from '../shared/order';
import { makeFmt } from '../services/orders';
import { DEFAULT_STEPS, PRESETS, SECTION_LABEL, SLOT_LABEL, contrast, resolveHome, resolveMarketing, resolveTheme, slotOf } from '../shared/theme';
import { IMAGE_SLOTS } from '../shared/types';
import { copyText, telegramUrl } from '../services/telegram';
import { toPublicProducts } from '../shared/public';
import { html, mount, raw, $, $$, type Safe } from '../utils/dom';
import { asset, dateFa, faNum, money, onSale, slugify, unitPrice } from '../utils/format';
import { filterProducts, type Filters } from '../utils/catalog';

const ENV_SITE_REPO = import.meta.env.VITE_SITE_REPO ?? '';
let siteRepo = ENV_SITE_REPO; // public site repo: build default, overridable in Advanced settings (saved in private config/repos.json)
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
type Tab = 'overview' | 'products' | 'orders' | 'homepage' | 'appearance' | 'images' | 'advanced';
let tab: Tab = 'overview';
let editing: { p: Product; isNew: boolean; orig: string[] } | null = null;
let hp: Homepage | null = null;
let errors: string[] = [];
let branch = 'main';
let cd: Category[] | null = null; // category form draft: nothing touches saved data until you press save
type OrderRec = { order: Order; sha: string; path: string };
let orders: OrderRec[] | null = null;
let orderOpen: string | null = null;
let of = { status: '', q: '' };
let syncInfo: { changed: number } | null = null;
let sd: Settings | null = null; // settings draft: keeps unsaved edits while buttons re-render the form
const accOpen = new Set<string>(['repos']);
let libCache: string[] | null = null;
let pendingWarn = '';
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
/** Migration source for a file missing in the private repo: what the live site publishes today (validated). Nothing is ever overwritten. */
async function defaultFor(n: DataName): Promise<unknown> {
  try {
    const r = await fetch(asset(`data/${n}.json`), { cache: 'no-store' });
    if (r.ok) { const d: unknown = await r.json(); if (validators[n](d).length === 0) return d; }
  } catch { /* fall through to minimal defaults */ }
  if (n === 'products' || n === 'categories') return [];
  throw new ApiError(0, `داده اولیه ${n}.json پیدا نشد؛ محتوای پوشه data-repo-template را در مخزن داده آپلود کنید.`);
}
let createdFiles: string[] = [];
const parseRepo = (v: string): string | null => { const m = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(v.trim()); return m ? (m[1] as string) : null; };
let repoCfgSha: string | undefined;
async function loadRepoConfig() {
  try {
    const f = await getFile('config/repos.json');
    repoCfgSha = f?.sha;
    const r = f ? parseRepo((JSON.parse(f.text) as { siteRepo?: string }).siteRepo ?? '') : null;
    siteRepo = r ?? ENV_SITE_REPO;
  } catch { siteRepo = ENV_SITE_REPO; }
}
async function saveRepoConfig(repo: string) {
  repoCfgSha = await putFile('config/repos.json', toB64(JSON.stringify({ siteRepo: repo }, null, 2) + '\n'), `admin(${user}): site repository -> ${repo}`, repoCfgSha);
  siteRepo = repo;
}
async function loadAll() {
  const names: DataName[] = ['products', 'categories', 'homepage', 'settings'];
  createdFiles = [];
  for (const n of names) { // sequential: parallel commits to one branch can conflict
    let f = await getFile(`data/${n}.json`);
    if (!f) {
      const content = await defaultFor(n);
      const text = JSON.stringify(content, null, 2) + '\n';
      const sha = await putFile(`data/${n}.json`, toB64(text), `admin(${user}): create ${n}.json`);
      const back = await getFile(`data/${n}.json`); // verify the migrated copy before the app switches to it
      if (!back || JSON.stringify(JSON.parse(back.text)) !== JSON.stringify(content)) throw new ApiError(0, `تأیید مهاجرت ${n}.json ناموفق بود؛ هیچ داده‌ای حذف نشد.`);
      f = { sha, text: back.text };
      createdFiles.push(`${n}.json`);
    }
    (db as Record<string, unknown>)[n] = { content: JSON.parse(f.text), sha: f.sha };
  }
  await loadRepoConfig();
  await Promise.all([loadHistory(), loadDeploy(), checkSync()]);
}
/** Ask the public site repo to rebuild so changes go live (needs Actions: write on the site repo). */
async function publish() {
  if (!siteRepo) { pendingWarn = 'انتشار خودکار تنظیم نشده؛ workflow سایت را دستی اجرا کنید.'; return; }
  try { await gh(`/repos/${siteRepo}/actions/workflows/deploy.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) }); }
  catch { pendingWarn = 'ذخیره شد اما انتشار خودکار انجام نشد؛ به توکن دسترسی Actions روی مخزن سایت بدهید یا workflow را دستی اجرا کنید.'; }
}
async function save(name: DataName, content: unknown) {
  const doc = db[name] as Doc<unknown>;
  const sha = await putFile(`data/${name}.json`, toB64(JSON.stringify(content, null, 2) + '\n'), `admin(${user}): update ${name}.json`, doc.sha);
  (db as Record<string, unknown>)[name] = { content, sha };
  await Promise.all([loadHistory(), publish()]);
  setTimeout(() => { void Promise.all([loadDeploy(), checkSync()]).then(() => { if (tab === 'overview' && !editing && user) paint(); }); }, 5000);
}

/* ---------- private-repo image previews ---------- */
const MIME: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml' };
const previews = new Map<string, string>();
async function imgSrc(path: string): Promise<string> {
  if (/^https:\/\//.test(path)) return path;
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
    const used = JSON.stringify([db.products?.content, db.homepage?.content, db.categories?.content, db.settings?.content]);
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
    published: chk(f, 'published') ? undefined : false, costPrice: num(val(f, 'costPrice')) ?? undefined,
    supplier: val(f, 'supplier').trim() || undefined, internalNote: val(f, 'internalNote').trim() || undefined,
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
  if (!siteRepo) return;
  try {
    const j = (await (await gh(`/repos/${siteRepo}/actions/workflows/deploy.yml/runs?per_page=1`)).json()) as { workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[] };
    const r = j.workflow_runs[0];
    deploy = r ? { status: r.status, conclusion: r.conclusion, url: r.html_url, at: r.created_at } : null;
  } catch { deploy = null; }
}

function health(): { ok: boolean; text: string; tab?: Tab }[] {
  const ps = db.products!.content, s = db.settings!.content, h = db.homepage!.content, c = s.contact;
  const noAlt = ps.filter((p) => p.images.some((_, i) => !p.imageAlts?.[i]?.trim())).length;
  const short = ps.filter((p) => p.description.trim().length < 40).length;
  return [
    { ok: s.telegramUsername !== 'YOUR_TELEGRAM_USERNAME', text: 'نام کاربری تلگرام واقعی تنظیم شده است', tab: 'advanced' },
    { ok: ps.length > 0, text: 'حداقل یک محصول ثبت شده است', tab: 'products' },
    { ok: noAlt === 0, text: noAlt ? `${faNum(noAlt)} محصول تصویر بدون متن جایگزین (alt) دارد` : 'همه تصاویر متن جایگزین دارند', tab: 'products' },
    { ok: short === 0, text: short ? `${faNum(short)} محصول توضیحات کوتاه دارد (بهتر است ۴۰ نویسه یا بیشتر)` : 'توضیحات محصولات کافی است', tab: 'products' },
    { ok: h.featuredIds.length > 0, text: 'محصولات ویژه صفحه اصلی انتخاب شده‌اند', tab: 'homepage' },
    { ok: !!(c.phone || c.email || c.address), text: 'حداقل یک راه تماس ثبت شده است', tab: 'advanced' },
    { ok: !!s.shippingInfo.trim(), text: 'اطلاعات ارسال نوشته شده است', tab: 'advanced' },
    { ok: !!siteRepo, text: 'مخزن عمومی سایت تنظیم شده است (برای انتشار خودکار)', tab: 'advanced' },
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
  const T: [Tab, string, string][] = [['overview', '◈', 'نمای کلی'], ['products', '▣', 'محصولات'], ['orders', '☰', 'سفارش‌ها'], ['homepage', '⌂', 'صفحه اصلی'], ['appearance', '✦', 'ظاهر سایت'], ['images', '▤', 'تصاویر'], ['advanced', '⚙', 'تنظیمات پیشرفته']];
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
    ${quickSetup()}
    ${repoCards()}
    <div class="cols2">
      <div class="panel"><h2>انتشار سایت</h2><p><span class="pill ${dep[1]}">${dep[0]}</span> ${deploy ? html`<span class="muted">${dateFa(deploy.at)}</span> <a href="${deploy.url}" target="_blank" rel="noopener">جزئیات ↗</a>` : ''}</p>
        ${syncPill()}<div class="row-actions"><button class="btn primary sm" type="button" data-act="deploynow">انتشار دستی</button><button class="btn ghost sm" type="button" data-act="refreshdeploy">بروزرسانی وضعیت</button><button class="btn ghost sm" type="button" data-act="new">+ محصول جدید</button><button class="btn ghost sm" type="button" data-act="export">دانلود پشتیبان JSON</button></div></div>
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
  else if (pf.status === 'draft') l = l.filter((p) => p.published === false);
  if (pf.sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  return l;
}

function productRows(): Safe {
  const cats = db.categories!.content, cur = db.settings!.content.currency;
  const l = filtered();
  return html`<p class="muted">${faNum(l.length)} از ${faNum(db.products!.content.length)} محصول</p><div class="tbl"><table><thead><tr><th></th><th>نام</th><th>دسته</th><th>قیمت</th><th>موجودی</th><th></th></tr></thead><tbody>
    ${l.length ? l.map((p) => html`<tr><td><img class="thumb" data-p="${p.images[0] ?? ''}" alt="" /></td>
      <td><strong>${p.name}</strong><br /><small class="muted" dir="ltr">${p.id}</small> ${p.published === false ? html`<span class="tag draft">پیش‌نویس</span>` : ''}${p.featured ? html`<span class="tag">ویژه</span>` : ''}${p.isNew ? html`<span class="tag">جدید</span>` : ''}${p.bestSeller ? html`<span class="tag">پرفروش</span>` : ''}</td>
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
      <label>وضعیت<select name="status">${[['', 'همه'], ['in', 'موجود'], ['out', 'ناموجود'], ['feat', 'ویژه'], ['sale', 'تخفیف‌دار'], ['draft', 'پیش‌نویس']].map(([v, t]) => html`<option value="${v}" ${v === pf.status ? html`selected` : ''}>${t}</option>`)}</select></label>
      <label>مرتب‌سازی<select name="sort">${[['new', 'جدیدترین'], ['name', 'نام'], ['asc', 'ارزان‌ترین'], ['desc', 'گران‌ترین']].map(([v, t]) => html`<option value="${v}" ${v === pf.sort ? html`selected` : ''}>${t}</option>`)}</select></label>
      <button class="btn primary" type="button" data-act="new">+ افزودن محصول</button></form>
    ${syncPill()}<div class="panel" id="ptable">${productRows()}</div>
    <form class="panel" data-form="cats"><h2>دسته‌بندی‌ها</h2>
    ${(cd ?? cats).map((c, i) => html`<div class="catrow"><div class="grid2">
      <label>نام<input name="cn${i}" value="${c.name}" maxlength="60" required /></label>
      <label>توضیح<input name="cd${i}" value="${c.description ?? ''}" maxlength="200" /></label>
      <label>شناسه ${cats.some((x) => x.id === c.id) ? '(ثابت)' : '(خودکار؛ اختیاری)'}<input name="cid${i}" value="${c.id}" dir="ltr" ${cats.some((x) => x.id === c.id) ? html`readonly` : ''} placeholder="از نام ساخته می‌شود" /></label>
      <label>تصویر (مسیر یا لینک https)<input name="ci${i}" value="${c.image ?? ''}" dir="ltr" /></label></div>
      <div class="imgrow">${c.image ? html`<img data-p="${c.image}" alt="" />` : html`<span></span>`}<label>بارگذاری تصویر دسته<input type="file" data-upload="cat" data-id="${i}" accept="image/jpeg,image/png,image/webp" /></label><button class="btn danger sm" type="button" data-act="delcat" data-id="${i}">حذف دسته</button></div></div>`)}
    <div class="row-actions"><button class="btn ghost sm" type="button" data-act="addcat">+ افزودن دسته</button><button class="btn primary sm" type="submit">ذخیره دسته‌بندی‌ها</button></div></form>`;
}

function previewPanel(p: Product): Safe {
  const cur = db.settings!.content.currency, brand = db.settings!.content.brandName;
  const sale = Number.isFinite(p.price) && p.discountPrice !== null && !Number.isNaN(p.discountPrice) && p.discountPrice < p.price;
  const pct = sale ? Math.round((1 - (p.discountPrice as number) / p.price) * 100) : 0;
  const title = `${p.name || 'نام محصول'} | ${brand}`;
  const tl = title.length, dl = p.description.length;
  return html`<div class="pvcard"><div class="pvimg">${p.images[0] ? html`<img data-p="${p.images[0]}" alt="" />` : html`<span class="muted">بدون تصویر</span>`}${sale ? html`<b class="pct">٪${faNum(pct)}</b>` : ''}${p.published === false ? html`<b class="pct off">پیش‌نویس</b>` : !p.available ? html`<b class="pct off">ناموجود</b>` : ''}</div>
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
    <div class="privbox"><h3>🔒 اطلاعات خصوصی <small class="muted">(فقط در مخزن خصوصی می‌ماند و هرگز در سایت منتشر نمی‌شود)</small></h3>
      <div class="grid2"><label class="chk"><input type="checkbox" name="published" ${p.published === false ? '' : html`checked`} />نمایش در سایت <small class="muted">(خاموش = پیش‌نویس؛ در سایت دیده نمی‌شود)</small></label>${field('قیمت تمام‌شده (خصوصی)', 'costPrice', p.costPrice ?? '', 'inputmode="numeric"')}${field('تأمین‌کننده (خصوصی)', 'supplier', p.supplier ?? '', 'maxlength="120"')}</div>
      <label>یادداشت داخلی (خصوصی)<textarea name="internalNote" maxlength="500">${p.internalNote ?? ''}</textarea></label></div>
    <h3>تصاویر (۱ تا ۸؛ اولی تصویر اصلی است)</h3>
    ${p.images.map((src, i) => html`<div class="imgrow"><img data-p="${src}" alt="" /><label>متن جایگزین (alt)<input name="alt${i}" value="${p.imageAlts?.[i] ?? ''}" maxlength="160" /></label><div class="row-actions">${i > 0 ? html`<button class="btn ghost sm" type="button" data-act="mainimg" data-id="${i}">اصلی</button><button class="btn ghost sm" type="button" data-act="upimg" data-id="${i}" aria-label="بالا">↑</button>` : ''}${i < p.images.length - 1 ? html`<button class="btn ghost sm" type="button" data-act="downimg" data-id="${i}" aria-label="پایین">↓</button>` : ''}<button class="btn danger sm" type="button" data-act="rmimg" data-id="${i}">حذف</button></div></div>`)}
    <label>افزودن تصویر (JPG, PNG, WebP)<input type="file" data-upload="product" accept="image/jpeg,image/png,image/webp" /></label>
    <div class="urlrow"><label>یا لینک تصویر (https://)<input name="imgurl" dir="ltr" placeholder="https://example.com/photo.jpg" /></label><button class="btn ghost sm" type="button" data-act="addurl">افزودن لینک</button></div>
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

/* ---------- settings: generic data-path binding, draft, defaults ---------- */
type Rec = Record<string, unknown>;
const cur = (): Settings => sd ?? db.settings!.content;
function getPath(o: unknown, p: string): unknown { return p.split('.').reduce<unknown>((a, k) => (a == null ? undefined : (a as Rec)[k]), o); }
function setPath(o: Rec, path: string, v: unknown) {
  const ks = path.split('.');
  let a = o;
  ks.forEach((k, i) => {
    if (i === ks.length - 1) { a[k] = v; return; }
    if (typeof a[k] !== 'object' || a[k] === null) a[k] = /^\d+$/.test(ks[i + 1] as string) ? [] : {};
    a = a[k] as Rec;
  });
}
function applyPaths(f: HTMLFormElement, obj: Rec) {
  const els = Array.from(f.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-path]'));
  for (const pre of ['home.sections', 'home.benefits', 'home.steps']) if (els.some((e) => (e.dataset.path ?? '').startsWith(`${pre}.`))) setPath(obj, pre, []);
  els.forEach((el) => {
    const path = el.dataset.path as string;
    const t = el instanceof HTMLInputElement ? el.type : '';
    setPath(obj, path, t === 'checkbox' ? (el as HTMLInputElement).checked : t === 'number' || t === 'range' || el.dataset.num !== undefined ? Number(el.value) : el.value.trim());
  });
}
/** Optional blocks must exist (with all fields) before individual paths are written into them. */
function ensureDefaults(s: Settings): Settings {
  s.banner ??= { enabled: false, text: '', link: '', bg: '#A9D6E5', color: '#263746' };
  s.wallpaper ??= { enabled: false, image: '', color: '', overlay: 0.7 };
  s.orders ??= { enabled: true, requireAddress: false, messageTemplate: DEFAULT_TEMPLATE };
  return s;
}
function finalize(s: Settings): Settings {
  s.theme = resolveTheme(s); s.home = resolveHome(s); s.marketing = resolveMarketing(s);
  s.images ??= {};
  return s;
}
function applyPreset(s: Settings, id: string) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  const t = resolveTheme(s);
  s.theme = { ...t, colors: { ...p.colors }, bg: { ...t.bg, color: p.bg.color, color2: p.bg.color2 } };
}
function syncSettings() {
  const f = $<HTMLFormElement>('form[data-form=settings], form[data-form=design]');
  if (!f) return;
  try {
    if (f.dataset.form === 'design') { const d = ensureDefaults(structuredClone(cur())); applyPaths(f, d as unknown as Rec); sd = finalize(d); } else sd = buildSettings(f, cur());
  } catch { /* keep the previous draft */ }
}
const acc = (id: string) => raw(`data-acc="${id}" ${accOpen.has(id) ? 'open' : ''}`);
const inp = (path: string, label: string, v: string | number, type = 'text', attrs = '') => html`<label>${label}<input data-path="${path}" type="${type}" value="${v}" ${raw(attrs)} /></label>`;
const chkp = (path: string, label: string, v: boolean) => html`<label class="chk"><input type="checkbox" data-path="${path}" ${v ? html`checked` : ''} />${label}</label>`;
const clr = (path: string, label: string, v: string) => html`<label>${label}<input type="color" data-path="${path}" value="${v}" /></label>`;
const rng = (path: string, label: string, v: number, min: number, max: number, step: number) => html`<label>${label} <output>${v}</output><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${v}" /></label>`;
const isoLocal = (iso: string) => { const d = iso ? new Date(iso) : null; if (!d || Number.isNaN(d.getTime())) return ''; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function repoCards(): Safe {
  const priv = creds?.repo ?? '', pub = siteRepo;
  const link = (r: string) => (r ? html`<a href="https://github.com/${r}" target="_blank" rel="noopener noreferrer" dir="ltr">${r}</a>` : html`<span class="muted">تنظیم نشده</span>`);
  return html`<div class="cols2"><div class="panel repo"><h3>🌐 مخزن عمومی (سایت)</h3><p>${link(pub)}</p><p class="muted">خود سایت؛ همه می‌توانند ببینند.</p></div>
    <div class="panel repo"><h3>🔒 مخزن خصوصی (داده‌ها)</h3><p>${link(priv)}</p><p class="muted">محصولات، سفارش‌ها و اطلاعات مشتری؛ فقط شما.</p></div></div>`;
}
function quickSetup(): Safe {
  const s = ensureDefaults(structuredClone(db.settings!.content));
  const mk = resolveMarketing(s), t = resolveTheme(s);
  return html`<form class="panel quick" data-form="quick"><h2>⚡ تنظیمات اولیه و مهم</h2><p class="muted">مهم‌ترین چیزها همین‌جاست. جزئیات بیشتر در «تنظیمات بیشتر».</p>
    <div class="grid2">${inp('brandName', 'نام فروشگاه', s.brandName, 'text', 'required maxlength="60"')}
      <label>یوزرنیم تلگرام (بدون @؛ سفارش‌ها به این آدرس می‌رود)<input data-path="telegramUsername" value="${s.telegramUsername}" dir="ltr" required /><small><a href="https://t.me/${s.telegramUsername}" target="_blank" rel="noopener noreferrer">تست لینک ↗</a></small></label>
      ${inp('currency', 'واحد پول', s.currency, 'text', 'required maxlength="20"')}${inp('shippingInfo', 'توضیح کوتاه ارسال', s.shippingInfo, 'text', 'maxlength="600"')}</div>
    <div class="checks">${chkp('orders.enabled', 'ثبت و ذخیره سفارش از سایت', s.orders!.enabled)}${chkp('banner.enabled', 'اطلاعیه بالای سایت', s.banner!.enabled)}${chkp('marketing.stickyCta', 'دکمه شناور تلگرام', mk.stickyCta)}${chkp('theme.glass.enabled', 'ظاهر شیشه‌ای', t.glass.enabled)}${chkp('marketing.freeShipping.enabled', 'نوار ارسال رایگان در سبد', mk.freeShipping.enabled)}</div>
    <div class="grid2">${inp('banner.text', 'متن اطلاعیه بالای سایت', s.banner!.text, 'text', 'maxlength="200"')}${inp('marketing.freeShipping.threshold', `حداقل خرید برای ارسال رایگان (${s.currency})`, mk.freeShipping.threshold, 'number', 'min="0" step="1000"')}</div>
    <h3>پالت رنگ سایت (اختیاری)</h3><div class="presets">${PRESETS.map((p) => html`<label class="chipbtn"><input type="radio" name="preset" value="${p.id}" /><span class="sw"><i style="background:${p.colors.primary}"></i><i style="background:${p.colors.accent}"></i><i style="background:${p.colors.accentInk}"></i></span>${p.label}</label>`)}</div>
    <p><button class="btn primary" type="submit">ذخیره تنظیمات اولیه</button></p></form>`;
}

function secRepos(): Safe {
  const priv = creds?.repo ?? '', pub = siteRepo;
  const row = (r: string) => (r ? html`<p><a href="https://github.com/${r}" target="_blank" rel="noopener noreferrer" dir="ltr">${r}</a> <button class="link" type="button" data-act="copyrepo" data-id="${r}">کپی</button></p>` : html`<p class="muted">آدرس تنظیم نشده است (متغیر VITE_SITE_REPO هنگام build).</p>`);
  return html`<details class="acc" ${acc('repos')}><summary>🔗 مخازن گیت‌هاب: هر کدام برای چیست؟</summary>
    <p class="muted">پروژه از دو مخزن جدا استفاده می‌کند تا اطلاعات فروشگاه و مشتری‌ها دیده نشود.</p>
    <div class="cols2"><div class="repo"><h3>🌐 مخزن عمومی — خود سایت</h3>${row(pub)}
      <ul><li>کد سایت و فایل‌های عمومی؛ GitHub Pages از همین‌جا منتشر می‌کند</li><li>همه می‌توانند آن را ببینند</li><li>هرگز اطلاعات مشتری، سفارش یا توکن در آن نگذارید</li><li>Secretها: <bdi dir="ltr">DATA_REPO</bdi> و <bdi dir="ltr">DATA_REPO_TOKEN</bdi> (فقط برای خواندن داده‌ها هنگام انتشار)</li></ul></div>
    <div class="repo"><h3>🔒 مخزن خصوصی — داده‌ها</h3>${row(priv)}
      <ul><li>محصولات، دسته‌ها، تنظیمات و تصاویر آپلودشده</li><li>سفارش‌ها و اطلاعات مشتری (پوشه orders)</li><li>فقط شما با توکن به آن دسترسی دارید؛ این پنل فقط روی همین مخزن می‌نویسد</li><li>هنگام انتشار، سایت محصولات و تصاویر را از اینجا می‌خواند؛ پوشه orders هرگز وارد سایت نمی‌شود</li></ul></div></div>
    <p class="notice">مسیر داده: پنل ← مخزن خصوصی ← (Action با Secret) ← مخزن عمومی ← سایت. سفارش مشتری از طریق Worker مستقیم به مخزن خصوصی می‌رود.</p></details>`;
}
function secTheme(): Safe {
  const t = resolveTheme(cur()), c = t.colors;
  const warn = (a: string, b: string, l: string) => (contrast(a, b) < 4.5 ? html`<p class="warnc">⚠ خوانایی کم (${contrast(a, b).toFixed(1)} از ۴٫۵): ${l}</p>` : '');
  return html`<details class="acc" ${acc('theme')}><summary>🎨 ظاهر و رنگ‌ها</summary>
    <p class="muted">پالت آماده انتخاب کنید یا رنگ‌ها را خودتان تنظیم کنید. پیش‌نمایش زنده پایین است.</p>
    <div class="presets">${PRESETS.map((p) => html`<button type="button" class="chipbtn" data-act="preset" data-id="${p.id}"><span class="sw"><i style="background:${p.colors.primary}"></i><i style="background:${p.colors.accent}"></i><i style="background:${p.colors.accentInk}"></i></span>${p.label}</button>`)}</div>
    <div class="grid2">${clr('theme.colors.primary', 'رنگ اصلی', c.primary)}${clr('theme.colors.secondary', 'رنگ روشن مکمل', c.secondary)}${clr('theme.colors.bg', 'رنگ زمینه', c.bg)}${clr('theme.colors.accent', 'رنگ تأکیدی', c.accent)}${clr('theme.colors.accentInk', 'رنگ تیره (دکمه‌ها و لینک‌ها)', c.accentInk)}${clr('theme.colors.text', 'رنگ متن', c.text)}</div>
    ${warn(c.accentInk, '#FFFFFF', 'رنگ دکمه‌ها با متن سفید')}${warn(c.text, c.bg, 'متن روی زمینه')}
    <div class="grid2">${rng('theme.radius', 'گردی گوشه‌ها', t.radius, 0, 32, 1)}<label>شکل دکمه‌ها<select data-path="theme.buttons"><option value="pill" ${t.buttons === 'pill' ? html`selected` : ''}>گرد کامل</option><option value="rounded" ${t.buttons === 'rounded' ? html`selected` : ''}>گوشه‌گرد</option></select></label>${chkp('theme.motion', 'انیمیشن‌ها', t.motion)}</div>
    <h3>افکت شیشه‌ای</h3><div class="grid2">${chkp('theme.glass.enabled', 'شیشه‌ای روی کارت‌ها، هدر و فوتر', t.glass.enabled)}${rng('theme.glass.blur', 'میزان محو پشت شیشه', t.glass.blur, 0, 30, 1)}${rng('theme.glass.opacity', 'غلظت شیشه (کمتر = شفاف‌تر)', t.glass.opacity, 0.3, 1, 0.02)}</div>
    <div id="themeprev" class="tp"><div class="tp-card"><strong>پیش‌نمایش</strong><p>نمونه کارت شیشه‌ای</p><span class="tp-btn">خرید</span></div></div></details>`;
}
function secBg(): Safe {
  const b = resolveTheme(cur()).bg;
  return html`<details class="acc" ${acc('bg')}><summary>🌈 پس‌زمینه سایت</summary><div class="grid2">
    <label>نوع<select data-path="theme.bg.mode"><option value="gradient" ${b.mode === 'gradient' ? html`selected` : ''}>گرادیان</option><option value="solid" ${b.mode === 'solid' ? html`selected` : ''}>تک‌رنگ</option></select></label>
    ${clr('theme.bg.color', 'رنگ اول', b.color)}${clr('theme.bg.color2', 'رنگ دوم (گرادیان)', b.color2)}${rng('theme.bg.angle', 'زاویه گرادیان', b.angle, 0, 360, 5)}
    ${chkp('theme.bg.blobs', 'لکه‌های نور نرم و متحرک (پشت شیشه زیبا می‌شود)', b.blobs)}${rng('theme.bg.imageBlur', 'محو کردن عکس پس‌زمینه', b.imageBlur, 0, 30, 1)}</div>
    <p class="muted">اگر «تصویر زمینه» را فعال کنید، عکس جایگزین گرادیان می‌شود.</p></details>`;
}
const NO_IMG = ['categories', 'banners'];
function secImages(): Safe {
  const s = cur();
  return html`<details class="acc" ${acc('images')}><summary>🖼 جای تصاویر در سایت</summary>
    <p class="muted">برای هر بخش مشخص کنید عکس نمایش داده شود یا نه، و عکس را انتخاب کنید.</p>
    ${IMAGE_SLOTS.map((k) => { const o = slotOf(s, k); const [label, where] = SLOT_LABEL[k]; return html`<div class="slot"><div><strong>${label}</strong><small class="muted">${where}</small></div>
      <label class="chk"><input type="checkbox" data-path="images.${k}.show" ${o.show ? html`checked` : ''} />نمایش</label><input type="hidden" data-path="images.${k}.image" value="${o.image}" />
      ${NO_IMG.includes(k) ? html`<span></span><span></span>` : html`<div class="slotimg">${o.image ? html`<img data-p="${o.image}" alt="" />` : html`<span class="muted">بدون تصویر</span>`}</div>
      <div class="row-actions"><button class="btn ghost sm" type="button" data-act="pickslot" data-id="${k}">انتخاب تصویر</button>${o.image ? html`<button class="btn danger sm" type="button" data-act="clearslot" data-id="${k}">حذف</button>` : ''}</div>`}</div>`; })}</details>`;
}
function secHome(): Safe {
  const h = resolveHome(cur());
  return html`<details class="acc" ${acc('home')}><summary>🏠 بخش‌های صفحه اصلی و جذب مشتری</summary>
    <h3>ترتیب و نمایش بخش‌ها</h3>
    ${h.sections.map((x, i, a) => html`<div class="secrow"><label class="chk"><input type="checkbox" data-path="home.sections.${i}.show" ${x.show ? html`checked` : ''} />${SECTION_LABEL[x.id]}</label><input type="hidden" data-path="home.sections.${i}.id" value="${x.id}" />
      <div class="row-actions"><button class="btn ghost sm" type="button" data-act="secup" data-id="${i}" ${i === 0 ? html`disabled` : ''} aria-label="بالا">↑</button><button class="btn ghost sm" type="button" data-act="secdown" data-id="${i}" ${i === a.length - 1 ? html`disabled` : ''} aria-label="پایین">↓</button></div></div>`)}
    <h3>نوار مزایا</h3><p class="muted">چند مزیت واقعی فروشگاه شما (آیکون، عنوان، توضیح کوتاه). فقط چیزهایی بنویسید که درست است.</p>
    ${h.benefits.map((b, i) => html`<div class="grid2 itemrow">${inp(`home.benefits.${i}.icon`, 'آیکون (ایموجی)', b.icon, 'text', 'maxlength="8"')}${inp(`home.benefits.${i}.title`, 'عنوان', b.title, 'text', 'maxlength="60"')}${inp(`home.benefits.${i}.text`, 'توضیح', b.text, 'text', 'maxlength="160"')}<button class="btn danger sm" type="button" data-act="rmbenefit" data-id="${i}">حذف</button></div>`)}
    <div class="row-actions"><button class="btn ghost sm" type="button" data-act="addbenefit">+ مزیت جدید</button><button class="btn ghost sm" type="button" data-act="benefitpreset">افزودن نمونه‌ها (قابل ویرایش)</button></div>
    <h3>مراحل سفارش</h3>
    ${h.steps.map((st, i) => html`<div class="grid2 itemrow">${inp(`home.steps.${i}.title`, 'عنوان مرحله', st.title, 'text', 'maxlength="60"')}${inp(`home.steps.${i}.text`, 'توضیح', st.text, 'text', 'maxlength="160"')}<button class="btn danger sm" type="button" data-act="rmstep" data-id="${i}">حذف</button></div>`)}
    <div class="row-actions"><button class="btn ghost sm" type="button" data-act="addstep">+ مرحله جدید</button><button class="btn ghost sm" type="button" data-act="resetsteps">بازگشت به پیش‌فرض</button></div>
    <h3>پیشنهاد ویژه با شمارنده</h3><p class="muted">فقط برای تخفیف یا پیشنهاد واقعی با تاریخ پایان درست؛ بعد از پایان خودکار مخفی می‌شود.</p>
    <div class="grid2">${chkp('home.promo.enabled', 'نمایش پیشنهاد ویژه', h.promo.enabled)}${inp('home.promo.title', 'عنوان', h.promo.title, 'text', 'maxlength="80"')}${inp('home.promo.text', 'توضیح', h.promo.text, 'text', 'maxlength="200"')}${inp('home.promo.link', 'لینک (#/shop یا https://)', h.promo.link)}
      <label>پایان پیشنهاد (اختیاری)<input type="datetime-local" name="promoEnd" value="${isoLocal(h.promo.endsAt)}" /></label></div></details>`;
}
function secMarketing(): Safe {
  const m = resolveMarketing(cur());
  return html`<details class="acc" ${acc('mkt')}><summary>📣 جذب و تبدیل مشتری</summary><div class="grid2">
    ${chkp('marketing.freeShipping.enabled', 'نوار پیشرفت ارسال رایگان در سبد خرید', m.freeShipping.enabled)}${inp('marketing.freeShipping.threshold', 'حداقل مبلغ برای ارسال رایگان', m.freeShipping.threshold, 'number', 'min="0" step="1000"')}
    ${chkp('marketing.stickyCta', 'دکمه شناور «پرسش و سفارش در تلگرام»', m.stickyCta)}${chkp('marketing.askOnProduct', 'دکمه «پرسش درباره این محصول» در صفحه محصول', m.askOnProduct)}
    ${chkp('marketing.recentlyViewed', 'بخش «اخیراً دیده‌اید»', m.recentlyViewed)}${chkp('marketing.crossSell', 'پیشنهاد محصولات دیگر در سبد خرید', m.crossSell)}</div>
    <label>یادداشت زیر دکمه خرید در صفحه محصول (مثلاً زمان ارسال)<input data-path="marketing.productNote" value="${m.productNote}" maxlength="200" /></label></details>`;
}

function updateThemePreview() {
  const f = $<HTMLFormElement>('form[data-form=settings], form[data-form=design]'), el = $('#themeprev');
  if (!f || !el) return;
  const tmp = structuredClone(cur());
  applyPaths(f, tmp as unknown as Rec);
  const t = resolveTheme(tmp), c = t.colors;
  const v: Record<string, string> = { '--p': c.primary, '--s': c.secondary, '--a': c.accent, '--ink': c.accentInk, '--t': c.text, '--r': `${t.radius}px`, '--ga': String(t.glass.opacity), '--gb': `${t.glass.enabled ? t.glass.blur : 0}px`,
    '--bgi': t.bg.mode === 'gradient' ? `linear-gradient(${t.bg.angle}deg, ${t.bg.color}, ${t.bg.color2})` : t.bg.color, '--btn': t.buttons === 'pill' ? '99px' : '8px' };
  Object.entries(v).forEach(([k, x]) => el.style.setProperty(k, x));
  el.classList.toggle('blobs', t.bg.blobs);
}

async function listLibrary(force = false): Promise<string[]> {
  if (libCache && !force) return libCache;
  const t = (await (await gh(`${R()}/git/trees/${encodeURIComponent(branch)}?recursive=1`)).json()) as { tree: { path: string; type: string }[] };
  libCache = t.tree.filter((x) => x.type === 'blob' && /^images\/(products|banners|categories)\/.+\.(webp|jpe?g|png)$/.test(x.path)).map((x) => x.path).reverse();
  return libCache;
}
/** Modal image chooser: existing library (private repo), upload, or https URL. Resolves with a path/URL or null. */
function pickImage(dir: 'products' | 'banners' | 'categories'): Promise<string | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'picker';
    document.body.append(dlg);
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
    const showErr = (x: unknown) => { const e = dlg.querySelector<HTMLElement>('[data-picker-err]'); if (e) { e.textContent = x instanceof Error ? x.message : 'خطا'; e.hidden = false; } };
    dlg.addEventListener('cancel', () => finish(null));
    dlg.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const pick = t.closest<HTMLElement>('[data-pick]');
      if (pick?.dataset.pick) return finish(pick.dataset.pick);
      if (t.closest('[data-picker-cancel]') || t === dlg) return finish(null);
      if (t.closest('[data-picker-useurl]')) {
        const u = (dlg.querySelector<HTMLInputElement>('[data-picker-url]')?.value ?? '').trim();
        if (!u.startsWith('https://') || !isImageRef(u)) return showErr(new Error('لینک باید با https:// شروع شود و معتبر باشد.'));
        probe(u).then(() => finish(u)).catch(showErr);
      }
    });
    dlg.addEventListener('change', (e) => {
      const i = e.target as HTMLInputElement;
      const f = i.matches('[data-picker-file]') ? i.files?.[0] : undefined;
      if (f) upload(f, dir, 'image').then((rel) => { libCache = null; finish(rel); }).catch(showErr);
    });
    listLibrary().catch(() => [] as string[]).then((lib) => {
      mount(dlg, html`<h2>انتخاب تصویر</h2>${lib.length ? html`<div class="picker-grid">${lib.slice(0, 60).map((p) => html`<button type="button" class="pick" data-pick="${p}"><img data-p="${p}" alt="" loading="lazy" /></button>`)}</div>` : html`<p class="muted">هنوز تصویری در مخزن خصوصی نیست؛ یکی آپلود کنید.</p>`}
        <div class="grid2"><label>آپلود تصویر جدید<input type="file" data-picker-file accept="image/jpeg,image/png,image/webp" /></label><div class="urlrow"><label>یا لینک تصویر (https)<input data-picker-url dir="ltr" placeholder="https://…" /></label><button class="btn ghost sm" type="button" data-picker-useurl>استفاده</button></div></div>
        <p class="errors" data-picker-err hidden></p><div class="row-actions"><button class="btn ghost" type="button" data-picker-cancel>انصراف</button></div>`);
      hydrate(); dlg.showModal();
    });
  });
}

function buildSettings(f: HTMLFormElement, cur: Settings): Settings {
  let groups: Settings['customOrder']['groups'];
  try { groups = JSON.parse(val(f, 'groups')) as typeof groups; } catch { throw new Error('JSON گزینه‌های سفارش سفارشی معتبر نیست.'); }
  const s: Settings = {
    ...cur, telegramUsername: val(f, 'tg').trim().replace(/^@/, ''), brandName: val(f, 'brandName').trim(), brandDescription: val(f, 'brandDescription').trim(),
    currency: val(f, 'currency').trim(), shippingInfo: val(f, 'shippingInfo').trim(),
    contact: { email: val(f, 'email').trim(), phone: val(f, 'phone').trim(), address: val(f, 'address').trim() },
    social: { instagram: val(f, 'instagram').trim(), telegramChannel: val(f, 'telegramChannel').trim(), pinterest: val(f, 'pinterest').trim() },
    banner: { enabled: chk(f, 'bnOn'), text: val(f, 'bnText').trim(), link: val(f, 'bnLink').trim(), bg: val(f, 'bnBg') || '#A9D6E5', color: val(f, 'bnFg') || '#263746' },
    wallpaper: { enabled: chk(f, 'wpOn'), image: val(f, 'wpImage').trim(), color: val(f, 'wpColor').trim(), overlay: Number(val(f, 'wpOverlay') || 0.7) },
    orders: { enabled: chk(f, 'ordOn'), requireAddress: chk(f, 'ordAddr'), messageTemplate: val(f, 'ordTpl').trim() || DEFAULT_TEMPLATE },
    customOrder: { enabled: chk(f, 'coOn'), basePrice: num(val(f, 'coBase')) ?? 0, groups, giftPackaging: { label: val(f, 'giftLabel').trim(), extra: num(val(f, 'giftExtra')) ?? 0 } },
  };
  const pe = val(f, 'promoEnd');
  if (f.elements.namedItem('promoEnd')) setPath(s as unknown as Rec, 'home.promo.endsAt', pe && !Number.isNaN(Date.parse(pe)) ? new Date(pe).toISOString() : '');
  applyPaths(f, s as unknown as Rec);
  return finalize(s);
}

function settingsView(): Safe {
  const s = cur();
  const o = s.customOrder;
  return html`<form class="panel" data-form="settings"><h1>تنظیمات پیشرفته</h1><p class="muted">تنظیمات اولیه در «نمای کلی»، ظاهر در «ظاهر سایت» و عکس‌ها در «تصاویر» است؛ اینجا جزئیات فنی و تکمیلی است.</p>${secRepos()}${secHome()}${secMarketing()}
    <details class="acc" ${acc('shop')}><summary>🏪 اطلاعات فروشگاه، تماس و شبکه‌ها</summary><div class="grid2">
    <label>نام کاربری تلگرام (بدون @)<input name="tg" value="${s.telegramUsername}" dir="ltr" required /><small><a href="https://t.me/${s.telegramUsername}" target="_blank" rel="noopener noreferrer">تست لینک تلگرام ↗</a></small></label>${field('نام برند', 'brandName', s.brandName, 'required')}${field('واحد پول', 'currency', s.currency, 'required')}
    ${field('ایمیل', 'email', s.contact.email)}${field('تلفن', 'phone', s.contact.phone)}${field('نشانی', 'address', s.contact.address)}
    <label>اینستاگرام (https://)<input name="instagram" value="${s.social.instagram ?? ''}" dir="ltr" /></label><label>کانال تلگرام (https://)<input name="telegramChannel" value="${s.social.telegramChannel ?? ''}" dir="ltr" /></label><label>پینترست (https://)<input name="pinterest" value="${s.social.pinterest ?? ''}" dir="ltr" /></label></div>
    <label>توضیح برند<textarea name="brandDescription">${s.brandDescription}</textarea></label><label>اطلاعات ارسال<textarea name="shippingInfo">${s.shippingInfo}</textarea></label></details>
    ${(() => {
      const b = s.banner ?? { enabled: false, text: '', link: '', bg: '#A9D6E5', color: '#263746' };
      const w = s.wallpaper ?? { enabled: false, image: '', color: '', overlay: 0.7 };
      const od = s.orders ?? { enabled: true, requireAddress: false, messageTemplate: DEFAULT_TEMPLATE };
      return html`<details class="acc" ${acc('banner')}><summary>📢 اطلاعیه بالای سایت</summary><div class="grid2"><label class="chk"><input type="checkbox" name="bnOn" ${b.enabled ? html`checked` : ''}/>نمایش اطلاعیه</label>${field('متن اطلاعیه', 'bnText', b.text, 'maxlength="200"')}
        <label>لینک (اختیاری: #/shop یا https://)<input name="bnLink" value="${b.link}" dir="ltr" /></label><label>رنگ پس‌زمینه<input type="color" name="bnBg" value="${b.bg}" /></label><label>رنگ متن<input type="color" name="bnFg" value="${b.color}" /></label></div>
      </details><details class="acc" ${acc('wall')}><summary>🖼 تصویر زمینه (عکس)</summary><div class="grid2"><label class="chk"><input type="checkbox" name="wpOn" ${w.enabled ? html`checked` : ''}/>فعال</label>
        <label>تصویر (مسیر یا لینک https)<input name="wpImage" value="${w.image}" dir="ltr" /></label><label>بارگذاری تصویر<input type="file" data-upload="wp" accept="image/jpeg,image/png,image/webp" /></label>
        <label>رنگ زمینه (اختیاری، #RRGGBB)<input name="wpColor" value="${w.color}" dir="ltr" placeholder="#F7FBFD" /></label><label>شفافیت لایه سفید روی تصویر (خوانایی متن)<input type="range" name="wpOverlay" min="0" max="0.95" step="0.05" value="${w.overlay}" /></label></div>
      ${w.image ? html`<img class="wpprev" id="wpprev" data-p="${w.image}" alt="" />` : html`<img class="wpprev" id="wpprev" alt="" hidden />`}
      </details><details class="acc" ${acc('orders')}><summary>🧾 ثبت سفارش و قالب پیام</summary><div class="grid2"><label class="chk"><input type="checkbox" name="ordOn" ${od.enabled ? html`checked` : ''}/>ثبت و ذخیره سفارش از سایت</label><label class="chk"><input type="checkbox" name="ordAddr" ${od.requireAddress ? html`checked` : ''}/>نشانی الزامی باشد</label></div>
      <label>قالب پیام سفارش<textarea class="code" name="ordTpl" maxlength="2000">${od.messageTemplate}</textarea></label>
      <p class="muted">متغیرها: <bdi dir="ltr">{{code}} {{name}} {{phone}} {{address}} {{items}} {{total}} {{notes}} {{date}} {{brand}}</bdi></p>
      <div class="summary-box" id="tplprev"></div>`;
    })()}
    </details><details class="acc" ${acc('custom')}><summary>🕯 سفارش سفارشی (شمع دلخواه)</summary><div class="grid2"><label class="chk"><input type="checkbox" name="coOn" ${o.enabled ? html`checked` : ''}/>فعال</label>${field('قیمت پایه', 'coBase', o.basePrice)}${field('برچسب بسته‌بندی هدیه', 'giftLabel', o.giftPackaging.label)}${field('هزینه بسته‌بندی هدیه', 'giftExtra', o.giftPackaging.extra)}</div>
    <label>گزینه‌ها (JSON: هر گروه آرایه‌ای از {label, extra})<textarea class="code" name="groups">${JSON.stringify(o.groups, null, 2)}</textarea></label>
    </details><p class="sticky"><button class="btn primary" type="submit">ذخیره تنظیمات (Ctrl+S)</button></p></form>`;
}

/* ---------- appearance / images tabs (design form: data-path fields only, saved as a whole) ---------- */
const designBar = (): Safe => html`<div class="row-actions sticky"><button class="btn primary" type="submit">ذخیره تغییرات</button><button class="btn ghost" type="button" data-act="cancelchanges">لغو تغییرات</button><button class="btn danger" type="button" data-act="resetdesign">بازگشت به پیش‌فرض</button></div>`;

function appearanceView(): Safe {
  return html`<form class="panel" data-form="design"><h1>ظاهر سایت</h1>
    <p class="muted">رنگ، افکت شیشه‌ای و پس‌زمینه را اینجا تنظیم کنید. پیش‌نمایش نمونه همین‌جاست؛ تا «ذخیره» نزنید روی سایت اثری ندارد.</p>
    ${secTheme()}${secBg()}${designBar()}</form>`;
}

function usageOf(path: string): string[] {
  const out: string[] = [];
  const has = (v: unknown) => JSON.stringify(v ?? null).includes(JSON.stringify(path));
  db.products!.content.forEach((p) => { if (p.images.includes(path)) out.push(`محصول: ${p.name}`); });
  db.categories!.content.forEach((c) => { if (c.image === path) out.push(`دسته: ${c.name}`); });
  if (has(db.homepage?.content)) out.push('صفحه اصلی');
  if (has(db.settings?.content) || has(sd)) out.push('تنظیمات ظاهر');
  return out;
}
function libraryPanel(): Safe {
  if (libCache === null) return html`<div class="panel"><h2>کتابخانه تصاویر</h2><p class="muted">همه تصاویر آپلودشده در مخزن خصوصی؛ هر تصویر نشان می‌دهد کجا استفاده شده است.</p><button class="btn ghost" type="button" data-act="loadlib">نمایش کتابخانه</button></div>`;
  return html`<div class="panel"><h2>کتابخانه تصاویر (${faNum(libCache.length)})</h2><p class="muted">تصویری که در جایی استفاده شده حذف نمی‌شود؛ ابتدا آن را از همان بخش بردارید.</p>
    <div class="libgrid">${libCache.map((path) => { const u = usageOf(path); return html`<div class="libitem"><img data-p="${path}" alt="" loading="lazy" /><small dir="ltr">${path.split('/').pop() ?? path}</small>${u.length ? html`<small class="muted">${u.join('، ')}</small>` : html`<button class="btn danger sm" type="button" data-act="libdel" data-id="${path}">حذف (بدون استفاده)</button>`}</div>`; })}</div></div>`;
}
function imagesView(): Safe {
  return html`<form class="panel" data-form="design"><h1>تصاویر سایت</h1>
    <p class="muted">برای هر بخش مشخص کنید عکس نمایش داده شود یا نه و عکسش را انتخاب، جایگزین یا حذف کنید. تصاویر محصولات را در تب «محصولات» و تصویر هر بنر را در «صفحه اصلی» تنظیم می‌کنید.</p>
    ${secImages()}${designBar()}</form>${libraryPanel()}`;
}
const advancedView = (): Safe => settingsView();

function paint() {
  if (!user) return;
  const body = tab === 'overview' ? overview() : tab === 'products' ? productsView() : tab === 'orders' ? ordersView() : tab === 'homepage' ? homeView() : tab === 'appearance' ? appearanceView() : tab === 'images' ? imagesView() : advancedView();
  mount(root, shell(body));
  hydrate();
  updateThemePreview();
  const tp = $('#tplprev');
  if (tp) tp.textContent = tplPreview(($<HTMLTextAreaElement>('textarea[name=ordTpl]')?.value) ?? '');
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
    const r = (await (await gh(R())).json()) as { private: boolean; default_branch?: string; permissions?: { push?: boolean } };
    branch = r.default_branch ?? 'main';
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

/** Compare what is saved in the private repo with what the live site currently serves. */
async function checkSync() {
  try {
    const r = await fetch(asset('data/products.json'), { cache: 'no-store' });
    const live = (await r.json()) as Product[];
    const key = (p: Product) => JSON.stringify(p);
    const lm = new Map(live.map((p) => [p.id, key(p)]));
    const priv = toPublicProducts(db.products!.content);
    let changed = priv.filter((p) => lm.get(p.id) !== key(p)).length;
    changed += live.filter((p) => !priv.some((x) => x.id === p.id)).length;
    syncInfo = { changed };
  } catch { syncInfo = null; }
}
const syncPill = (): Safe => (syncInfo === null ? html`` : syncInfo.changed === 0
  ? html`<p><span class="pill ok">محصولات پنل و فروشگاه هم‌گام‌اند ✓</span></p>`
  : html`<p><span class="pill warn">${faNum(syncInfo.changed)} تغییر هنوز در فروشگاه منتشر نشده</span> <button class="link" type="button" data-act="deploynow">انتشار</button></p>`);

const probe = (u: string) => new Promise<void>((ok, bad) => {
  const i = new Image();
  const t = setTimeout(() => bad(new Error('لینک تصویر پاسخ نداد.')), 8000);
  i.onload = () => { clearTimeout(t); ok(); };
  i.onerror = () => { clearTimeout(t); bad(new Error('این لینک تصویر قابل بارگذاری نیست.')); };
  i.src = u;
});

function syncCats() {
  const f = $<HTMLFormElement>('form[data-form=cats]');
  if (!f) return;
  const n = f.querySelectorAll('input[name^=cn]').length;
  cd = Array.from({ length: n }, (_, i) => {
    const c: Category = { id: val(f, `cid${i}`).trim(), name: val(f, `cn${i}`).trim() };
    const d = val(f, `cd${i}`).trim(), im = val(f, `ci${i}`).trim();
    if (d) c.description = d;
    if (im) c.image = im;
    return c;
  });
}
/** IDs are generated, so Persian names work: slug from the name when it is Latin, otherwise cat-N. */
function withIds(list: Category[]): Category[] {
  const used = new Set(list.map((c) => c.id).filter(Boolean));
  return list.map((c) => {
    if (c.id) return c;
    const base = slugify(c.name) || 'cat';
    let id = base, n = 1;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return { ...c, id };
  });
}

/* ---------- orders ---------- */
const fmt = () => makeFmt(db.settings!.content.currency);
async function loadOrders() {
  const t = (await (await gh(`${R()}/git/trees/${encodeURIComponent(branch)}?recursive=1`)).json()) as { tree: { path: string; type: string }[] };
  const paths = t.tree.filter((x) => x.type === 'blob' && /^orders\/\d{4}-\d{2}\/ord-[a-z0-9-]+\.json$/.test(x.path)).map((x) => x.path).sort().reverse().slice(0, 80);
  const out: OrderRec[] = [];
  for (let i = 0; i < paths.length; i += 6) {
    const chunk = await Promise.all(paths.slice(i, i + 6).map(async (path) => {
      const f = await getFile(path);
      try { return f ? ({ order: JSON.parse(f.text) as Order, sha: f.sha, path } as OrderRec) : null; } catch { return null; }
    }));
    chunk.forEach((c) => { if (c) out.push(c); });
  }
  orders = out;
}
async function updateOrder(path: string, patch: Partial<Order>) {
  const rec = orders?.find((o) => o.path === path);
  if (!rec) return;
  const next: Order = { ...rec.order, ...patch, updatedAt: new Date().toISOString() };
  rec.sha = await putFile(path, toB64(JSON.stringify(next, null, 2) + '\n'), `admin(${user}): order ${next.id} -> ${next.status}`, rec.sha);
  rec.order = next;
}
function ordersCsv() {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['کد', 'تاریخ', 'نام', 'تلفن', 'نشانی', 'اقلام', 'جمع', 'وضعیت'], ...(orders ?? []).map(({ order: o }) => [o.id, o.createdAt, o.customer.name, o.customer.phone, o.customer.address, o.items.map((i) => `${i.name}×${i.qty}`).join(' | '), o.total, STATUS_LABEL[o.status]])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function orderRows(): Safe {
  const cur = db.settings!.content.currency;
  const q = of.q.trim().toLowerCase();
  const l = (orders ?? []).filter(({ order: o }) => (!of.status || o.status === of.status) && (!q || `${o.id} ${o.customer.name} ${o.customer.phone}`.toLowerCase().includes(q)));
  return html`<p class="muted">${faNum(l.length)} سفارش</p><div class="tbl"><table><thead><tr><th>تاریخ</th><th>کد</th><th>مشتری</th><th>جمع</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${l.length ? l.map(({ order: o, path }) => html`<tr><td>${dateFa(o.createdAt)}</td><td dir="ltr"><small>${o.id}</small></td><td>${o.customer.name}<br /><small class="muted" dir="ltr">${o.customer.phone}</small></td><td>${faNum(o.total)} ${cur}</td>
      <td><span class="pill st-${o.status}">${STATUS_LABEL[o.status]}</span></td><td><button class="btn ghost sm" type="button" data-act="openorder" data-id="${path}">جزئیات</button></td></tr>`) : html`<tr><td colspan="6" class="muted">سفارشی پیدا نشد.</td></tr>`}</tbody></table></div>`;
}
function orderDetail(rec: OrderRec): Safe {
  const o = rec.order, s = db.settings!.content, cur = s.currency;
  const msg = renderOrderMessage(s.orders?.messageTemplate || DEFAULT_TEMPLATE, o, s.brandName, fmt());
  const tg = telegramUrl(s.telegramUsername);
  return html`<div class="panel"><div class="row-actions"><h2>سفارش <span dir="ltr">${o.id}</span></h2><span class="sp"></span><button class="btn ghost sm" type="button" data-act="closeorder">بستن</button></div>
    <div class="grid2"><div><h3>مشتری</h3><p><strong>${o.customer.name}</strong></p><p><a href="tel:${o.customer.phone}" dir="ltr">${o.customer.phone}</a></p><p>${o.customer.address || '—'}</p><p class="muted">${o.customer.notes || '—'}</p></div>
      <div><label>وضعیت<select data-order-status="${rec.path}">${ORDER_STATUSES.map((st) => html`<option value="${st}" ${st === o.status ? html`selected` : ''}>${STATUS_LABEL[st]}</option>`)}</select></label><p class="muted">ثبت: ${dateFa(o.createdAt)}${o.updatedAt ? ` · بروزرسانی: ${dateFa(o.updatedAt)}` : ''}</p></div></div>
    <table><thead><tr><th>محصول</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>${o.items.map((i) => html`<tr><td>${i.name}</td><td>${faNum(i.qty)}</td><td>${faNum(i.unit)}</td><td>${faNum(i.total)}</td></tr>`)}</tbody></table>
    <p><strong>جمع کل: ${faNum(o.total)} ${cur}</strong></p>
    <h3>پیام سفارش</h3><div class="summary-box">${msg}</div>
    <div class="row-actions"><button class="btn primary sm" type="button" data-act="copymsg" data-id="${rec.path}">کپی پیام</button>${tg ? html`<a class="btn ghost sm" href="${tg}" target="_blank" rel="noopener noreferrer">باز کردن تلگرام</a>` : ''}</div>
    <label>یادداشت داخلی (فقط برای شما)<textarea data-order-note="${rec.path}" maxlength="500">${o.adminNote ?? ''}</textarea></label>
    <div class="row-actions"><button class="btn primary sm" type="button" data-act="savenote" data-id="${rec.path}">ذخیره یادداشت</button><button class="btn danger sm" type="button" data-act="delorder" data-id="${rec.path}">حذف سفارش</button></div></div>`;
}
function ordersView(): Safe {
  const open = orders?.find((o) => o.path === orderOpen);
  return html`<h1>سفارش‌ها</h1>
    <p class="notice">سفارش‌ها فقط در مخزن خصوصی داده ذخیره می‌شوند (پوشه orders). ${db.settings!.content.orders?.enabled === false ? 'ثبت سفارش از سایت در تنظیمات غیرفعال است.' : ''}</p>
    ${orders === null ? html`<div class="panel"><button class="btn primary" type="button" data-act="loadorders">بارگذاری سفارش‌ها</button></div>` : html`
    <form class="panel toolbar" data-form="ofilter" role="search"><label>جستجو (کد، نام، تلفن)<input type="search" name="q" value="${of.q}" /></label>
      <label>وضعیت<select name="status"><option value="">همه</option>${ORDER_STATUSES.map((st) => html`<option value="${st}" ${st === of.status ? html`selected` : ''}>${STATUS_LABEL[st]}</option>`)}</select></label>
      <button class="btn ghost" type="button" data-act="loadorders">بازخوانی</button><button class="btn ghost" type="button" data-act="orderscsv">دانلود CSV</button></form>
    ${open ? orderDetail(open) : ''}<div class="panel" id="otable">${orderRows()}</div>`}`;
}

const SAMPLE_ORDER: Order = { id: 'ord-demo-0001', createdAt: new Date().toISOString(), status: 'new', currency: '', total: 500000, customer: { name: 'نام نمونه', phone: '09120000000', address: 'تهران، خیابان نمونه', notes: 'لطفاً زنگ بزنید' }, items: [{ id: 'sample', name: 'محصول نمونه', qty: 2, unit: 250000, total: 500000 }] };
const tplPreview = (t: string) => renderOrderMessage(t || DEFAULT_TEMPLATE, SAMPLE_ORDER, db.settings!.content.brandName, fmt());

function moveImg(i: number, d: number) {
  syncProduct();
  const p = editing!.p, a = p.imageAlts ?? [];
  const j = i + d;
  if (j < 0 || j >= p.images.length) return;
  [p.images[i], p.images[j]] = [p.images[j] as string, p.images[i] as string];
  [a[i], a[j]] = [a[j] ?? '', a[i] ?? ''];
  dirty = true; paint();
}

type HomeDraft = NonNullable<Settings['home']>;
/** Structural edits (add/remove rows) work on a draft so unsaved form values survive the re-render. */
function editHome(fn: (h: HomeDraft) => void) {
  syncSettings();
  const d = structuredClone(cur());
  const h: HomeDraft = { ...resolveHome(d) };
  fn(h);
  d.home = h; sd = d; dirty = true; paint();
}
function moveSection(i: number, delta: number) {
  editHome((h) => {
    const a = [...(h.sections ?? [])], j = i + delta;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j] as (typeof a)[number], a[i] as (typeof a)[number]];
    h.sections = a;
  });
}

const actions: Record<string, (el: HTMLElement) => Promise<void> | void> = {
  tab: async (el) => {
    if (!leave()) return;
    tab = el.dataset.id as Tab;
    if (tab === 'images') accOpen.add('images');
    if (tab === 'appearance') { accOpen.add('theme'); accOpen.add('bg'); }
    editing = null; hp = null; cd = null; sd = null; errors = []; paint();
    if (tab === 'orders' && orders === null) { await loadOrders(); paint(); }
  },
  reload: async () => { dirty = false; await loadAll(); orders = null; cd = null; sd = null; hp = null; editing = null; errors = []; paint(); note('بازخوانی شد.'); },
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
  refreshdeploy: async () => { await Promise.all([loadDeploy(), checkSync()]); paint(); },
  mainimg: (el) => { syncProduct(); const i = Number(el.dataset.id); const p = editing!.p; p.images.unshift(...p.images.splice(i, 1)); const a = p.imageAlts ?? []; a.unshift(...a.splice(i, 1)); dirty = true; paint(); },
  upimg: (el) => { moveImg(Number(el.dataset.id), -1); },
  downimg: (el) => { moveImg(Number(el.dataset.id), 1); },
  cancelchanges: () => { sd = null; dirty = false; errors = []; paint(); note('تغییرات ذخیره‌نشده لغو شد.'); },
  resetdesign: () => {
    if (!confirm('ظاهر (رنگ‌ها، شیشه‌ای، پس‌زمینه و جای تصاویر) به حالت پیش‌فرض برگردد؟ تا «ذخیره» نزنید اعمال نمی‌شود.')) return;
    const d = structuredClone(cur());
    delete d.theme; delete d.images; delete d.wallpaper;
    sd = finalize(ensureDefaults(d)); dirty = true; paint();
  },
  loadlib: async () => { await listLibrary(true); paint(); },
  libdel: async (el) => {
    const path = el.dataset.id ?? '';
    const u = usageOf(path);
    if (u.length) throw new Error(`این تصویر در حال استفاده است: ${u.join('، ')}`);
    if (!confirm('این تصویر برای همیشه از مخزن خصوصی حذف شود؟')) return;
    await removeImage(path); await listLibrary(true); paint(); note('تصویر حذف شد.');
  },
  copyrepo: async (el) => { note((await copyText(el.dataset.id ?? '')) ? 'نام مخزن کپی شد.' : 'کپی انجام نشد.'); },
  preset: (el) => { syncSettings(); const d = structuredClone(cur()); applyPreset(d, el.dataset.id ?? ''); sd = finalize(d); dirty = true; paint(); },
  pickslot: async (el) => {
    const k = el.dataset.id as (typeof IMAGE_SLOTS)[number];
    syncSettings();
    const path = await pickImage('banners');
    if (!path) return;
    const d = structuredClone(cur());
    d.images = { ...(d.images ?? {}), [k]: { show: true, image: path } };
    sd = d; dirty = true; paint();
  },
  clearslot: (el) => { syncSettings(); const k = el.dataset.id as (typeof IMAGE_SLOTS)[number]; const d = structuredClone(cur()); d.images = { ...(d.images ?? {}), [k]: { show: d.images?.[k]?.show ?? false, image: '' } }; sd = d; dirty = true; paint(); },
  secup: (el) => moveSection(Number(el.dataset.id), -1),
  secdown: (el) => moveSection(Number(el.dataset.id), 1),
  addbenefit: () => editHome((h) => { h.benefits = [...(h.benefits ?? []), { icon: '✨', title: '', text: '' }]; }),
  rmbenefit: (el) => editHome((h) => { h.benefits = (h.benefits ?? []).filter((_, i) => i !== Number(el.dataset.id)); }),
  benefitpreset: () => editHome((h) => { h.benefits = [...(h.benefits ?? []), { icon: '🕯', title: 'دست‌ساز', text: 'محصولات با دقت و به‌صورت دست‌ساز تهیه می‌شود' }, { icon: '🎁', title: 'مناسب هدیه', text: 'امکان بسته‌بندی هدیه' }, { icon: '💬', title: 'پاسخگویی در تلگرام', text: 'سؤال‌هایتان را مستقیم بپرسید' }].slice(0, 8); }),
  addstep: () => editHome((h) => { h.steps = [...(h.steps ?? []), { title: '', text: '' }]; }),
  rmstep: (el) => editHome((h) => { h.steps = (h.steps ?? []).filter((_, i) => i !== Number(el.dataset.id)); }),
  resetsteps: () => editHome((h) => { h.steps = DEFAULT_STEPS.map((x) => ({ ...x })); }),
  addcat: () => { syncCats(); (cd ??= structuredClone(db.categories!.content)).push({ id: '', name: '' }); paint(); },
  delcat: async (el) => {
    syncCats();
    const i = Number(el.dataset.id), c = cd?.[i];
    if (!c) return;
    const n = db.products!.content.filter((p) => c.id && p.category === c.id).length;
    if (n) throw new Error(`این دسته ${faNum(n)} محصول دارد؛ ابتدا آن‌ها را به دسته دیگری منتقل کنید.`);
    cd!.splice(i, 1); paint();
  },
  addurl: async () => {
    syncProduct();
    const f = $<HTMLFormElement>('form[data-form=product]');
    const u = (f ? val(f, 'imgurl') : '').trim();
    const p = editing!.p;
    if (!u.startsWith('https://') || !isImageRef(u)) throw new Error('لینک تصویر باید با https:// شروع شود و معتبر باشد.');
    if (p.images.length >= 8) throw new Error('حداکثر ۸ تصویر.');
    if (p.images.includes(u)) throw new Error('این لینک قبلاً اضافه شده است.');
    await probe(u);
    p.images.push(u); p.imageAlts = [...(p.imageAlts ?? []), '']; dirty = true; paint(); note('لینک تصویر اضافه شد.');
  },
  loadorders: async () => { await loadOrders(); paint(); },
  orderscsv: () => ordersCsv(),
  openorder: (el) => { orderOpen = el.dataset.id ?? null; paint(); window.scrollTo(0, 0); },
  closeorder: () => { orderOpen = null; paint(); },
  copymsg: async (el) => {
    const rec = orders?.find((o) => o.path === el.dataset.id);
    if (!rec) return;
    const st = db.settings!.content;
    note((await copyText(renderOrderMessage(st.orders?.messageTemplate || DEFAULT_TEMPLATE, rec.order, st.brandName, fmt()))) ? 'پیام کپی شد.' : 'کپی انجام نشد.');
  },
  savenote: async (el) => {
    const t = $<HTMLTextAreaElement>(`textarea[data-order-note="${CSS.escape(el.dataset.id ?? '')}"]`);
    await updateOrder(el.dataset.id!, { adminNote: (t?.value ?? '').trim().slice(0, 500) }); paint(); note('یادداشت ذخیره شد.');
  },
  delorder: async (el) => {
    const rec = orders?.find((o) => o.path === el.dataset.id);
    if (!rec || !confirm(`سفارش ${rec.order.id} برای همیشه حذف شود؟`)) return;
    await gh(`${R()}/contents/${rec.path}`, { method: 'DELETE', body: JSON.stringify({ message: `admin(${user}): delete order ${rec.order.id}`, sha: rec.sha }) });
    orders = orders!.filter((o) => o !== rec); orderOpen = null; paint(); note('سفارش حذف شد.');
  },
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
  const os = inp.dataset.orderStatus;
  if (os) {
    updateOrder(os, { status: inp.value as OrderStatus }).then(() => { paint(); note('وضعیت سفارش تغییر کرد.'); }).catch((x) => { fail(x); paint(); });
    return;
  }
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
    } else if (kind === 'cat') {
      syncCats();
      const i = Number(inp.dataset.id), c = cd?.[i];
      if (c) { c.image = await upload(file, 'categories', c.id || c.name || 'category'); dirty = true; }
    } else if (kind === 'wp') {
      const f = $<HTMLFormElement>('form[data-form=settings]');
      const path = await upload(file, 'banners', 'wallpaper');
      const field = f?.elements.namedItem('wpImage') as HTMLInputElement | null;
      if (field) field.value = path;
      const pv = $<HTMLImageElement>('#wpprev');
      if (pv) { pv.dataset.p = path; pv.hidden = false; hydrate(); }
      dirty = true; note('تصویر زمینه بارگذاری شد. تنظیمات را ذخیره کنید.');
      return;
    } else if (kind === 'hero') { syncHome(); hp!.heroImage = await upload(file, 'banners', 'hero');
    } else { syncHome(); const b = hp!.banners[Number(inp.dataset.id)]; if (b) b.image = await upload(file, 'banners', b.title); }
    paint(); note('تصویر بارگذاری شد. با ذخیره فرم، تغییر نهایی می‌شود.');
  })().catch(fail);
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
    } else if (kind === 'quick') {
      const q = ensureDefaults(structuredClone(db.settings!.content));
      applyPaths(f, q as unknown as Rec);
      q.telegramUsername = q.telegramUsername.replace(/^@/, '');
      const pr = f.querySelector<HTMLInputElement>('input[name=preset]:checked');
      if (pr) applyPreset(q, pr.value);
      finalize(q);
      errors = validateSettings(q);
      if (errors.length) return paint();
      await save('settings', q); sd = null; dirty = false; paint(); note('تنظیمات اولیه ذخیره شد.');
    } else if (kind === 'design') {
      const d = ensureDefaults(structuredClone(cur()));
      applyPaths(f, d as unknown as Rec);
      finalize(d);
      errors = validateSettings(d);
      if (errors.length) { sd = d; return paint(); }
      await save('settings', d); sd = null; dirty = false; paint(); note('تغییرات ظاهر ذخیره شد.');
    } else if (kind === 'cats') {
      syncCats();
      const named = (cd ?? []).filter((c) => c.name || c.id || c.description || c.image);
      const list = withIds(named.map((c) => ({ ...c })));
      const bad = list.map((c, i) => (c.name ? '' : `دسته ${i + 1}: نام را وارد کنید.`)).filter(Boolean);
      const dupName = list.some((c, i) => list.findIndex((x) => x.name === c.name) !== i);
      errors = [...bad, ...(dupName ? ['نام دسته‌ها نباید تکراری باشد.'] : []), ...validateCategories(list)];
      if (errors.length) return paint();
      for (const c of list) if (c.image && !isImageRef(c.image)) errors.push(`تصویر «${c.name}» باید مسیر مخزن یا لینک https باشد.`);
      if (errors.length) return paint();
      const gone = db.categories!.content.filter((c) => !list.some((x) => x.id === c.id));
      const inUse = gone.filter((c) => db.products!.content.some((p) => p.category === c.id));
      if (inUse.length) { errors = [`دسته «${inUse[0]!.name}» محصول دارد و حذف نمی‌شود؛ ابتدا محصولات را به دسته دیگری ببرید.`]; return paint(); }
      await save('categories', list); cd = null; dirty = false; paint(); note('دسته‌بندی‌ها ذخیره شد.');
    } else if (kind === 'home' && hp) {
      const h = readHome(f, hp);
      errors = [...errors, ...validateHomepage(h)];
      if (errors.length) { hp = h; return paint(); }
      await save('homepage', h); hp = null; paint(); dirty = false; note('صفحه اصلی ذخیره شد.');
    } else if (kind === 'settings') {
      let s: Settings;
      try { s = buildSettings(f, sd ?? db.settings!.content); } catch (x) { errors = [x instanceof Error ? x.message : 'خطا در خواندن فرم.']; return paint(); }
      errors = validateSettings(s);
      if (errors.length) return paint();
      await save('settings', s); sd = null; paint(); dirty = false; note('تنظیمات ذخیره شد.');
    }
  })().catch((x) => { fail(x); paint(); });
});

root.addEventListener('toggle', (e) => {
  const d = e.target as HTMLDetailsElement;
  const id = d.dataset?.acc;
  if (id) { if (d.open) accOpen.add(id); else accOpen.delete(id); }
}, true);

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
  } else if (kind === 'ofilter') {
    of = { q: val(f, 'q'), status: val(f, 'status') };
    mount($('#otable')!, orderRows());
  } else if (kind === 'settings' || kind === 'design') {
    dirty = true;
    updateThemePreview();
    f.querySelectorAll('input[type=range][data-path]').forEach((r) => { const o = r.closest('label')?.querySelector('output'); if (o) o.textContent = (r as HTMLInputElement).value; });
    const pv = $('#tplprev');
    if (pv) pv.textContent = tplPreview(val(f, 'ordTpl'));
  } else if (kind) dirty = true;
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const f = $<HTMLFormElement>('form[data-form=product], form[data-form=home], form[data-form=settings], form[data-form=design], form[data-form=quick]');
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
