const KEY = 'candle-recent-v1';
export function getRecent(): string[] {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, 8) : [];
  } catch { return []; }
}
export function pushRecent(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([id, ...getRecent().filter((x) => x !== id)].slice(0, 8))); } catch { /* storage unavailable */ }
}
