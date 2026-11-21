// Runs after `npm run build`: fails the pipeline if anything private ended up in the deployable site.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LEAK_PATTERNS, PUBLIC_DATA_FILES } from '../src/shared/public';

const DIST = 'dist';
const TEXT = /\.(html|js|mjs|css|json|txt|xml|svg|map|webmanifest)$/i;
const markers: string[] = existsSync('.private-markers.json') ? (JSON.parse(readFileSync('.private-markers.json', 'utf8')) as string[]) : [];
const problems: string[] = [];

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
if (!existsSync(DIST)) { console.error('dist/ not found: run the build first'); process.exit(1); }
const files = walk(DIST);

for (const f of files) {
  const rel = f.slice(DIST.length + 1).replace(/\\/g, '/');
  if (rel.startsWith('orders/') || rel === '.private-markers.json') problems.push(`${rel}: private file in build output`);
  if (rel.startsWith('data/') && !(PUBLIC_DATA_FILES as readonly string[]).includes(rel.slice(5))) problems.push(`${rel}: unexpected file in data/`);
  if (!TEXT.test(f)) continue;
  const t = readFileSync(f, 'utf8');
  for (const [name, re] of LEAK_PATTERNS) if (re.test(t)) problems.push(`${rel}: ${name}`);
  for (const m of markers) if (t.includes(m)) problems.push(`${rel}: contains private value «${m.slice(0, 20)}»`);
}
if (problems.length) { console.error(`LEAK CHECK FAILED (${problems.length}):\n${problems.join('\n')}`); process.exit(1); }
console.log(`Leak check passed: ${files.length} files scanned, ${markers.length} private markers, ${LEAK_PATTERNS.length} patterns.`);
