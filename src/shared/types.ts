export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  discountPrice: number | null;
  category: string;
  images: string[];
  imageAlts?: string[];
  fragrance: string;
  size: string;
  waxType: string;
  burningDuration: string;
  available: boolean;
  featured: boolean;
  isNew: boolean;
  bestSeller: boolean;
  specs?: Record<string, string>;
  createdAt?: string;
  /** Private fields: stored only in the private data repo, stripped from every public build (see shared/public.ts). */
  published?: boolean; // false = draft: never published
  costPrice?: number;
  supplier?: string;
  internalNote?: string;
}
export interface Category { id: string; name: string; description?: string; image?: string }
export interface Banner { title: string; text: string; link: string; image?: string }
export interface Homepage {
  heroTitle: string;
  heroDescription: string;
  heroImage: string;
  banners: Banner[];
  featuredIds: string[];
  collections: { title: string; description: string; categoryId: string }[];
  intro: { title: string; text: string; points: string[] };
  careTips: { title: string; text: string }[];
  faq: { q: string; a: string }[];
  testimonials: { name: string; text: string }[];
}
export interface Opt { label: string; extra: number }
export const GROUP_KEYS = ['size', 'shape', 'color', 'fragrance', 'wax', 'container', 'style'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];
export interface Settings {
  telegramUsername: string;
  brandName: string;
  brandDescription: string;
  contact: { email: string; phone: string; address: string };
  social: Record<string, string>;
  currency: string;
  shippingInfo: string;
  seo: { priceCurrency: string; priceMultiplier: number };
  /** Optional blocks (older settings.json files without them stay valid). */
  orders?: { enabled: boolean; requireAddress: boolean; messageTemplate: string };
  banner?: { enabled: boolean; text: string; link: string; bg: string; color: string };
  wallpaper?: { enabled: boolean; image: string; color: string; overlay: number };
  /** Appearance & conversion options. Every field is optional: missing values fall back to shared/theme.ts defaults. */
  theme?: DeepPartial<Theme>;
  images?: Partial<Record<ImageSlot, SlotConfig>>;
  home?: DeepPartial<HomeConfig>;
  marketing?: DeepPartial<Marketing>;
  customOrder: {
    enabled: boolean;
    basePrice: number;
    groups: Record<GroupKey, Opt[]>;
    giftPackaging: Opt;
  };
}
export const IMAGE_SLOTS = ['logo', 'hero', 'categories', 'banners', 'intro', 'about', 'shop', 'custom', 'contact'] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];
export const HOME_SECTION_IDS = ['hero', 'benefits', 'promo', 'featured', 'bestsellers', 'new', 'recent', 'categories', 'collections', 'banners', 'steps', 'intro', 'testimonials', 'care', 'faq'] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];
export interface ThemeColors { primary: string; secondary: string; bg: string; accent: string; accentInk: string; text: string; muted: string; border: string }
export const AREA_IDS = ['page', 'header', 'hero', 'intro', 'promo', 'footer'] as const;
export type AreaId = (typeof AREA_IDS)[number];
export type FontKey = 'vazir' | 'system' | 'serif';
export type Pos = 'center' | 'top' | 'bottom' | 'left' | 'right';
export interface Area {
  mode: 'inherit' | 'solid' | 'gradient' | 'image'; color: string; color2: string; angle: number;
  image: string; imageMobile: string; opacity: number; blur: number;
  size: 'cover' | 'contain' | 'auto'; position: Pos; repeat: boolean; attachment: 'scroll' | 'fixed';
}
export interface Theme {
  colors: ThemeColors; radius: number; buttons: 'pill' | 'rounded' | 'square'; motion: boolean; motionLevel: 'off' | 'subtle' | 'normal' | 'lively';
  glass: { enabled: boolean; blur: number; opacity: number; border: number; shadow: number; saturate: number; targets: { cards: boolean; panels: boolean; footer: boolean; buttons: boolean } };
  bg: { mode: 'solid' | 'gradient'; color: string; color2: string; angle: number; blobs: boolean; imageBlur: number };
  areas: Record<AreaId, Area>;
  type: { font: FontKey; headingFont: FontKey; base: number; headingScale: number; lineHeight: number; weight: number };
  ui: { buttonSize: 'sm' | 'md' | 'lg'; cardStyle: 'elevated' | 'flat' | 'outlined'; cardRatio: '1/1' | '4/5' | '3/4'; shadow: number; density: 'compact' | 'comfortable' | 'spacious'; container: number; navStyle: 'solid' | 'glass' | 'transparent'; navSticky: boolean; navItems: 'pill' | 'underline'; logoSize: number };
}
export interface SectionStyle { padTop: number; padBottom: number; bg: string; align: 'start' | 'center' }
export interface SlotConfig { show: boolean; image: string; fit?: 'cover' | 'contain'; position?: Pos; ratio?: 'auto' | '1/1' | '4/3' | '16/9' | '21/9' | '3/4'; radius?: number | null }
export interface HomeConfig {
  sections: { id: HomeSectionId; show: boolean }[];
  benefits: { icon: string; title: string; text: string }[];
  steps: { title: string; text: string }[];
  promo: { enabled: boolean; title: string; text: string; endsAt: string; link: string };
  styles: Partial<Record<HomeSectionId, SectionStyle>>;
}
export interface Marketing {
  freeShipping: { enabled: boolean; threshold: number };
  stickyCta: boolean; askOnProduct: boolean; productNote: string; recentlyViewed: boolean; crossSell: boolean;
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };
export type DataName = 'products' | 'categories' | 'homepage' | 'settings';
