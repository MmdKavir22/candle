import { cart } from '../cart/store';
import { breadcrumbs, priceBlock, productCard, toast } from '../components/ui';
import { html, $, $$ } from '../utils/dom';
import { asset, faNum } from '../utils/format';
import { clampQty } from '../cart/logic';
import type { PageFn } from './types';

export const product: PageFn = ({ products, categories, settings: s }, route) => {
  const p = products.find((x) => x.id === route.segs[1]);
  if (!p) return { title: `محصول پیدا نشد | ${s.brandName}`, view: html`<section class="wrap empty"><h1>محصول پیدا نشد</h1><a class="btn primary" href="#/shop">بازگشت به فروشگاه</a></section>` };
  const cat = categories.find((c) => c.id === p.category);
  const rows: [string, string][] = ([['رایحه', p.fragrance], ['اندازه', p.size], ['نوع موم', p.waxType], ['مدت سوختن', p.burningDuration], ...Object.entries(p.specs ?? {})] as [string, string][]).filter(([, v]) => v);
  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
  return {
    title: `${p.name} | ${s.brandName}`,
    desc: p.description.slice(0, 155),
    view: html`${breadcrumbs([['خانه', '#/'], ['فروشگاه', '#/shop'], ...(cat ? [[cat.name, `#/shop?cat=${cat.id}`] as [string, string]] : []), [p.name]])}
    <div class="wrap pdp">
      <div class="gallery"><div class="main"><img id="main-img" src="${asset(p.images[0] ?? '')}" alt="${p.imageAlts?.[0] ?? p.name}" width="800" height="800" fetchpriority="high" /></div>
        ${p.images.length > 1 ? html`<div class="thumbs">${p.images.map((src, i) => html`<button type="button" data-src="${asset(src)}" data-alt="${p.imageAlts?.[i] ?? p.name}" aria-label="تصویر ${faNum(i + 1)}" aria-current="${i === 0}"><img src="${asset(src)}" alt="" loading="lazy" width="64" height="64" /></button>`)}</div>` : ''}</div>
      <div><h1>${p.name}</h1>${priceBlock(p, s.currency, true)}
        <p class="${p.available ? '' : 'muted'}">${p.available ? 'موجود' : 'در حال حاضر ناموجود'}</p>
        <p>${p.description}</p>
        <table class="specs"><caption class="visually-hidden">مشخصات</caption><tbody>${rows.map(([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}</tbody></table>
        ${p.available ? html`<div class="buy"><div class="qty"><button type="button" data-d="-1" aria-label="کم کردن">−</button><input id="qty" type="number" min="1" max="99" value="1" inputmode="numeric" aria-label="تعداد" /><button type="button" data-d="1" aria-label="زیاد کردن">+</button></div>
          <button class="btn primary" type="button" id="add">افزودن به سبد</button></div>` : html`<a class="btn ghost" href="#/custom">درخواست شمع سفارشی</a>`}
      </div></div>
    ${related.length ? html`<section class="wrap"><h2>محصولات مرتبط</h2><div class="grid">${related.map((r) => productCard(r, s.currency))}</div></section>` : ''}`,
    mount(root, signal) {
      const img = $<HTMLImageElement>('#main-img', root);
      $$('.thumbs button', root).forEach((b) => b.addEventListener('click', () => {
        if (img) { img.src = b.dataset.src ?? img.src; img.alt = b.dataset.alt ?? ''; }
        $$('.thumbs button', root).forEach((x) => x.setAttribute('aria-current', String(x === b)));
      }, { signal }));
      const q = $<HTMLInputElement>('#qty', root);
      if (!q) return;
      $$('[data-d]', root).forEach((b) => b.addEventListener('click', () => { q.value = String(clampQty(Number(q.value) + Number(b.dataset.d))); }, { signal }));
      $('#add', root)?.addEventListener('click', () => { cart.add(p.id, clampQty(Number(q.value))); toast('به سبد خرید اضافه شد.'); }, { signal });
    },
  };
};
