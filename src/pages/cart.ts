import { resolve } from '../cart/logic';
import { cart } from '../cart/store';
import { orderText } from '../services/telegram';
import { breadcrumbs, productCard, productUrl, sendViaTelegram, toast } from '../components/ui';
import { resolveMarketing } from '../shared/theme';
import { copyText } from '../services/telegram';
import { html, $ } from '../utils/dom';
import { asset, faNum, money } from '../utils/format';
import { buildOrder, newOrderId, renderOrderMessage, validateOrderInput, type Order } from '../shared/order';
import { makeFmt, orderTemplate, ordersEnabled, submitOrder } from '../services/orders';
import type { PageFn } from './types';

/** Set after a successful order so the confirmation survives the cart being emptied (and re-rendered). */
let done: { order: Order; message: string; saved: boolean } | null = null;

export const cartPage: PageFn = ({ products, settings: s }) => {
  const { items, subtotal, count } = resolve(cart.lines, products);
  const text = () => orderText(items, subtotal, s.currency, productUrl);
  const saved = ordersEnabled(s);
  const mk = resolveMarketing(s), fs = mk.freeShipping;
  const inCart = new Set(items.map((i) => i.product.id));
  const cross = mk.crossSell && items.length ? products.filter((p) => p.available && !inCart.has(p.id) && (p.bestSeller || p.featured)).slice(0, 4) : [];
  if (done) {
    const d = done;
    return {
      title: `سفارش ثبت شد | ${s.brandName}`,
      view: html`${breadcrumbs([['خانه', '#/'], ['سفارش ثبت شد']])}<section class="wrap"><div class="panel done"><h1>${d.saved ? 'سفارش شما ثبت شد ✓' : 'پیام سفارش شما آماده است ✓'}</h1>
        ${d.saved ? html`<p>کد پیگیری: <strong dir="ltr">${d.order.id}</strong></p>` : ''}
        <p class="notice">${d.saved ? 'سفارش ذخیره شد، اما هنوز پیامی ارسال نشده است. ' : 'سفارش شما هنوز ارسال نشده است. '}برای نهایی‌شدن، پیام زیر را کپی کنید و در تلگرام برای ما بفرستید (دکمه «ارسال در تلگرام» هم پیام را کپی و تلگرام را باز می‌کند).</p>
        <div class="summary-box" id="msgbox">${d.message}</div>
        <div class="hero-cta"><button class="btn primary" type="button" id="dtg">ارسال در تلگرام</button><button class="btn ghost" type="button" id="dcopy">کپی پیام سفارش</button><button class="btn ghost" type="button" id="dback">بازگشت به فروشگاه</button></div></div></section>`,
      mount(root, signal) {
        $('#dtg', root)?.addEventListener('click', () => void sendViaTelegram(d.message, s), { signal });
        $('#dcopy', root)?.addEventListener('click', () => void copyText(d.message).then((ok) => toast(ok ? 'پیام کپی شد.' : 'کپی انجام نشد.')), { signal });
        $('#dback', root)?.addEventListener('click', () => { done = null; location.hash = '#/shop'; }, { signal });
      },
    };
  }
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
          ${fs.enabled && fs.threshold > 0 ? html`<div class="freeship"><p>${subtotal >= fs.threshold ? 'ارسال این سفارش رایگان است 🎉' : `${money(fs.threshold - subtotal, s.currency)} تا ارسال رایگان`}</p><div class="meter"><i style="--w:${Math.min(100, Math.round((subtotal / fs.threshold) * 100))}%"></i></div></div>` : ''}
          <p class="notice">پرداخت آنلاین وجود ندارد. با دکمه زیر، خلاصه سفارش کپی و گفتگوی تلگرام باز می‌شود؛ پیام را خودتان ارسال کنید.${s.shippingInfo ? ` ${s.shippingInfo}` : ''}</p>
          <button class="btn primary" type="button" id="checkout" aria-expanded="false" aria-controls="co">${saved ? 'ثبت و ذخیره سفارش' : 'تکمیل سفارش و ساخت پیام'}</button>
          <form id="co" class="co" hidden novalidate>
            <label>نام و نام خانوادگی<input name="name" autocomplete="name" maxlength="80" required /></label>
            <label>آدرس${s.orders?.requireAddress ? '' : ' (اختیاری)'}<textarea name="address" maxlength="400" autocomplete="street-address"></textarea></label>
            <label>کدپستی (اختیاری)<input name="postalCode" inputmode="numeric" autocomplete="postal-code" dir="ltr" maxlength="12" /></label>
            <label>شماره تماس<input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" required /></label>
            <label>آیدی تلگرام (اختیاری)<input name="telegram" dir="ltr" maxlength="40" placeholder="@username" autocomplete="off" /></label>
            <label>توضیحات (اختیاری)<textarea name="notes" maxlength="500"></textarea></label>
            <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <p class="errors" id="co-err" role="alert" hidden></p>
            <button class="btn primary" type="submit" id="co-go">${saved ? 'تأیید و ثبت سفارش' : 'ساخت پیام سفارش'}</button>
            <p class="muted">${saved ? 'اطلاعات شما فقط برای پیگیری همین سفارش در یک مخزن خصوصی ذخیره می‌شود.' : 'اطلاعات شما جایی ذخیره نمی‌شود؛ فقط پیام سفارش ساخته می‌شود تا خودتان در تلگرام بفرستید.'}</p>
          </form>
          <button class="btn ghost" type="button" id="tg">${saved ? 'ارسال مستقیم در تلگرام (بدون ذخیره سفارش)' : 'ارسال سریع خلاصه در تلگرام (بدون فرم)'}</button>
          <button class="btn ghost" type="button" id="copy">کپی خلاصه سفارش</button>
          <a class="btn ghost" href="#/shop">ادامه خرید</a>
          <button class="btn danger" type="button" id="clear">خالی کردن سبد</button>
        </aside></div>`}
    ${cross.length ? html`<h2>پیشنهاد برای شما</h2><div class="grid">${cross.map((p) => productCard(p, s.currency))}</div>` : ''}
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
        else if (b.id === 'checkout') { const f = $('#co', root) as HTMLFormElement | null; if (f) { f.hidden = !f.hidden; b.setAttribute('aria-expanded', String(!f.hidden)); if (!f.hidden) f.querySelector<HTMLInputElement>('input')?.focus(); } }
        else if (b.id === 'tg') void sendViaTelegram(text(), s);
        else if (b.id === 'copy') void copyText(text()).then((ok) => toast(ok ? 'خلاصه سفارش کپی شد.' : 'کپی انجام نشد.'));
      }, { signal });
      root.addEventListener('submit', (e) => {
        const f = (e.target as HTMLElement).closest<HTMLFormElement>('#co');
        if (!f) return;
        e.preventDefault();
        const d = new FormData(f);
        const v = (k: string) => String(d.get(k) ?? '').trim();
        const payload = { customer: { name: v('name'), phone: v('phone'), address: v('address'), notes: v('notes'), postalCode: v('postalCode'), telegram: v('telegram') }, items: cart.lines.map((l) => ({ id: l.id, qty: l.qty })), website: v('website') };
        const err = $('#co-err', root)!, go = $('#co-go', root) as HTMLButtonElement;
        const show = (m: string) => { err.textContent = m; err.hidden = !m; };
        const errs = validateOrderInput(payload, s.orders?.requireAddress ?? false);
        if (errs.length) return show(errs.join(' '));
        const label = go.textContent ?? '';
        show(''); go.disabled = true; go.textContent = saved ? 'در حال ثبت سفارش…' : 'در حال ساخت پیام…';
        const finish = (order: Order, wasSaved: boolean) => {
          done = { order, saved: wasSaved, message: renderOrderMessage(orderTemplate(s), order, s.brandName, makeFmt(s.currency)) };
          cart.clear(); // re-renders the page into the confirmation view
          window.scrollTo(0, 0);
        };
        const fail = (m: string) => { show(m); go.disabled = false; go.textContent = label; };
        if (saved) {
          submitOrder(payload).then((order) => finish(order, true)).catch((x) => fail(x instanceof Error ? x.message : 'ثبت سفارش انجام نشد.'));
        } else {
          // No order service configured: build the order locally (prices come from the catalog) and only generate the message.
          const r = buildOrder(payload, products, { id: newOrderId(Date.now(), crypto.getRandomValues(new Uint8Array(6))), now: new Date().toISOString(), currency: s.currency, requireAddress: s.orders?.requireAddress ?? false });
          if (!r.order) return fail(r.errors.join(' '));
          finish(r.order, false);
        }
      }, { signal });
      root.addEventListener('change', (e) => {
        const i = e.target as HTMLInputElement;
        if (i.dataset.qty) cart.setQty(i.dataset.qty, Number(i.value));
      }, { signal });
    },
  };
};
