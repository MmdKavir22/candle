// Run in CI and locally: validates public/data/*.json and cross-references. Exit code 1 on any problem.
import { existsSync, readFileSync } from 'node:fs';
import { validators } from '../src/shared/validate';
import type { Category, Homepage, Product } from '../src/shared/types';

const read = (n: string): unknown => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'));
const problems: string[] = [];
const data: Record<string, unknown> = {};
for (const n of ['products', 'categories', 'homepage', 'settings'] as const) {
  try {
    data[n] = read(n);
    validators[n](data[n]).forEach((m) => problems.push(`${n}.json: ${m}`));
  } catch (e) {
    problems.push(`${n}.json: ${e instanceof Error ? e.message : 'unreadable'}`);
  }
}
if (!problems.length) {
  const products = data.products as Product[];
  const cats = new Set((data.categories as Category[]).map((c) => c.id));
  const ids = new Set(products.map((p) => p.id));
  for (const p of products) {
    if (!cats.has(p.category)) problems.push(`${p.id}: unknown category ${p.category}`);
    for (const i of p.images) if (!existsSync(`public/${i}`)) problems.push(`${p.id}: missing image ${i}`);
  }
  const h = data.homepage as Homepage;
  h.featuredIds.forEach((id) => { if (!ids.has(id)) problems.push(`homepage: unknown featured id ${id}`); });
  if (!existsSync(`public/${h.heroImage}`)) problems.push(`homepage: missing ${h.heroImage}`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('Data files are valid.');
