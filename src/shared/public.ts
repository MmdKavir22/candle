// What may be published. The private data repo holds extra fields and draft products; only this allowlist reaches the public site.
import type { Homepage, Product } from './types';

export const PUBLIC_PRODUCT_KEYS = ['id', 'name', 'description', 'price', 'discountPrice', 'category', 'images', 'imageAlts', 'fragrance', 'size', 'waxType', 'burningDuration', 'available', 'featured', 'isNew', 'bestSeller', 'specs', 'createdAt'] as const;
export const PRIVATE_PRODUCT_KEYS = ['published', 'costPrice', 'supplier', 'internalNote'] as const;
/** The only JSON files the public site may serve. */
export const PUBLIC_DATA_FILES = ['products.json', 'categories.json', 'homepage.json', 'settings.json'] as const;

export const isPublished = (p: Product) => p.published !== false;
export function toPublicProduct(p: Product): Product {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_PRODUCT_KEYS) if (p[k] !== undefined) out[k] = p[k];
  return out as unknown as Product;
}
export const toPublicProducts = (list: Product[]): Product[] => list.filter(isPublished).map(toPublicProduct);
/** Featured ids that point to drafts must not leak the draft's existence. */
export const toPublicHomepage = (h: Homepage, products: Product[]): Homepage => {
  const ok = new Set(products.filter(isPublished).map((p) => p.id));
  return { ...h, featuredIds: h.featuredIds.filter((id) => ok.has(id)) };
};
/** Strings that must never appear anywhere in the built site. */
export function privateMarkers(products: Product[]): string[] {
  const published = JSON.stringify(toPublicProducts(products));
  const m: string[] = [];
  for (const p of products) {
    if (p.internalNote && p.internalNote.trim().length >= 4) m.push(p.internalNote.trim());
    if (p.supplier && p.supplier.trim().length >= 4) m.push(p.supplier.trim());
    if (!isPublished(p)) { m.push(p.id); if (p.name.length >= 4) m.push(p.name); }
  }
  // a marker that legitimately appears in published data (e.g. same product name) cannot be a leak signal
  return [...new Set(m)].filter((x) => !published.includes(x));
}
export const LEAK_PATTERNS: [string, RegExp][] = [
  ['GitHub token', /\b(ghp_|gho_|ghs_|ghu_|github_pat_)[A-Za-z0-9_]{16,}/],
  ['private product field', /"(costPrice|internalNote|supplier)"\s*:/],
  ['order id', /\bord-[a-z0-9]{6,}-[a-z0-9]{4,8}\b/],
  ['orders path', /orders\/\d{4}-\d{2}\//],
];
