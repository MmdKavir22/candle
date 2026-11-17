import type { Product } from '../shared/types';
import { unitPrice } from '../utils/format';

export interface CartLine { id: string; qty: number }
export interface CartItem { product: Product; qty: number; unit: number; total: number }
export const MAX_QTY = 99;
export const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));

/** Safely turn untrusted stored data into cart lines. */
export function normalize(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const m = new Map<string, number>();
  for (const x of input) {
    if (typeof x !== 'object' || x === null) continue;
    const { id, qty } = x as Record<string, unknown>;
    if (typeof id === 'string' && id.length <= 80 && typeof qty === 'number') m.set(id, clampQty((m.get(id) ?? 0) + clampQty(qty)));
  }
  return [...m].map(([id, qty]) => ({ id, qty }));
}

export function resolve(lines: CartLine[], products: Product[]) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: CartItem[] = [];
  for (const l of lines) {
    const product = byId.get(l.id);
    if (!product) continue;
    const unit = unitPrice(product);
    items.push({ product, qty: l.qty, unit, total: unit * l.qty });
  }
  return { items, subtotal: items.reduce((s, i) => s + i.total, 0), count: items.reduce((s, i) => s + i.qty, 0) };
}
