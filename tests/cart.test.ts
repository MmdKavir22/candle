import { describe, expect, it } from 'vitest';
import { normalize, resolve, clampQty } from '../src/cart/logic';
import { orderText, telegramUrl } from '../src/services/telegram';
import { filterProducts } from '../src/utils/catalog';
import { esc, html } from '../src/utils/dom';
import type { Product } from '../src/shared/types';

const p = (id: string, price: number, discountPrice: number | null = null, extra: Partial<Product> = {}): Product => ({
  id, name: `محصول ${id}`, description: 'توضیح', price, discountPrice, category: 'scented', images: [`images/products/${id}.webp`],
  fragrance: 'وانیل', size: 'M', waxType: 'soy', burningDuration: '30h', available: true, featured: false, isNew: false, bestSeller: false, ...extra,
});
const products = [p('a', 100, 80), p('b', 50, null, { available: false }), p('c', 200, null, { name: 'ياس سفید', createdAt: '2026-05-01T00:00:00Z' })];

describe('cart', () => {
  it('normalises untrusted storage data', () => {
    expect(normalize('x')).toEqual([]);
    expect(normalize([{ id: 'a', qty: 2 }, { id: 'a', qty: 3 }, { id: 5, qty: 1 }, null, { id: 'z', qty: 'x' }])).toEqual([{ id: 'a', qty: 5 }]);
    expect(clampQty(1000)).toBe(99);
    expect(clampQty(-3)).toBe(1);
  });
  it('computes totals with discounts and skips unknown products', () => {
    const r = resolve([{ id: 'a', qty: 2 }, { id: 'c', qty: 1 }, { id: 'gone', qty: 4 }], products);
    expect(r.subtotal).toBe(80 * 2 + 200);
    expect(r.count).toBe(3);
    expect(r.items).toHaveLength(2);
  });
});
describe('telegram', () => {
  it('builds profile links only for valid usernames', () => {
    expect(telegramUrl('@my_shop1')).toBe('https://t.me/my_shop1');
    expect(telegramUrl('no')).toBeNull();
    expect(telegramUrl('bad name')).toBeNull();
  });
  it('generates a Persian order summary', () => {
    const { items, subtotal } = resolve([{ id: 'a', qty: 2 }], products);
    const t = orderText(items, subtotal, 'تومان', (id) => `https://x.test/products/${id}/`);
    expect(t).toContain('محصول a');
    expect(t).toContain('کد: a');
    expect(t).toContain('جمع کل');
    expect(t).toContain('https://x.test/products/a/');
  });
});
describe('catalog filtering', () => {
  const f = { q: '', cat: '', sort: 'newest' as const, avail: false };
  it('filters availability, sorts by price and normalises Arabic letters in search', () => {
    expect(filterProducts(products, { ...f, avail: true }).map((x) => x.id)).toEqual(expect.not.arrayContaining(['b']));
    expect(filterProducts(products, { ...f, sort: 'asc' }).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(filterProducts(products, { ...f, sort: 'desc' })[0]!.id).toBe('c');
    expect(filterProducts(products, { ...f, q: 'یاس' }).map((x) => x.id)).toEqual(['c']);
  });
});
describe('escaping', () => {
  it('escapes interpolated values by default', () => {
    expect(esc('<img onerror=x>')).toBe('&lt;img onerror=x&gt;');
    expect(html`<p>${'<script>alert(1)</script>'}</p>`.v).not.toContain('<script>');
    expect(html`<b>${html`<i>ok</i>`}</b>`.v).toBe('<b><i>ok</i></b>');
  });
});
