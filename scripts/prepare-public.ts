// Runs in CI after the private data repo is merged into public/data and BEFORE the build.
// Publishes only an allowlist: drops draft products, private product fields and any unexpected files.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { PUBLIC_DATA_FILES, privateMarkers, toPublicHomepage, toPublicProducts } from '../src/shared/public';
import type { Homepage, Product } from '../src/shared/types';

const dir = 'public/data';
const read = <T>(n: string): T => JSON.parse(readFileSync(`${dir}/${n}.json`, 'utf8')) as T;
const products = read<Product[]>('products');
const homepage = read<Homepage>('homepage');

writeFileSync('.private-markers.json', JSON.stringify(privateMarkers(products))); // read by check-leaks, never published
const pub = toPublicProducts(products);
writeFileSync(`${dir}/products.json`, JSON.stringify(pub, null, 2) + '\n');
writeFileSync(`${dir}/homepage.json`, JSON.stringify(toPublicHomepage(homepage, products), null, 2) + '\n');

const removed: string[] = [];
for (const f of readdirSync(dir)) if (!(PUBLIC_DATA_FILES as readonly string[]).includes(f)) { rmSync(`${dir}/${f}`, { recursive: true, force: true }); removed.push(f); }
if (existsSync('public/orders')) { rmSync('public/orders', { recursive: true, force: true }); removed.push('public/orders'); }
console.log(`Public data prepared: ${pub.length}/${products.length} products published (${products.length - pub.length} draft), removed files: ${removed.join(', ') || 'none'}`);
