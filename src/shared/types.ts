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
  customOrder: {
    enabled: boolean;
    basePrice: number;
    groups: Record<GroupKey, Opt[]>;
    giftPackaging: Opt;
  };
}
export type DataName = 'products' | 'categories' | 'homepage' | 'settings';
