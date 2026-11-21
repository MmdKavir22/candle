/** Tiny XSS-safe templating: every interpolated value is HTML-escaped unless wrapped by raw()/html``. */
export class Safe {
  constructor(readonly v: string) {}
  toString() { return this.v; }
}
export const raw = (s: string) => new Safe(s);
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => MAP[c] ?? c);
function render(v: unknown): string {
  if (v instanceof Safe) return v.v;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false || v === true) return '';
  return esc(String(v));
}
export function html(s: TemplateStringsArray, ...vals: unknown[]): Safe {
  let out = s[0] ?? '';
  vals.forEach((v, i) => { out += render(v) + (s[i + 1] ?? ''); });
  return new Safe(out);
}
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
export function mount(el: Element, content: Safe) { el.innerHTML = content.v; }
export const safeLink = (u: string) => (/^(#\/|https:\/\/)/.test(u) ? u : '#/');
