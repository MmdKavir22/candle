import type { Settings } from '../shared/types';
import { telegramUrl } from '../services/telegram';
import { html, mount, $, $$ } from '../utils/dom';
import { asset, faNum } from '../utils/format';

const NAV: [string, string, string][] = [
  ['خانه', '#/', ''], ['فروشگاه', '#/shop', 'shop'], ['دسته‌بندی‌ها', '#/categories', 'categories'],
  ['شمع سفارشی', '#/custom', 'custom'], ['درباره ما', '#/about', 'about'], ['تماس', '#/contact', 'contact'],
];

export function renderLayout(s: Settings) {
  mount($('#site-header')!, html`<div class="wrap bar">
    <a class="logo" href="#/"><img src="${asset('favicon.svg')}" alt="" width="34" height="34" />${s.brandName}</a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="nav" aria-label="منو">☰</button>
    <nav class="nav" id="nav" aria-label="منوی اصلی" data-open="false">${NAV.map(([t, h, k]) => html`<a href="${h}" data-route="${k}">${t}</a>`)}</nav>
    <a class="cart-link" href="#/cart" aria-label="سبد خرید">سبد خرید <span class="count" id="cart-count">۰</span></a>
  </div>`);
  const tg = telegramUrl(s.telegramUsername);
  const social = Object.entries(s.social).filter(([, v]) => v);
  const names: Record<string, string> = { instagram: 'اینستاگرام', telegramChannel: 'کانال تلگرام', pinterest: 'پینترست' };
  mount($('#site-footer')!, html`<div class="wrap foot">
    <div><h2>${s.brandName}</h2><p class="muted">${s.brandDescription}</p></div>
    <div><h3>دسترسی سریع</h3><ul>${NAV.map(([t, h]) => html`<li><a href="${h}">${t}</a></li>`)}</ul></div>
    <div><h3>ارتباط</h3><ul>
      ${tg ? html`<li><a href="${tg}" target="_blank" rel="noopener noreferrer">تلگرام</a></li>` : ''}
      ${social.map(([k, v]) => html`<li><a href="${v}" target="_blank" rel="noopener noreferrer me">${names[k] ?? k}</a></li>`)}
    </ul></div>
    <p class="copy wrap">© ${faNum(new Date().getFullYear()).replace(/٬/g, '')} ${s.brandName}. همه حقوق محفوظ است.</p>
  </div>`);
  const btn = $<HTMLButtonElement>('.menu-btn')!;
  const nav = $('#nav')!;
  btn.addEventListener('click', () => {
    const open = nav.dataset.open !== 'true';
    nav.dataset.open = String(open);
    btn.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) { nav.dataset.open = 'false'; btn.setAttribute('aria-expanded', 'false'); } });
}

export function markActive(key: string) {
  $$('#nav a').forEach((a) => (a.dataset.route === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}
export function setCount(n: number) {
  const el = $('#cart-count');
  if (!el) return;
  const changed = el.textContent !== faNum(n);
  el.textContent = faNum(n);
  if (changed) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
