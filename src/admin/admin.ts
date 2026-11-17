import '@fontsource-variable/vazirmatn';
import './admin.css';
import type { Category, DataName, Homepage, Product, Settings } from '../shared/types';
import { validateCategories, validateHomepage, validateProduct, validateProducts, validateSettings, IMG_RE } from '../shared/validate';
import { html, mount, raw, $, $$, type Safe } from '../utils/dom';
import { asset, dateFa, faNum, slugify } from '../utils/format';

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const root = $('#admin')!;

class ApiError extends Error { constructor(readonly status: number, m: string) { super(m); } }
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API + path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'admin' } });
  } catch { throw new ApiError(0, 'اتصال به سرویس مدیریت برقرار نشد.'); }
  const body = (await r.json().catch(() => ({}))) as { error?: string; details?: string[] };
  if (!r.ok) throw new ApiError(r.status, [body.error, ...(body.details ?? [])].filter(Boolean).join(' — ') || r.statusText);
  return body as T;
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

let mt = 0;
function note(m: string, err = false) {
  const el = $('#msg') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'msg', role: 'status' }));
  el.textContent = m; el.className = err ? 'err' : ''; el.hidden = false;
  clearTimeout(mt); mt = window.setTimeout(() => { el.hidden = true; }, 5000);
}
const fail = (e: unknown) => note(e instanceof ApiError && e.status === 409 ? 'فایل هم‌زمان تغییر کرده است. «بازخوانی» را بزنید و دوباره تلاش کنید.' : e instanceof Error ? e.message : 'خطای ناشناخته', true);

async function loadAll() {
  const names: DataName[] = ['products', 'categories', 'homepage', 'settings'];
  const res = await Promise.all(names.map((n) => api<Doc<never>>(`/api/data/${n}`)));
  names.forEach((n, i) => { (db as Record<string, unknown>)[n] = res[i]; });
  history = (await api<{ commits: Commit[] }>('/api/history').catch(() => ({ commits: [] }))).commits;
}
async function save(name: DataName, content: unknown) {
  const doc = db[name] as Doc<unknown>;
  const r = await api<{ sha: string }>(`/api/data/${name}`, { method: 'PUT', body: JSON.stringify({ content, sha: doc.sha }) });
  (db as Record<string, unknown>)[name] = { content, sha: r.sha };
  history = (await api<{ commits: Commit[] }>('/api/history').catch(() => ({ commits: history }))).commits;
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
  const name = `${slugify(base) || 'image'}-${Date.now().toString(36)}`;
  return (await api<{ path: string }>('/api/images', { method: 'POST', body: JSON.stringify({ dir, name, contentType: o.type, data: o.data }) })).path;
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

/* ---------- views ---------- */
function shell(body: Safe): Safe {
  const T: [Tab, string][] = [['overview', 'نمای کلی'], ['products', 'محصولات'], ['homepage', 'صفحه اصلی'], ['settings', 'تنظیمات']];
  return html`<div class="top"><div class="wrap"><strong>پنل مدیریت</strong><span class="muted">${user}</span><span class="sp"></span>
    <button class="btn ghost sm" data-act="reload" type="button">بازخوانی</button><button class="btn ghost sm" data-act="logout" type="button">خروج</button></div></div>
    <div class="wrap"><nav class="tabs" aria-label="بخش‌ها">${T.map(([k, t]) => html`<button type="button" data-act="tab" data-id="${k}" aria-current="${tab === k}">${t}</button>`)}</nav>${err()}${body}</div>`;
}

function overview(): Safe {
  const p = db.products!.content;
  const stat = (n: number, l: string) => html`<div class="panel stat"><b>${faNum(n)}</b>${l}</div>`;
  return html`<div class="stats">${stat(p.length, 'کل محصولات')}${stat(p.filter((x) => x.available).length, 'موجود')}${stat(p.filter((x) => !x.available).length, 'ناموجود')}${stat(p.filter((x) => x.featured).length, 'ویژه')}</div>
    <div class="panel"><h2>آخرین تغییرات کاتالوگ</h2>${history.length ? html`<ul>${history.map((c) => html`<li>${c.message} <span class="muted">— ${c.author} · ${dateFa(c.date)}</span></li>`)}</ul>` : html`<p class="muted">تغییری ثبت نشده است.</p>`}</div>`;
}

function productsView(): Safe {
  if (editing) return productForm();
  const cats = db.categories!.content;
  const name = (id: string) => cats.find((c) => c.id === id)?.name ?? id;
  return html`<div class="panel"><div class="row-actions"><h2>محصولات</h2><span class="sp"></span><button class="btn primary sm" type="button" data-act="new">افزودن محصول</button></div>
    <table><thead><tr><th></th><th>نام</th><th>دسته</th><th>قیمت</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${db.products!.content.map((p) => html`<tr><td><img class="thumb" src="${asset(p.images[0] ?? '')}" alt="" /></td><td>${p.name}</td><td>${name(p.category)}</td><td>${faNum(p.price)}</td><td>${p.available ? 'موجود' : 'ناموجود'}</td>
      <td><div class="row-actions"><button class="btn ghost sm" type="button" data-act="edit" data-id="${p.id}">ویرایش</button><button class="btn danger sm" type="button" data-act="del" data-id="${p.id}">حذف</button></div></td></tr>`)}
    </tbody></table></div>
    <form class="panel" data-form="cats"><h2>دسته‌بندی‌ها</h2>
    ${cats.map((c, i) => html`<div class="grid2"><label>شناسه<input name="cid${i}" value="${c.id}" /></label><label>نام<input name="cn${i}" value="${c.name}" /></label><label>توضیح<input name="cd${i}" value="${c.description ?? ''}" /></label><label>تصویر<input name="ci${i}" value="${c.image ?? ''}" dir="ltr" /></label></div>`)}
    <div class="row-actions"><button class="btn ghost sm" type="button" data-act="addcat">افزودن دسته</button><button class="btn primary sm" type="submit">ذخیره دسته‌بندی‌ها</button></div></form>`;
}

function productForm(): Safe {
  const { p, isNew } = editing!;
  const cats = db.categories!.content;
  const sp = Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  return html`<form class="panel" data-form="product"><h2>${isNew ? 'محصول جدید' : `ویرایش: ${p.name}`}</h2><div class="grid2">
    <label>شناسه (لاتین، مثل candle-009)<input name="id" value="${p.id}" ${isNew ? '' : html`readonly`} dir="ltr" required /></label>
    ${field('نام', 'name', p.name, 'required maxlength="120"')}
    <label>قیمت (${db.settings!.content.currency})<input name="price" value="${Number.isFinite(p.price) ? p.price : ''}" inputmode="numeric" required /></label>
    <label>قیمت با تخفیف (اختیاری)<input name="discountPrice" value="${p.discountPrice ?? ''}" inputmode="numeric" /></label>
    <label>دسته‌بندی<select name="category">${cats.map((c) => html`<option value="${c.id}" ${c.id === p.category ? html`selected` : ''}>${c.name}</option>`)}</select></label>
    ${field('رایحه', 'fragrance', p.fragrance)}${field('اندازه', 'size', p.size)}${field('نوع موم', 'waxType', p.waxType)}${field('مدت سوختن', 'burningDuration', p.burningDuration)}</div>
    <label>توضیحات<textarea name="description" maxlength="2000" required>${p.description}</textarea></label>
    <label>مشخصات بیشتر (هر خط «عنوان: مقدار»)<textarea name="specs">${sp}</textarea></label>
    <div class="checks"><label class="chk"><input type="checkbox" name="available" ${p.available ? html`checked` : ''}/>موجود</label><label class="chk"><input type="checkbox" name="featured" ${p.featured ? html`checked` : ''}/>ویژه</label><label class="chk"><input type="checkbox" name="isNew" ${p.isNew ? html`checked` : ''}/>جدید</label><label class="chk"><input type="checkbox" name="bestSeller" ${p.bestSeller ? html`checked` : ''}/>پرفروش</label></div>
    <h3>تصاویر (۱ تا ۸)</h3>
    ${p.images.map((src, i) => html`<div class="imgrow"><img src="${asset(src)}" alt="" /><label>متن جایگزین (alt)<input name="alt${i}" value="${p.imageAlts?.[i] ?? ''}" maxlength="160" /></label><button class="btn danger sm" type="button" data-act="rmimg" data-id="${i}">حذف</button></div>`)}
    <label>افزودن تصویر (JPG, PNG, WebP)<input type="file" data-upload="product" accept="image/jpeg,image/png,image/webp" /></label>
    <div class="row-actions"><button class="btn primary" type="submit">ذخیره محصول</button><button class="btn ghost" type="button" data-act="cancel">انصراف</button></div></form>`;
}

function homeView(): Safe {
  hp ??= structuredClone(db.homepage!.content);
  const h = hp;
  const { banners, intro, careTips, faq, collections, testimonials } = h;
  const adv = JSON.stringify({ intro, careTips, faq, collections, testimonials }, null, 2);
  return html`<form class="panel" data-form="home"><h2>صفحه اصلی</h2>
    ${field('عنوان اصلی', 'heroTitle', h.heroTitle, 'required')}<label>توضیح اصلی<textarea name="heroDescription">${h.heroDescription}</textarea></label>
    <div class="imgrow"><img src="${asset(h.heroImage)}" alt="" /><label>تصویر اصلی<input type="file" data-upload="hero" accept="image/jpeg,image/png,image/webp" /></label><span></span></div>
    <h3>محصولات ویژه صفحه اصلی</h3><div class="checks">${db.products!.content.map((p) => html`<label class="chk"><input type="checkbox" name="feat" value="${p.id}" ${h.featuredIds.includes(p.id) ? html`checked` : ''}/>${p.name}</label>`)}</div>
    <h3>بنرها</h3>${banners.map((b, i) => html`<div class="panel"><div class="grid2">${field('عنوان', `bt${i}`, b.title)}${field('متن', `bx${i}`, b.text)}<label>لینک (#/shop یا https://)<input name="bl${i}" value="${b.link}" dir="ltr" /></label></div>
      <div class="imgrow">${b.image ? html`<img src="${asset(b.image)}" alt="" />` : html`<span></span>`}<label>تصویر بنر<input type="file" data-upload="banner" data-id="${i}" accept="image/jpeg,image/png,image/webp" /></label><button class="btn danger sm" type="button" data-act="rmbanner" data-id="${i}">حذف بنر</button></div></div>`)}
    <button class="btn ghost sm" type="button" data-act="addbanner">افزودن بنر</button>
    <h3>محتوای پیشرفته (JSON)</h3><p class="muted">معرفی برند، نکات نگهداری، پرسش‌های متداول، مجموعه‌ها و نظرات مشتریان (فقط نظرات واقعی).</p>
    <textarea class="code" name="adv">${adv}</textarea>
    <p><button class="btn primary" type="submit">ذخیره صفحه اصلی</button></p></form>`;
}

function settingsView(): Safe {
  const s = db.settings!.content;
  const o = s.customOrder;
  return html`<form class="panel" data-form="settings"><h2>تنظیمات فروشگاه</h2><div class="grid2">
    <label>نام کاربری تلگرام (بدون @)<input name="tg" value="${s.telegramUsername}" dir="ltr" required /></label>${field('نام برند', 'brandName', s.brandName, 'required')}${field('واحد پول', 'currency', s.currency, 'required')}
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
}
function loginView(msg = '') {
  mount(root, html`<div class="login panel"><h1>پنل مدیریت</h1><p class="muted">برای ورود از حساب GitHub مجاز استفاده کنید.</p>${msg ? html`<p class="errors">${msg}</p>` : ''}
    ${API ? html`<a class="btn primary" href="${API}/auth/login">ورود با GitHub</a>` : html`<p class="errors">VITE_API_URL تنظیم نشده است (به docs/ADMIN.md مراجعه کنید).</p>`}</div>`);
}

/* ---------- actions ---------- */
const newProduct = (): Product => ({ id: `candle-${String(db.products!.content.length + 1).padStart(3, '0')}`, name: '', description: '', price: NaN, discountPrice: null, category: db.categories!.content[0]?.id ?? '', images: [], imageAlts: [], fragrance: '', size: '', waxType: '', burningDuration: '', available: true, featured: false, isNew: true, bestSeller: false, specs: {}, createdAt: new Date().toISOString() });
const syncProduct = () => { const f = $<HTMLFormElement>('form[data-form=product]'); if (f && editing) editing.p = readProduct(f, editing.p); };
const syncHome = () => { const f = $<HTMLFormElement>('form[data-form=home]'); if (f && hp) { const keep = errors; hp = readHome(f, hp); if (keep.length) errors = keep; } };

const actions: Record<string, (el: HTMLElement) => Promise<void> | void> = {
  tab: (el) => { tab = el.dataset.id as Tab; editing = null; hp = null; errors = []; paint(); },
  reload: async () => { await loadAll(); hp = null; editing = null; errors = []; paint(); note('بازخوانی شد.'); },
  logout: async () => { await api('/auth/logout', { method: 'POST' }); user = ''; loginView(); },
  new: () => { editing = { p: newProduct(), isNew: true, orig: [] }; errors = []; paint(); },
  edit: (el) => { const p = db.products!.content.find((x) => x.id === el.dataset.id); if (p) { editing = { p: structuredClone(p), isNew: false, orig: [...p.images] }; errors = []; paint(); } },
  cancel: () => { editing = null; errors = []; paint(); },
  del: async (el) => {
    const id = el.dataset.id!;
    const p = db.products!.content.find((x) => x.id === id);
    if (!p || !confirm(`محصول «${p.name}» حذف شود؟ این کار در مخزن GitHub ثبت می‌شود.`)) return;
    await save('products', db.products!.content.filter((x) => x.id !== id));
    const hpd = db.homepage!.content;
    if (hpd.featuredIds.includes(id)) await save('homepage', { ...hpd, featuredIds: hpd.featuredIds.filter((x) => x !== id) });
    await Promise.all(p.images.filter((i) => !i.endsWith('.svg')).map((i) => api('/api/images', { method: 'DELETE', body: JSON.stringify({ path: i }) }).catch(() => undefined)));
    paint(); note('محصول حذف شد. انتشار سایت چند دقیقه طول می‌کشد.');
  },
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
  if (!kind || !file) return;
  (async () => {
    note('در حال بهینه‌سازی و بارگذاری تصویر…');
    if (kind === 'product') { syncProduct(); const p = editing!.p; if (p.images.length >= 8) throw new Error('حداکثر ۸ تصویر.'); p.images.push(await upload(file, 'products', p.id || p.name)); p.imageAlts = [...(p.imageAlts ?? []), ''];
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
    if (kind === 'product' && editing) {
      const p = readProduct(f, editing.p);
      if (p.discountPrice === null || Number.isNaN(p.discountPrice)) p.discountPrice = null;
      const list = editing.isNew ? [...db.products!.content, p] : db.products!.content.map((x) => (x.id === p.id ? p : x));
      errors = [...validateProduct(p), ...(validateProducts(list).filter((m) => m.includes('تکراری')))];
      if (errors.length) return paint();
      await save('products', list);
      const gone = editing.orig.filter((i) => !p.images.includes(i) && !i.endsWith('.svg'));
      await Promise.all(gone.map((i) => api('/api/images', { method: 'DELETE', body: JSON.stringify({ path: i }) }).catch(() => undefined)));
      editing = null; paint(); note('ذخیره شد. انتشار سایت چند دقیقه طول می‌کشد.');
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
      await save('categories', list); paint(); note('دسته‌بندی‌ها ذخیره شد.');
    } else if (kind === 'home' && hp) {
      const h = readHome(f, hp);
      errors = [...errors, ...validateHomepage(h)];
      if (errors.length) { hp = h; return paint(); }
      await save('homepage', h); hp = null; paint(); note('صفحه اصلی ذخیره شد.');
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
      await save('settings', s); paint(); note('تنظیمات ذخیره شد.');
    }
  })().catch((x) => { fail(x); paint(); });
});

async function init() {
  if (!API) return loginView();
  try {
    user = (await api<{ login: string }>('/auth/me')).login;
    await loadAll();
    paint();
  } catch (e) {
    user = '';
    const denied = location.hash === '#denied';
    loginView(denied ? 'این حساب GitHub اجازه دسترسی ندارد.' : e instanceof ApiError && e.status !== 401 ? e.message : '');
  }
}
void init();
void IMG_RE; void $$;
