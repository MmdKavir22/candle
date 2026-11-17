import { clampQty, normalize, type CartLine } from './logic';

const KEY = 'candle-cart-v1';
const subs = new Set<() => void>();
let lines: CartLine[] = read();

function read(): CartLine[] {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return []; }
}
function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage unavailable: cart lives in memory */ }
  subs.forEach((f) => f());
}
window.addEventListener('storage', (e) => { if (e.key === KEY) { lines = read(); subs.forEach((f) => f()); } });

export const cart = {
  get lines() { return lines; },
  count: () => lines.reduce((s, l) => s + l.qty, 0),
  add(id: string, qty = 1) {
    const l = lines.find((x) => x.id === id);
    if (l) l.qty = clampQty(l.qty + qty); else lines = [...lines, { id, qty: clampQty(qty) }];
    commit();
  },
  setQty(id: string, qty: number) { lines = lines.map((l) => (l.id === id ? { id, qty: clampQty(qty) } : l)); commit(); },
  remove(id: string) { lines = lines.filter((l) => l.id !== id); commit(); },
  clear() { lines = []; commit(); },
  subscribe(fn: () => void) { subs.add(fn); return () => subs.delete(fn); },
};
