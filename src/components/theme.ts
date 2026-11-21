import { AREA_IDS, type Area, type AreaId, type Settings } from '../shared/types';
import { FONT_STACKS, motionLevel, resolveHome, resolveTheme } from '../shared/theme';
import { isImageRef } from '../shared/validate';
import { asset } from '../utils/format';

const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const url = (p: string) => `url("${encodeURI(asset(p))}")`; // p is validated by isImageRef; encodeURI neutralises quotes/backslashes
const img = (p: string) => (p && isImageRef(p) ? p : '');
const SEL: Record<Exclude<AreaId, 'page'>, string> = { header: '.site-header', hero: '.hero', intro: '.alt', promo: '.promo', footer: 'footer' };
const BTN_H = { sm: '38px', md: '44px', lg: '52px' } as const;
const BTN_FS = { sm: '.85rem', md: '.95rem', lg: '1.05rem' } as const;
const BTN_R = { pill: '999px', rounded: 'var(--r-sm)', square: '4px' } as const;
const SPACE = { compact: '.7', comfortable: '1', spacious: '1.35' } as const;
const LIFT = { off: '0px', subtle: '-3px', normal: '-6px', lively: '-10px' } as const;
const ANIM = { off: '0', subtle: '.6', normal: '1', lively: '1.4' } as const;

/** Layer paint for one area. Only enum/number/hex values (validated) or encodeURI'd URLs are interpolated. */
function paint(a: Area): string {
  if (a.mode === 'solid') return `background:${a.color};`;
  if (a.mode === 'gradient') return `background:linear-gradient(${a.angle}deg,${a.color},${a.color2});`;
  const i = img(a.image);
  return i ? `background-image:${url(i)};background-size:${a.size};background-position:${a.position};background-repeat:${a.repeat ? 'repeat' : 'no-repeat'};background-attachment:${a.attachment};` : '';
}
function areaCss(id: Exclude<AreaId, 'page'>, a: Area): string {
  if (a.mode === 'inherit') return '';
  const sel = SEL[id];
  const reset = id === 'hero' ? `${sel}::after{display:none}${sel}{padding-inline:clamp(1rem,3vw,2rem);border-radius:var(--r-lg)}` : '';
  const mob = a.mode === 'image' && img(a.imageMobile) ? `@media (max-width:800px){${sel}::before{background-image:${url(img(a.imageMobile))}}}` : '';
  return `${reset}${sel}{position:relative;isolation:isolate}`
    + `${sel}::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;width:auto;height:auto;aspect-ratio:auto;transform:none;animation:none;opacity:${a.opacity};${a.blur ? `filter:blur(${a.blur}px);` : 'filter:none;'}${paint(a)}}`
    + `@media (max-width:800px){${sel}::before{background-attachment:scroll}}${mob}`;
}

/** Applies colours, typography, buttons, cards, nav, spacing, motion, glass and every background layer from settings. */
export function applyTheme(s: Settings) {
  const t = resolveTheme(s), c = t.colors, u = t.ui, g = t.glass, root = document.documentElement.style, b = document.body;
  const lvl = motionLevel(t);
  const vars: Record<string, string> = {
    '--primary': c.primary, '--secondary': c.secondary, '--bg': c.bg, '--accent': c.accent, '--accent-ink': c.accentInk, '--text': c.text, '--muted': c.muted, '--border': c.border,
    '--r-md': `${t.radius}px`, '--r-lg': `${Math.round(t.radius * 1.75)}px`, '--r-sm': `${Math.max(4, Math.round(t.radius * 0.6))}px`,
    '--glass-a': String(g.opacity), '--glass-blur-base': `${g.blur}px`, '--glass-border': String(g.border), '--glass-shadow': String(g.shadow), '--glass-sat': `${g.saturate}%`,
    '--font': FONT_STACKS[t.type.font], '--font-head': FONT_STACKS[t.type.headingFont], '--fs': `${t.type.base}px`, '--hs': String(t.type.headingScale), '--lh': String(t.type.lineHeight), '--fw': String(t.type.weight),
    '--btn-h': BTN_H[u.buttonSize], '--btn-fs': BTN_FS[u.buttonSize], '--btn-r': BTN_R[t.buttons],
    '--card-ratio': u.cardRatio, '--shadow': `0 10px 30px -14px rgba(60,120,145,${u.shadow})`,
    '--space': SPACE[u.density], '--container': `${u.container}px`, '--logo': `${u.logoSize}px`, '--lift': LIFT[lvl], '--anim': ANIM[lvl],
  };
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));
  const on = g.enabled;
  const flags: Record<string, boolean> = {
    'glass-cards': on && g.targets.cards, 'glass-panels': on && g.targets.panels, 'glass-footer': on && g.targets.footer, 'glass-buttons': on && g.targets.buttons,
    'nav-glass': on && u.navStyle === 'glass', 'nav-solid': u.navStyle === 'solid' || (u.navStyle === 'glass' && !on), 'nav-transparent': u.navStyle === 'transparent',
    'nav-static': !u.navSticky, 'nav-underline': u.navItems === 'underline', 'cards-flat': u.cardStyle === 'flat', 'cards-outlined': u.cardStyle === 'outlined',
    'motion-off': lvl === 'off', 'no-motion': lvl === 'off',
  };
  Object.entries(flags).forEach(([k, v]) => b.classList.toggle(k, v));
  document.querySelector<HTMLMetaElement>('meta[name=theme-color]')?.setAttribute('content', c.primary);

  // ---- page background layer: the "page" area (if configured), otherwise the gradient/colour + optional legacy wallpaper
  document.getElementById('bg')?.remove();
  const page = t.areas.page, w = s.wallpaper;
  const layer = document.createElement('div');
  layer.id = 'bg';
  layer.setAttribute('aria-hidden', 'true');
  const css: string[] = [];
  if (page.mode !== 'inherit') {
    const inner = document.createElement('div');
    inner.className = 'bg-img';
    inner.style.cssText = `${paint({ ...page, attachment: 'scroll' })}opacity:${page.opacity};${page.blur ? `filter:blur(${page.blur}px);` : ''}`;
    layer.style.background = c.bg;
    layer.append(inner);
    if (page.attachment === 'scroll') layer.classList.add('abs');
    if (page.mode === 'image' && img(page.imageMobile)) css.push(`@media (max-width:800px){#bg .bg-img{background-image:${url(img(page.imageMobile))}!important}}`);
  } else {
    const image = w?.enabled && img(w.image);
    if (image) {
      const o = Math.min(0.95, Math.max(0, w?.overlay ?? 0.7));
      const el = document.createElement('div');
      el.className = 'bg-img';
      el.style.cssText = `background-image:${url(image)};background-size:cover;background-position:center;${t.bg.imageBlur > 0 ? `filter:blur(${t.bg.imageBlur}px);` : ''}`;
      const veil = document.createElement('div');
      veil.className = 'bg-veil';
      veil.style.background = `rgba(${rgb(c.bg)},${o})`;
      layer.style.background = w?.color || c.bg;
      layer.append(el, veil);
    } else {
      layer.style.background = t.bg.mode === 'gradient' ? `linear-gradient(${t.bg.angle}deg, ${t.bg.color}, ${t.bg.color2})` : t.bg.color;
    }
  }
  if (t.bg.blobs && page.mode === 'inherit') ['b1', 'b2', 'b3'].forEach((k) => { const d = document.createElement('div'); d.className = `blob ${k}`; layer.append(d); });
  b.prepend(layer);

  // ---- per-area backgrounds + per-section styles (generated stylesheet; no user text is interpolated)
  AREA_IDS.forEach((id) => { if (id !== 'page') css.push(areaCss(id, t.areas[id])); });
  const st = resolveHome(s).styles;
  for (const [id, x] of Object.entries(st)) {
    if (!x) continue;
    css.push(`.hs-${id}{padding-top:${x.padTop}rem;padding-bottom:${x.padBottom}rem;${x.bg ? `background:${x.bg};` : ''}${x.align === 'center' ? 'text-align:center;' : ''}}${x.align === 'center' ? `.hs-${id} .sec-head{justify-content:center}` : ''}`);
  }
  let el = document.getElementById('theme-css') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'theme-css'; document.head.append(el); }
  el.textContent = css.join('\n');
}
