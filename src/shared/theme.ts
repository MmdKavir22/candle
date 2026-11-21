// Appearance + conversion defaults and resolvers shared by the storefront, the admin preview and tests. Pure.
import { AREA_IDS, HOME_SECTION_IDS, type Area, type FontKey, type HomeConfig, type HomeSectionId, type ImageSlot, type Marketing, type Settings, type SlotConfig, type Theme, type ThemeColors } from './types';

export const DEFAULT_COLORS: ThemeColors = { primary: '#A9D6E5', secondary: '#D6EFF7', bg: '#F7FBFD', accent: '#7FB8CC', accentInk: '#1F5D73', text: '#263746', muted: '#718492', border: '#E5EFF3' };
export const PRESETS: { id: string; label: string; colors: ThemeColors; bg: { color: string; color2: string } }[] = [
  { id: 'ocean', label: 'آبی پاستلی', colors: DEFAULT_COLORS, bg: { color: '#EAF6FA', color2: '#CFE9F3' } },
  { id: 'blush', label: 'صورتی ملایم', colors: { primary: '#F4C7D3', secondary: '#FBE3EA', bg: '#FFF8FA', accent: '#E39AB0', accentInk: '#9A3D5C', text: '#3A2630', muted: '#8A7480', border: '#F3E2E8' }, bg: { color: '#FFF1F5', color2: '#F8D9E3' } },
  { id: 'mint', label: 'سبز نعنایی', colors: { primary: '#BFE3D0', secondary: '#E1F4EA', bg: '#F7FCF9', accent: '#7DBE9C', accentInk: '#2D6B4E', text: '#24372D', muted: '#6E8578', border: '#E1EFE7' }, bg: { color: '#EEF9F3', color2: '#CDE9DB' } },
  { id: 'sand', label: 'کرم و شنی', colors: { primary: '#E8D3B0', secondary: '#F6EAD6', bg: '#FFFBF4', accent: '#C9A26A', accentInk: '#7A5420', text: '#3A2F22', muted: '#8A7B68', border: '#F0E6D4' }, bg: { color: '#FBF3E4', color2: '#EEDCBC' } },
  { id: 'lavender', label: 'یاسی', colors: { primary: '#D3C9EE', secondary: '#ECE7F8', bg: '#FAF8FE', accent: '#A593D6', accentInk: '#5A3FA0', text: '#2D2740', muted: '#7A7490', border: '#E9E4F4' }, bg: { color: '#F3EFFB', color2: '#DDD3F2' } },
  { id: 'graphite', label: 'طوسی مدرن', colors: { primary: '#CBD5DB', secondary: '#E7ECEF', bg: '#F8FAFB', accent: '#6F8794', accentInk: '#2F4551', text: '#1E2A31', muted: '#6B7A83', border: '#E3E9EC' }, bg: { color: '#EEF2F4', color2: '#D5DEE3' } },
];

export const DEFAULT_AREA: Area = { mode: 'inherit', color: '#EAF6FA', color2: '#CFE9F3', angle: 160, image: '', imageMobile: '', opacity: 1, overlay: 0, blur: 0, size: 'cover', position: 'center', repeat: false, attachment: 'scroll' };
export const AREA_LABEL: Record<(typeof AREA_IDS)[number], [string, string]> = {
  page: ['پس‌زمینه کل صفحه', 'پشت همه چیز؛ ثابت می‌ماند و فقط محتوا اسکرول می‌شود'],
  header: ['هدر (منوی بالا)', 'نوار بالای سایت'],
  hero: ['بخش اصلی صفحه اول (Hero)', 'کادر عنوان و دکمه‌های صفحه اول'],
  intro: ['بخش معرفی برند', 'نوار «دست‌ساز، با دقت» در صفحه اصلی'],
  promo: ['پیشنهاد ویژه', 'کادر شمارنده/تخفیف در صفحه اصلی'],
  footer: ['فوتر', 'پایین همه صفحه‌ها'],
};
export const FONT_STACKS: Record<FontKey, string> = {
  vazir: "'Vazirmatn Variable', Tahoma, system-ui, sans-serif",
  system: "system-ui, 'Segoe UI', Tahoma, sans-serif",
  serif: "'Noto Naskh Arabic', 'Times New Roman', Georgia, serif",
};
export const FONT_LABEL: Record<FontKey, string> = { vazir: 'وزیرمتن (پیش‌فرض)', system: 'فونت سیستم', serif: 'نسخ / سریف' };

export const DEFAULT_THEME: Theme = {
  colors: DEFAULT_COLORS, radius: 16, buttons: 'pill', motion: true, motionLevel: 'normal',
  glass: { enabled: true, blur: 14, opacity: 0.66, border: 0.7, shadow: 0.25, saturate: 150, targets: { cards: true, panels: true, footer: true, buttons: true } },
  bg: { mode: 'gradient', color: '#EAF6FA', color2: '#CFE9F3', angle: 160, blobs: true, imageBlur: 0 },
  areas: Object.fromEntries(AREA_IDS.map((k) => [k, { ...DEFAULT_AREA }])) as Theme['areas'],
  type: { font: 'vazir', headingFont: 'vazir', base: 16, headingScale: 1, lineHeight: 1.9, weight: 400 },
  ui: { buttonSize: 'md', cardStyle: 'elevated', cardRatio: '1/1', shadow: 0.35, density: 'comfortable', container: 1160, navStyle: 'glass', navSticky: true, navItems: 'pill', logoSize: 34 },
};
type O = Record<string, unknown>;
const mix = <T>(d: T, p: unknown): T => ({ ...d, ...((p ?? {}) as O) }) as T;
export const resolveTheme = (s: Pick<Settings, 'theme'>): Theme => {
  const t = (s.theme ?? {}) as Partial<Record<keyof Theme, unknown>> & { glass?: { targets?: unknown }; areas?: Record<string, unknown> };
  const d = DEFAULT_THEME;
  return {
    ...d, ...(t as O),
    colors: mix(d.colors, t.colors),
    glass: { ...mix(d.glass, t.glass), targets: mix(d.glass.targets, t.glass?.targets) },
    bg: mix(d.bg, t.bg),
    areas: Object.fromEntries(AREA_IDS.map((k) => [k, mix(DEFAULT_AREA, t.areas?.[k])])) as Theme['areas'],
    type: mix(d.type, t.type), ui: mix(d.ui, t.ui),
  } as Theme;
};
/** Effective animation level (the legacy `motion: false` switch still wins). */
export const motionLevel = (t: Theme) => (t.motion ? t.motionLevel : 'off');

export const SECTION_LABEL: Record<HomeSectionId, string> = {
  hero: 'هدر اصلی (عنوان و تصویر)', benefits: 'نوار مزایا', promo: 'پیشنهاد ویژه (شمارنده)', featured: 'محصولات ویژه', bestsellers: 'پرفروش‌ها', new: 'تازه‌ها',
  recent: 'اخیراً دیده‌اید', categories: 'دسته‌بندی‌ها', collections: 'مجموعه‌های ویژه', banners: 'بنرها', steps: 'مراحل سفارش', intro: 'معرفی برند', testimonials: 'نظر مشتریان', care: 'نکات نگهداری', faq: 'پرسش‌های متداول و تماس',
};
export const DEFAULT_STEPS = [
  { title: 'انتخاب', text: 'محصولات را ببینید و به سبد اضافه کنید.' },
  { title: 'ثبت در تلگرام', text: 'سفارش را ثبت کنید و پیام آماده را در تلگرام برای ما بفرستید.' },
  { title: 'تأیید و ارسال', text: 'پس از هماهنگی موجودی، پرداخت و ارسال، سفارش شما آماده می‌شود.' },
];
export function resolveHome(s: Pick<Settings, 'home'>): HomeConfig {
  const h = s.home ?? {};
  const saved = (h.sections ?? []).filter((x): x is { id: HomeSectionId; show: boolean } => !!x && (HOME_SECTION_IDS as readonly string[]).includes(x.id as string));
  const seen = new Set(saved.map((x) => x.id));
  const sections = [...saved.filter((x, i) => saved.findIndex((y) => y.id === x.id) === i), ...HOME_SECTION_IDS.filter((id) => !seen.has(id)).map((id) => ({ id, show: true }))];
  return { sections, benefits: (h.benefits as HomeConfig['benefits'] | undefined) ?? [], steps: (h.steps as HomeConfig['steps'] | undefined) ?? DEFAULT_STEPS, promo: { enabled: false, title: '', text: '', endsAt: '', link: '', ...h.promo }, styles: (h.styles as HomeConfig['styles'] | undefined) ?? {} };
}
export const resolveMarketing = (s: Pick<Settings, 'marketing'>): Marketing => {
  const m = s.marketing ?? {};
  return { stickyCta: true, askOnProduct: true, productNote: '', recentlyViewed: true, crossSell: true, ...m, freeShipping: { enabled: false, threshold: 0, ...m.freeShipping } };
};

export const SLOT_DEFAULT_SHOW: Record<ImageSlot, boolean> = { logo: false, hero: true, categories: true, banners: true, intro: false, about: false, shop: false, custom: false, contact: false };
export const SLOT_LABEL: Record<ImageSlot, [string, string]> = {
  logo: ['لوگو', 'کنار نام برند در هدر؛ اگر خاموش باشد آیکون پیش‌فرض نمایش داده می‌شود'],
  hero: ['تصویر هدر صفحه اصلی', 'تصویر بزرگ کنار عنوان صفحه اول؛ خاموش = فقط متن'],
  categories: ['تصویر دسته‌بندی‌ها', 'در صفحه اصلی و صفحه دسته‌ها (تصویر هر دسته در همین تب پایین‌تر)'],
  banners: ['تصویر بنرها', 'دایره کنار بنرهای صفحه اصلی (تصویر هر بنر در همین تب پایین‌تر)'],
  intro: ['تصویر معرفی برند', 'کنار متن «دست‌ساز، با دقت» در صفحه اصلی'],
  about: ['کاور صفحه درباره ما', 'نوار تصویر بالای صفحه'],
  shop: ['کاور صفحه فروشگاه', 'نوار تصویر بالای لیست محصولات'],
  custom: ['کاور صفحه شمع سفارشی', 'نوار تصویر بالای فرم سفارش'],
  contact: ['کاور صفحه تماس', 'نوار تصویر بالای صفحه تماس'],
};
export const slotOf = (s: Pick<Settings, 'images'>, k: ImageSlot): Required<SlotConfig> => {
  const c = s.images?.[k];
  return { show: c?.show ?? SLOT_DEFAULT_SHOW[k], image: c?.image ?? '', fit: c?.fit ?? 'cover', position: c?.position ?? 'center', ratio: c?.ratio ?? 'auto', radius: c?.radius ?? null };
};
/** CSS custom properties for an image slot (only validated enum/number values reach this string). */
export const slotVars = (o: Required<SlotConfig>): string =>
  `--fit:${o.fit};--pos:${o.position};${o.ratio === 'auto' ? '' : `--ratio:${o.ratio};`}${o.radius === null ? '' : `--rad:${o.radius}px;`}`;

const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
/** WCAG contrast ratio of two #RRGGBB colours (AA text needs >= 4.5). */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
