import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildOrder, DEFAULT_TEMPLATE, newOrderId, renderOrderMessage, validateOrderInput } from '../src/shared/order';
import { isImageRef, validateCategories, validateProduct, validateSettings } from '../src/shared/validate';
import type { Product } from '../src/shared/types';

const read = (n: string) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8')) as unknown;
const products = read('products') as Product[];
const customer = { name: 'علی رضایی', phone: '09120000000', address: '', notes: '' };
const opts = { id: 'ord-x-abcd', now: '2026-11-18T00:00:00Z', currency: 'تومان', requireAddress: false };
const fmt = { money: (n: number) => `${n} T`, num: (n: number) => String(n), date: () => 'D' };

describe('orders', () => {
  it('computes prices from the catalog and merges duplicate lines', () => {
    const r = buildOrder({ customer, items: [{ id: 'lavender-dream', qty: 2 }, { id: 'lavender-dream', qty: 1 }, { id: 'vanilla-cloud', qty: 1 }] }, products, opts);
    expect(r.errors).toEqual([]);
    expect(r.order?.total).toBe(250000 * 3 + 240000);
    expect(r.order?.items).toHaveLength(2);
    expect(r.order?.status).toBe('new');
  });
  it('rejects unavailable and unknown products', () => {
    expect(buildOrder({ customer, items: [{ id: 'name-candle', qty: 1 }] }, products, opts).errors.length).toBeGreaterThan(0);
    expect(buildOrder({ customer, items: [{ id: 'nope', qty: 1 }] }, products, opts).errors.length).toBeGreaterThan(0);
  });
  it('validates customer data, honeypot and address requirement', () => {
    expect(validateOrderInput({ customer, items: [{ id: 'a', qty: 1 }] }, false)).toEqual([]);
    expect(validateOrderInput({ customer: { ...customer, phone: 'abc' }, items: [{ id: 'a', qty: 1 }] }, false).length).toBeGreaterThan(0);
    expect(validateOrderInput({ customer, items: [{ id: 'a', qty: 1 }], website: 'bot' }, false).length).toBeGreaterThan(0);
    expect(validateOrderInput({ customer, items: [{ id: 'a', qty: 1 }] }, true).length).toBeGreaterThan(0);
    expect(validateOrderInput({ customer, items: [{ id: 'a', qty: 500 }] }, false).length).toBeGreaterThan(0);
  });
  it('renders the customizable template', () => {
    const o = buildOrder({ customer, items: [{ id: 'lavender-dream', qty: 2 }] }, products, opts).order!;
    const m = renderOrderMessage(DEFAULT_TEMPLATE, o, 'B', fmt);
    expect(m).toContain('ord-x-abcd');
    expect(m).toContain('علی رضایی');
    expect(m).toContain('500000 T');
    expect(renderOrderMessage('{{brand}}:{{unknown}}', o, 'B', fmt)).toBe('B:{{unknown}}');
  });
  it('generates well-formed ids', () => expect(/^ord-[a-z0-9]+-[a-z0-9]{4,8}$/.test(newOrderId(Date.now(), new Uint8Array([1, 2, 3, 4, 5, 6])))).toBe(true));
});

describe('images, categories, settings blocks', () => {
  it('accepts repo paths and https URLs only', () => {
    expect(isImageRef('images/products/a.webp')).toBe(true);
    expect(isImageRef('https://cdn.example.com/a.jpg')).toBe(true);
    expect(isImageRef('http://cdn.example.com/a.jpg')).toBe(false);
    expect(isImageRef('javascript:alert(1)')).toBe(false);
    expect(isImageRef('../x.png')).toBe(false);
  });
  it('products may use external image URLs', () => expect(validateProduct({ ...products[0]!, images: ['https://cdn.example.com/p.jpg'] })).toEqual([]));
  it('categories accept Persian names, external images and reject duplicates', () => {
    expect(validateCategories([{ id: 'cat-1', name: 'شمع‌های جدید', image: 'https://cdn.example.com/c.jpg' }])).toEqual([]);
    expect(validateCategories([{ id: 'a', name: 'x' }, { id: 'a', name: 'y' }]).length).toBeGreaterThan(0);
    expect(validateCategories([{ id: 'نام فارسی', name: 'x' }]).length).toBeGreaterThan(0);
  });
  it('old settings stay valid; new blocks are validated', () => {
    const s = read('settings') as Record<string, unknown>;
    expect(validateSettings(s)).toEqual([]);
    expect(validateSettings({ ...s, banner: { enabled: true, text: 't', link: '#/shop', bg: '#A9D6E5', color: '#263746' }, wallpaper: { enabled: true, image: 'https://x.com/w.jpg', color: '', overlay: 0.6 }, orders: { enabled: true, requireAddress: false, messageTemplate: DEFAULT_TEMPLATE } })).toEqual([]);
    expect(validateSettings({ ...s, banner: { enabled: true, text: 't', link: 'javascript:x', bg: 'red', color: '#fff' } }).length).toBeGreaterThan(0);
    expect(validateSettings({ ...s, wallpaper: { enabled: true, image: 'x', color: '', overlay: 5 } }).length).toBeGreaterThan(0);
  });
});
