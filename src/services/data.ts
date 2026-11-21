import type { Category, Homepage, Product, Settings } from '../shared/types';
import { validateProduct } from '../shared/validate';
import { asset } from '../utils/format';

export interface Catalog { products: Product[]; categories: Category[]; homepage: Homepage; settings: Settings }

async function load<T>(name: string): Promise<T> {
  const r = await fetch(asset(`data/${name}.json`), { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
  return (await r.json()) as T;
}

export async function loadCatalog(): Promise<Catalog> {
  const [products, categories, homepage, settings] = await Promise.all([
    load<unknown[]>('products'), load<Category[]>('categories'), load<Homepage>('homepage'), load<Settings>('settings'),
  ]);
  // Drop malformed records instead of breaking the whole storefront.
  const ok = (Array.isArray(products) ? products : []).filter((p) => validateProduct(p).length === 0) as Product[];
  const tg = import.meta.env.VITE_TELEGRAM_USERNAME;
  if (tg && (!settings.telegramUsername || settings.telegramUsername === 'YOUR_TELEGRAM_USERNAME')) settings.telegramUsername = tg;
  return { products: ok, categories, homepage, settings };
}
