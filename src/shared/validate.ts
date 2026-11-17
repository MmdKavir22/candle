// Pure validation shared by the admin UI, CI and tests.
import { GROUP_KEYS } from './types';

type R = Record<string, unknown>;
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const IMG_RE = /^images\/(products|banners|categories)\/[a-z0-9][a-z0-9-]*\.(webp|jpe?g|png|svg)$/;
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
  else if (!p.images.every((i) => typeof i === 'string' && IMG_RE.test(i))) e.push('مسیر تصویر نامعتبر است.');
  if (p.imageAlts !== undefined) {
    if (!Array.isArray(p.imageAlts) || !p.imageAlts.every((a) => typeof a === 'string' && a.length <= 160)) e.push('متن جایگزین تصویر نامعتبر است.');
  }
  for (const [k, l] of [['fragrance', 'رایحه'], ['size', 'اندازه'], ['waxType', 'نوع موم'], ['burningDuration', 'مدت سوختن']] as const) str(p, k, 80, e, l, false);
  for (const [k, l] of [['available', 'موجود'], ['featured', 'ویژه'], ['isNew', 'جدید'], ['bestSeller', 'پرفروش']] as const) bool(p, k, e, l);
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
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) e.push(`دسته ${i + 1}: شناسه نامعتبر.`);
    else if (seen.has(c.id)) e.push(`شناسه دسته تکراری: ${c.id}`);
    else seen.add(c.id);
    str(c, 'name', 60, e, `نام دسته ${i + 1}`);
    str(c, 'description', 200, e, `توضیح دسته ${i + 1}`, false);
    if (c.image !== undefined && (typeof c.image !== 'string' || !IMG_RE.test(c.image))) e.push(`تصویر دسته ${i + 1} نامعتبر است.`);
  });
  return e;
}

export function validateHomepage(h: unknown): string[] {
  const e: string[] = [];
  if (!isObj(h)) return ['اطلاعات صفحه اصلی نامعتبر است.'];
  str(h, 'heroTitle', 120, e, 'عنوان');
  str(h, 'heroDescription', 400, e, 'توضیح');
  if (typeof h.heroImage !== 'string' || !IMG_RE.test(h.heroImage)) e.push('تصویر اصلی نامعتبر است.');
  if (!Array.isArray(h.banners) || h.banners.length > 10) e.push('بنرها نامعتبرند.');
  else h.banners.forEach((b, i) => {
    if (!isObj(b)) return void e.push(`بنر ${i + 1} نامعتبر است.`);
    str(b, 'title', 80, e, `عنوان بنر ${i + 1}`);
    str(b, 'text', 200, e, `متن بنر ${i + 1}`, false);
    if (typeof b.link !== 'string' || !isSafeLink(b.link)) e.push(`لینک بنر ${i + 1} باید با #/ یا https:// شروع شود.`);
    if (b.image !== undefined && (typeof b.image !== 'string' || !IMG_RE.test(b.image))) e.push(`تصویر بنر ${i + 1} نامعتبر است.`);
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
