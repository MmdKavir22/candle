import type { Product, Category } from '../shared/types';
import { unitPrice } from './format';

export interface Filters { q: string; cat: string; sort: 'newest' | 'asc' | 'desc'; avail: boolean }
/** Normalise Arabic/Persian letter variants and ZWNJ for forgiving search. */
export const normFa = (s: string) => s.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim();

export function filterProducts(all: Product[], f: Filters, cats: Category[] = []): Product[] {
  const q = normFa(f.q);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  let out = all.filter((p) => {
    if (f.cat && p.category !== f.cat) return false;
    if (f.avail && !p.available) return false;
    if (!q) return true;
    return normFa([p.name, p.description, p.fragrance, p.waxType, catName.get(p.category) ?? ''].join(' ')).includes(q);
  });
  const idx = new Map(all.map((p, i) => [p.id, i]));
  const when = (p: Product) => (p.createdAt ? Date.parse(p.createdAt) || 0 : 0);
  out = [...out];
  if (f.sort === 'asc') out.sort((a, b) => unitPrice(a) - unitPrice(b));
  else if (f.sort === 'desc') out.sort((a, b) => unitPrice(b) - unitPrice(a));
  else out.sort((a, b) => when(b) - when(a) || Number(b.isNew) - Number(a.isNew) || (idx.get(b.id) ?? 0) - (idx.get(a.id) ?? 0));
  return out;
}
