// Pure validation shared by the admin UI, CI and tests.
import { AREA_IDS, GROUP_KEYS, HOME_SECTION_IDS, IMAGE_SLOTS } from './types';

type R = Record<string, unknown>;
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const IMG_RE = /^images\/(products|banners|categories)\/[a-z0-9][a-z0-9-]*\.(webp|jpe?g|png|svg)$/;
/** A repo-relative image path (images/<dir>/<file>) or a plain https:// image URL. */
export const isImageRef = (s: unknown): s is string =>
  typeof s === 'string' && (IMG_RE.test(s) || (s.length <= 500 && /^https:\/\/[^\s"'<>()\\]+$/.test(s)));
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const TG_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
export const isObj = (v: unknown): v is R => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: R, k: string, max: number, e: string[], label: string, req = true) {
  const v = o[k];
  if (typeof v !== 'string') return void (req && e.push(`«${label}» الزامی است.`));
  if (req && !v.trim()) e.push(`«${label}» نباید خالی باشد.`);
  if (v.length > max) e.push(`«${label}» حداکثر ${max} نویسه است.`);
}
function bool(o: R, k: string, e: string[], label: string) {
  if (typeof o[k] !== 'boolean') e.push(`«${label}» باید روشن/خاموش باشد.`);
}
function int(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}
export function isSafeLink(u: string): boolean {
  return u.length <= 300 && /^(#\/|https:\/\/)/.test(u);
}

export function validateProduct(p: unknown): string[] {
  const e: string[] = [];
  if (!isObj(p)) return ['محصول نامعتبر است.'];
  if (typeof p.id !== 'string' || !ID_RE.test(p.id) || p.id.length > 60) e.push('«شناسه» فقط حروف کوچک لاتین، عدد و خط تیره (حداکثر ۶۰).');
  str(p, 'name', 120, e, 'نام');
  str(p, 'description', 2000, e, 'توضیحات');
  if (!int(p.price, 1, 1e10)) e.push('«قیمت» باید عدد صحیح مثبت باشد.');
  if (p.discountPrice !== null && p.discountPrice !== undefined) {
    if (!int(p.discountPrice, 1, 1e10)) e.push('«قیمت با تخفیف» نامعتبر است.');
    else if (int(p.price, 1, 1e10) && p.discountPrice >= p.price) e.push('«قیمت با تخفیف» باید کمتر از قیمت اصلی باشد.');
  }
  if (typeof p.category !== 'string' || !ID_RE.test(p.category)) e.push('«دسته‌بندی» را انتخاب کنید.');
  if (!Array.isArray(p.images) || p.images.length < 1 || p.images.length > 8) e.push('بین ۱ تا ۸ تصویر لازم است.');
  else if (!p.images.every((i) => isImageRef(i))) e.push('مسیر یا لینک تصویر نامعتبر است (مسیر مخزن یا لینک https).');
  if (p.imageAlts !== undefined) {
    if (!Array.isArray(p.imageAlts) || !p.imageAlts.every((a) => typeof a === 'string' && a.length <= 160)) e.push('متن جایگزین تصویر نامعتبر است.');
  }
  for (const [k, l] of [['fragrance', 'رایحه'], ['size', 'اندازه'], ['waxType', 'نوع موم'], ['burningDuration', 'مدت سوختن']] as const) str(p, k, 80, e, l, false);
  for (const [k, l] of [['available', 'موجود'], ['featured', 'ویژه'], ['isNew', 'جدید'], ['bestSeller', 'پرفروش']] as const) bool(p, k, e, l);
  if (p.published !== undefined && typeof p.published !== 'boolean') e.push('«نمایش در سایت» نامعتبر است.');
  if (p.costPrice !== undefined && !int(p.costPrice, 0, 1e10)) e.push('«قیمت تمام‌شده» باید عدد صحیح باشد.');
  str(p, 'supplier', 120, e, 'تأمین‌کننده', false);
  str(p, 'internalNote', 500, e, 'یادداشت داخلی', false);
  if (p.specs !== undefined) {
    if (!isObj(p.specs) || Object.keys(p.specs).length > 20 || !Object.entries(p.specs).every(([k, v]) => k.length <= 40 && typeof v === 'string' && v.length <= 120)) e.push('مشخصات نامعتبر است.');
  }
  return e;
}

export function validateProducts(list: unknown): string[] {
  if (!Array.isArray(list)) return ['فهرست محصولات باید آرایه باشد.'];
  if (list.length > 500) return ['حداکثر ۵۰۰ محصول مجاز است.'];
  const e: string[] = [];
  const seen = new Set<string>();
  list.forEach((p, i) => {
    validateProduct(p).forEach((m) => e.push(`محصول ${i + 1}: ${m}`));
    const id = isObj(p) ? p.id : undefined;
    if (typeof id === 'string') {
      if (seen.has(id)) e.push(`شناسه تکراری: ${id}`);
      seen.add(id);
    }
  });
  return e;
}

export function validateCategories(list: unknown): string[] {
  if (!Array.isArray(list) || list.length > 50) return ['دسته‌بندی‌ها نامعتبرند.'];
  const e: string[] = [];
  const seen = new Set<string>();
  list.forEach((c, i) => {
    if (!isObj(c)) return void e.push(`دسته ${i + 1} نامعتبر است.`);
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) e.push(`دسته ${i + 1}: شناسه باید حروف کوچک لاتین، عدد و خط تیره باشد.`);
    else if (seen.has(c.id)) e.push(`شناسه دسته تکراری: ${c.id}`);
    else seen.add(c.id);
    str(c, 'name', 60, e, `نام دسته ${i + 1}`);
    str(c, 'description', 200, e, `توضیح دسته ${i + 1}`, false);
    if (c.image !== undefined && !isImageRef(c.image)) e.push(`تصویر دسته ${i + 1} نامعتبر است.`);
  });
  return e;
}

export function validateHomepage(h: unknown): string[] {
  const e: string[] = [];
  if (!isObj(h)) return ['اطلاعات صفحه اصلی نامعتبر است.'];
  str(h, 'heroTitle', 120, e, 'عنوان');
  str(h, 'heroDescription', 400, e, 'توضیح');
  if (!isImageRef(h.heroImage)) e.push('تصویر اصلی نامعتبر است.');
  if (!Array.isArray(h.banners) || h.banners.length > 10) e.push('بنرها نامعتبرند.');
  else h.banners.forEach((b, i) => {
    if (!isObj(b)) return void e.push(`بنر ${i + 1} نامعتبر است.`);
    str(b, 'title', 80, e, `عنوان بنر ${i + 1}`);
    str(b, 'text', 200, e, `متن بنر ${i + 1}`, false);
    if (typeof b.link !== 'string' || !isSafeLink(b.link)) e.push(`لینک بنر ${i + 1} باید با #/ یا https:// شروع شود.`);
    if (b.image !== undefined && !isImageRef(b.image)) e.push(`تصویر بنر ${i + 1} نامعتبر است.`);
  });
  if (!Array.isArray(h.featuredIds) || h.featuredIds.length > 24 || !h.featuredIds.every((x) => typeof x === 'string' && ID_RE.test(x))) e.push('محصولات ویژه نامعتبرند.');
  const arrOf = (k: string, shape: string[], max: number) => {
    const v = h[k];
    if (!Array.isArray(v) || v.length > max) return void e.push(`«${k}» نامعتبر است.`);
    v.forEach((it) => { if (!isObj(it) || !shape.every((s) => typeof it[s] === 'string' && (it[s] as string).length <= 600)) e.push(`مورد نامعتبر در «${k}».`); });
  };
  arrOf('collections', ['title', 'description', 'categoryId'], 12);
  arrOf('careTips', ['title', 'text'], 12);
  arrOf('faq', ['q', 'a'], 30);
  arrOf('testimonials', ['name', 'text'], 30);
  if (!isObj(h.intro) || typeof h.intro.title !== 'string' || typeof h.intro.text !== 'string' || !Array.isArray(h.intro.points) || !h.intro.points.every((p) => typeof p === 'string')) e.push('معرفی برند نامعتبر است.');
  return e;
}

function validateOpts(v: unknown, label: string, e: string[]) {
  if (!Array.isArray(v) || v.length > 30) return void e.push(`گزینه‌های «${label}» نامعتبرند.`);
  v.forEach((o) => { if (!isObj(o) || typeof o.label !== 'string' || !o.label.trim() || o.label.length > 60 || !int(o.extra, -1e9, 1e9)) e.push(`گزینه نامعتبر در «${label}».`); });
}


type Pred = (v: unknown) => boolean;
interface Spec { [k: string]: Pred | Spec }
const oneOf = (...a: (string | number)[]): Pred => (v) => (typeof v === 'string' || typeof v === 'number') && a.includes(v);
const within = (a: number, b: number): Pred => (v) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const hexP: Pred = (v) => typeof v === 'string' && HEX_RE.test(v);
const boolP: Pred = (v) => typeof v === 'boolean';
const imgP: Pred = (v) => v === '' || isImageRef(v);
const POS = oneOf('center', 'top', 'bottom', 'left', 'right');
const FONT = oneOf('vazir', 'system', 'serif');
/** Every key is optional (partial objects are fine) but unknown keys and wrong values are rejected. */
function matches(v: unknown, spec: Spec): boolean {
  if (!isObj(v)) return false;
  return Object.entries(v).every(([k, x]) => { const sp = spec[k]; return sp !== undefined && (typeof sp === 'function' ? sp(x) : matches(x, sp)); });
}
const AREA: Spec = { mode: oneOf('inherit', 'solid', 'gradient', 'image'), color: hexP, color2: hexP, angle: within(0, 360), image: imgP, imageMobile: imgP, opacity: within(0, 1), blur: within(0, 30), size: oneOf('cover', 'contain', 'auto'), position: POS, repeat: boolP, attachment: oneOf('scroll', 'fixed') };
const THEME: Spec = {
  colors: { primary: hexP, secondary: hexP, bg: hexP, accent: hexP, accentInk: hexP, text: hexP, muted: hexP, border: hexP },
  radius: within(0, 40), buttons: oneOf('pill', 'rounded', 'square'), motion: boolP, motionLevel: oneOf('off', 'subtle', 'normal', 'lively'),
  glass: { enabled: boolP, blur: within(0, 30), opacity: within(0.3, 1), border: within(0, 1), shadow: within(0, 1), saturate: within(100, 200), targets: { cards: boolP, panels: boolP, footer: boolP, buttons: boolP } },
  bg: { mode: oneOf('solid', 'gradient'), color: hexP, color2: hexP, angle: within(0, 360), blobs: boolP, imageBlur: within(0, 30) },
  areas: Object.fromEntries(AREA_IDS.map((k) => [k, AREA])) as Spec,
  type: { font: FONT, headingFont: FONT, base: within(14, 20), headingScale: within(0.85, 1.4), lineHeight: within(1.5, 2.2), weight: oneOf(400, 500, 600) },
  ui: { buttonSize: oneOf('sm', 'md', 'lg'), cardStyle: oneOf('elevated', 'flat', 'outlined'), cardRatio: oneOf('1/1', '4/5', '3/4'), shadow: within(0, 1), density: oneOf('compact', 'comfortable', 'spacious'), container: within(960, 1400), navStyle: oneOf('solid', 'glass', 'transparent'), navSticky: boolP, navItems: oneOf('pill', 'underline'), logoSize: within(24, 64) },
};
const SLOT: Spec = { show: boolP, image: imgP, fit: oneOf('cover', 'contain'), position: POS, ratio: oneOf('auto', '1/1', '4/3', '16/9', '21/9', '3/4'), radius: (v) => v === null || within(0, 40)(v) };
const SECTION_STYLE: Spec = { padTop: within(0, 8), padBottom: within(0, 8), bg: (v) => v === '' || hexP(v), align: oneOf('start', 'center') };

function validateAppearance(s: R, e: string[]) {
  if (s.theme !== undefined && !matches(s.theme, THEME)) e.push('تنظیمات ظاهر (رنگ، فونت، شیشه‌ای، پس‌زمینه‌ها و ...) نامعتبر است.');
  if (s.images !== undefined) {
    const im = s.images;
    const keys = Object.fromEntries(IMAGE_SLOTS.map((k) => [k, SLOT])) as Spec;
    if (!matches(im, keys) || !Object.values(im as R).every((v) => isObj(v) && typeof v.show === 'boolean' && typeof v.image === 'string')) e.push('تنظیمات جای تصاویر نامعتبر است.');
  }
  if (s.home !== undefined) {
    const h = s.home;
    const text = (a: unknown, keys: string[], max: number, n: number) => a === undefined || (Array.isArray(a) && a.length <= n && a.every((x) => isObj(x) && keys.every((k) => typeof x[k] === 'string' && (x[k] as string).length <= max)));
    const p = isObj(h) ? h.promo : undefined;
    const ok = isObj(h) && (h.sections === undefined || (Array.isArray(h.sections) && h.sections.length <= 30 && h.sections.every((x) => isObj(x) && (HOME_SECTION_IDS as readonly string[]).includes(x.id as string) && typeof x.show === 'boolean')))
      && text(h.benefits, ['icon', 'title', 'text'], 160, 8) && text(h.steps, ['title', 'text'], 160, 6)
      && (h.styles === undefined || matches(h.styles, Object.fromEntries(HOME_SECTION_IDS.map((k) => [k, SECTION_STYLE])) as Spec))
      && (p === undefined || (isObj(p) && typeof p.enabled === 'boolean' && typeof p.title === 'string' && p.title.length <= 80 && typeof p.text === 'string' && p.text.length <= 200 && typeof p.endsAt === 'string' && (p.endsAt === '' || !Number.isNaN(Date.parse(p.endsAt))) && typeof p.link === 'string' && (p.link === '' || isSafeLink(p.link))));
    if (!ok) e.push('تنظیمات بخش‌های صفحه اصلی (ترتیب، استایل، مزایا، مراحل، پیشنهاد ویژه) نامعتبر است.');
  }
  if (s.marketing !== undefined) {
    const m = s.marketing;
    const b = (v: unknown) => v === undefined || typeof v === 'boolean';
    const ok = isObj(m) && b(m.stickyCta) && b(m.askOnProduct) && b(m.recentlyViewed) && b(m.crossSell) && (m.productNote === undefined || (typeof m.productNote === 'string' && m.productNote.length <= 200))
      && (m.freeShipping === undefined || (isObj(m.freeShipping) && typeof m.freeShipping.enabled === 'boolean' && int(m.freeShipping.threshold, 0, 1e10)));
    if (!ok) e.push('تنظیمات بازاریابی (ارسال رایگان و ...) نامعتبر است.');
  }
}

export function validateSettings(s: unknown): string[] {
  const e: string[] = [];
  if (!isObj(s)) return ['تنظیمات نامعتبر است.'];
  if (typeof s.telegramUsername !== 'string' || !TG_RE.test(s.telegramUsername.replace(/^@/, ''))) e.push('نام کاربری تلگرام نامعتبر است (۵ تا ۳۲ نویسه لاتین، عدد یا _).');
  str(s, 'brandName', 60, e, 'نام برند');
  str(s, 'brandDescription', 400, e, 'توضیح برند');
  str(s, 'currency', 20, e, 'واحد پول');
  str(s, 'shippingInfo', 600, e, 'اطلاعات ارسال', false);
  if (!isObj(s.contact)) e.push('اطلاعات تماس نامعتبر است.');
  else for (const k of ['email', 'phone', 'address']) str(s.contact, k, 200, e, `تماس: ${k}`, false);
  if (!isObj(s.social)) e.push('شبکه‌های اجتماعی نامعتبرند.');
  else for (const [k, v] of Object.entries(s.social)) if (typeof v !== 'string' || (v !== '' && !/^https:\/\//.test(v)) || v.length > 200) e.push(`لینک «${k}» باید با https:// شروع شود.`);
  if (!isObj(s.seo) || typeof s.seo.priceCurrency !== 'string' || !/^[A-Z]{3}$/.test(s.seo.priceCurrency) || !int(s.seo.priceMultiplier, 1, 1e6)) e.push('تنظیمات سئو نامعتبر است.');
  if (s.orders !== undefined) {
    const o = s.orders;
    if (!isObj(o) || typeof o.enabled !== 'boolean' || typeof o.requireAddress !== 'boolean' || typeof o.messageTemplate !== 'string' || !o.messageTemplate.trim() || o.messageTemplate.length > 2000) e.push('تنظیمات ثبت سفارش یا قالب پیام نامعتبر است (حداکثر ۲۰۰۰ نویسه).');
  }
  if (s.banner !== undefined) {
    const b = s.banner;
    if (!isObj(b) || typeof b.enabled !== 'boolean' || typeof b.text !== 'string' || b.text.length > 200 || typeof b.link !== 'string' || (b.link !== '' && !isSafeLink(b.link)) || typeof b.bg !== 'string' || !HEX_RE.test(b.bg) || typeof b.color !== 'string' || !HEX_RE.test(b.color)) e.push('بنر بالای سایت نامعتبر است (رنگ‌ها به شکل #RRGGBB و لینک #/ یا https://).');
  }
  if (s.wallpaper !== undefined) {
    const w = s.wallpaper;
    if (!isObj(w) || typeof w.enabled !== 'boolean' || typeof w.image !== 'string' || (w.image !== '' && !isImageRef(w.image)) || typeof w.color !== 'string' || (w.color !== '' && !HEX_RE.test(w.color)) || typeof w.overlay !== 'number' || w.overlay < 0 || w.overlay > 0.95) e.push('تصویر زمینه نامعتبر است.');
  }
  validateAppearance(s, e);
  const c = s.customOrder;
  if (!isObj(c) || typeof c.enabled !== 'boolean' || !int(c.basePrice, 0, 1e10) || !isObj(c.groups)) e.push('تنظیمات سفارش سفارشی نامعتبر است.');
  else {
    for (const k of GROUP_KEYS) validateOpts((c.groups as R)[k], k, e);
    const g = c.giftPackaging;
    if (!isObj(g) || typeof g.label !== 'string' || !int(g.extra, -1e9, 1e9)) e.push('بسته‌بندی هدیه نامعتبر است.');
  }
  return e;
}

export const validators = { products: validateProducts, categories: validateCategories, homepage: validateHomepage, settings: validateSettings } as const;
