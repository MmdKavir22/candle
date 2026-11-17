import { resolve } from '../cart/logic';
import { cart } from '../cart/store';
import { orderText } from '../services/telegram';
import { breadcrumbs, productUrl, sendViaTelegram, toast } from '../components/ui';
import { copyText } from '../services/telegram';
import { html, $ } from '../utils/dom';
import { asset, faNum, money } from '../utils/format';
import type { PageFn } from './types';

export const cartPage: PageFn = ({ products, settings: s }) => {
  const { items, subtotal, count } = resolve(cart.lines, products);
  const text = () => orderText(items, subtotal, s.currency, productUrl);
  return {
    title: `سبد خرید | ${s.brandName}`,
    view: html`${breadcrumbs([['خانه', '#/'], ['سبد خرید']])}
    <section class="wrap"><h1>سبد خرید</h1>
    ${items.length === 0 ? html`<div class="empty"><p>سبد خرید شما خالی است.</p><a class="btn primary" href="#/shop">مشاهده محصولات</a></div>` : html`
      <div class="cart-layout">
        <div>${items.map((i) => html`<div class="cart-row">
          <img src="${asset(i.product.images[0] ?? '')}" alt="${i.product.name}" width="84" height="84" />
          <div><a href="#/product/${i.product.id}"><strong>${i.product.name}</strong></a><p class="muted">${money(i.unit, s.currency)}</p>
            <div class="qty"><button type="button" data-dec="${i.product.id}" aria-label="کم کردن">−</button><span aria-live="polite" class="visually-hidden">تعداد</span><input type="number" min="1" max="99" value="${i.qty}" data-qty="${i.product.id}" aria-label="تعداد ${i.product.name}" /><button type="button" data-inc="${i.product.id}" aria-label="زیاد کردن">+</button></div></div>
          <div><strong>${money(i.total, s.currency)}</strong><p><button class="btn danger sm" type="button" data-del="${i.product.id}">حذف</button></p></div></div>`)}
        </div>
        <aside class="panel sum" aria-label="خلاصه سفارش">
          <div class="row"><span>تعداد کل</span><strong>${faNum(count)}</strong></div>
          <div class="row"><span>جمع جزء</span><strong>${money(subtotal, s.currency)}</strong></div>
          <p class="notice">پرداخت آنلاین وجود ندارد. با دکمه زیر، خلاصه سفارش کپی و گفتگوی تلگرام باز می‌شود؛ پیام را خودتان ارسال کنید.${s.shippingInfo ? ` ${s.shippingInfo}` : ''}</p>
          <button class="btn primary" type="button" id="tg">ثبت سفارش از طریق تلگرام</button>
          <button class="btn ghost" type="button" id="copy">کپی خلاصه سفارش</button>
          <a class="btn ghost" href="#/shop">ادامه خرید</a>
          <button class="btn danger" type="button" id="clear">خالی کردن سبد</button>
        </aside></div>`}
    </section>`,
    mount(root, signal) {
      root.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('button');
        if (!b) return;
        const d = b.dataset;
        const line = (id?: string) => cart.lines.find((l) => l.id === id);
        if (d.inc) cart.setQty(d.inc, (line(d.inc)?.qty ?? 0) + 1);
        else if (d.dec) cart.setQty(d.dec, (line(d.dec)?.qty ?? 2) - 1);
        else if (d.del) cart.remove(d.del);
        else if (b.id === 'clear') cart.clear();
        else if (b.id === 'tg') void sendViaTelegram(text(), s);
        else if (b.id === 'copy') void copyText(text()).then((ok) => toast(ok ? 'خلاصه سفارش کپی شد.' : 'کپی انجام نشد.'));
      }, { signal });
      root.addEventListener('change', (e) => {
        const i = e.target as HTMLInputElement;
        if (i.dataset.qty) cart.setQty(i.dataset.qty, Number(i.value));
      }, { signal });
    },
  };
};
