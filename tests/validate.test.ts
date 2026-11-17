import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateProduct, validateProducts, validateSettings, validators, isSafeLink } from '../src/shared/validate';

const read = (n: string) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8')) as unknown;
const good = (read('products') as Record<string, unknown>[])[0]!;

describe('shipped data', () => {
  for (const n of ['products', 'categories', 'homepage', 'settings'] as const) {
    it(`${n}.json is valid`, () => expect(validators[n](read(n))).toEqual([]));
  }
});
describe('product validation', () => {
  it('accepts a valid product', () => expect(validateProduct(good)).toEqual([]));
  it('rejects bad id, price and discount', () => {
    expect(validateProduct({ ...good, id: 'Bad Id' }).length).toBeGreaterThan(0);
    expect(validateProduct({ ...good, price: -5 }).length).toBeGreaterThan(0);
    expect(validateProduct({ ...good, discountPrice: 999999999 }).length).toBeGreaterThan(0);
  });
  it('rejects path traversal in image paths', () => expect(validateProduct({ ...good, images: ['../../secret.png'] }).length).toBeGreaterThan(0));
  it('rejects duplicate ids', () => expect(validateProducts([good, good]).some((m) => m.includes('تکراری'))).toBe(true));
});
describe('settings & links', () => {
  it('rejects invalid telegram username', () => {
    const s = read('settings') as Record<string, unknown>;
    expect(validateSettings({ ...s, telegramUsername: 'a b' }).length).toBeGreaterThan(0);
  });
  it('blocks javascript: links', () => {
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('#/shop')).toBe(true);
    expect(isSafeLink('https://example.com')).toBe(true);
  });
});
