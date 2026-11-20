import type { Settings } from '../shared/types';
import { copyText, telegramUrl } from '../services/telegram';
import { html, safeLink, type Safe } from '../utils/dom';
import { asset } from '../utils/format';
import type { Product } from '../shared/types';
import { isImageRef } from '../shared/validate';
import { slotOf, slotVars } from '../shared/theme';
import type { ImageSlot } from '../shared/types';
import { discountPct, faNum, money, onSale, unitPrice } from '../utils/format';

let timer = 0;
export function toast(msg: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), 3800);
}

/** Absolute URL of a product's static (SEO) page. */
export const productUrl = (id: string) => new URL(`${import.meta.env.BASE_URL}products/${id}/`, location.origin).href;

/**
 * Copy the prepared message, then open the owner's Telegram chat.
 * Nothing is sent automatically: the customer pastes and sends it themselves.
 */
export async function sendViaTelegram(text: string, s: Settings) {
  const url = telegramUrl(s.telegramUsername);
  if (!url) return toast('نام کاربری تلگرام فروشگاه هنوز تنظیم نشده است.');
  const copying = copyText(text);
  window.open(url, '_blank', 'noopener');
  toast((await copying) ? 'خلاصه کپی شد. در تلگرام آن را بچسبانید و خودتان ارسال کنید.' : 'کپی خودکار ممکن نشد؛ از دکمه «کپی خلاصه» استفاده کنید.');
}

export function breadcrumbs(items: [string, string?][]): Safe {
  return html`<nav class="crumbs wrap" aria-label="مسیر صفحه"><ol>${items.map(([t, h]) => html`<li>${h ? html`<a href="${h}">${t}</a>` : html`<span aria-current="page">${t}</span>`}</li>`)}</ol></nav>`;
}

export function priceBlock(p: Product, cur: string, big = false): Safe {
  return html`<p class="price ${big ? 'big-price' : ''}"><span>${money(unitPrice(p), cur)}</span>${onSale(p) ? html`<del>${money(p.price, cur)}</del>` : ''}</p>`;
}

export function productCard(p: Product, cur: string): Safe {
  const href = `#/product/${p.id}`;
  return html`<article class="card">
    <a class="card-media" href="${href}" aria-label="${p.name}">
      <img src="${asset(p.images[0] ?? '')}" alt="${p.imageAlts?.[0] ?? p.name}" loading="lazy" width="600" height="600" />
      ${onSale(p) ? html`<span class="badge sale">٪${faNum(discountPct(p))} تخفیف</span>` : !p.available ? html`<span class="badge off">ناموجود</span>` : p.isNew ? html`<span class="badge">جدید</span>` : ''}
    </a>
    <div class="card-body">
      <h3><a href="${href}">${p.name}</a></h3>
      <p class="muted">${p.fragrance}${p.available ? '' : ' · ناموجود'}</p>
      ${priceBlock(p, cur)}
      <div class="card-actions">
        <button class="btn primary sm" type="button" data-add="${p.id}" ${p.available ? '' : html`disabled`}>افزودن به سبد</button>
        <button class="btn ghost sm" type="button" data-quick="${p.id}">مشاهده سریع</button>
      </div>
    </div>
  </article>`;
}

export function contactBlock(s: Settings): Safe {
  const tg = telegramUrl(s.telegramUsername);
  const c = s.contact;
  return html`<div class="panel">
    <h3>ارتباط با ما</h3>
    <p>سفارش‌ها از طریق تلگرام ثبت می‌شوند.</p>
    ${tg ? html`<p><a class="btn primary" href="${tg}" target="_blank" rel="noopener noreferrer">گفتگو در تلگرام</a></p>` : ''}
    ${c.phone ? html`<p>تلفن: <bdi>${c.phone}</bdi></p>` : ''}
    ${c.email ? html`<p>ایمیل: <bdi>${c.email}</bdi></p>` : ''}
    ${c.address ? html`<p>نشانی: ${c.address}</p>` : ''}
    ${s.shippingInfo ? html`<p class="muted">${s.shippingInfo}</p>` : ''}
  </div>`;
}
export { safeLink };

/** Optional cover strip for a page; shown only when the owner enabled that image slot and picked an image. */
export function cover(s: Settings, k: ImageSlot): Safe {
  const o = slotOf(s, k);
  return o.show && o.image && isImageRef(o.image) ? html`<div class="wrap"><div class="cover" style="${slotVars(o)}"><img class="slot-img" src="${asset(o.image)}" alt="" loading="lazy" width="1200" height="320" /></div></div>` : html``;
}
