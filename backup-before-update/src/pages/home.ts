import type { Product } from '../shared/types';
import { contactBlock, productCard } from '../components/ui';
import { html, safeLink, type Safe } from '../utils/dom';
import { asset } from '../utils/format';
import type { PageFn } from './types';

export const home: PageFn = ({ products, categories, homepage: h, settings: s }) => {
  const byId = new Map(products.map((p) => [p.id, p]));
  const featured = h.featuredIds.map((id) => byId.get(id)).filter((p): p is Product => !!p);
  const grid = (list: Product[]): Safe => html`<div class="grid">${list.map((p) => productCard(p, s.currency))}</div>`;
  const block = (title: string, list: Product[], more = '#/shop'): Safe =>
    list.length ? html`<section class="wrap"><div class="sec-head"><h2>${title}</h2><a href="${more}">مشاهده همه</a></div>${grid(list)}</section>` : html``;
  return {
    title: `${s.brandName} | شمع‌های دست‌ساز معطر و دکوراتیو`,
    desc: s.brandDescription,
    view: html`
    <div class="wrap hero">
      <div><h1>${h.heroTitle}</h1><p>${h.heroDescription}</p>
        <div class="hero-cta"><a class="btn primary" href="#/shop">همین حالا بخرید</a><a class="btn ghost" href="#/custom">شمع سفارشی</a></div></div>
      <div class="hero-art"><img src="${asset(h.heroImage)}" alt="سه شمع دست‌ساز آبی پاستلی" width="800" height="800" fetchpriority="high" /></div>
    </div>
    ${block('محصولات ویژه', featured)}
    ${block('پرفروش‌ها', products.filter((p) => p.bestSeller).slice(0, 4))}
    ${block('تازه‌ها', products.filter((p) => p.isNew).slice(0, 4))}
    <section class="wrap"><div class="sec-head"><h2>دسته‌بندی‌ها</h2><a href="#/categories">همه دسته‌ها</a></div>
      <div class="cats">${categories.map((c) => html`<a class="cat" href="#/shop?cat=${c.id}">${c.image ? html`<img src="${asset(c.image)}" alt="" loading="lazy" width="400" height="300" />` : ''}<div><strong>${c.name}</strong><span class="muted">${c.description ?? ''}</span></div></a>`)}</div></section>
    ${h.collections.length ? html`<section class="wrap"><div class="sec-head"><h2>مجموعه‌های ویژه</h2></div><div class="cols">${h.collections.map((c) => html`<a class="panel" href="#/shop?cat=${c.categoryId}"><h3>${c.title}</h3><p class="muted">${c.description}</p></a>`)}</div></section>` : ''}
    ${h.banners.length ? html`<section class="wrap"><div class="banners">${h.banners.map((b) => html`<a class="banner" href="${safeLink(b.link)}"><div><h3>${b.title}</h3><p>${b.text}</p></div>${b.image ? html`<img src="${asset(b.image)}" alt="" loading="lazy" width="110" height="110" />` : ''}</a>`)}</div></section>` : ''}
    <div class="alt"><section class="wrap cols"><div><h2>${h.intro.title}</h2><p>${h.intro.text}</p></div><ul class="points">${h.intro.points.map((p) => html`<li>${p}</li>`)}</ul></section></div>
    ${h.testimonials.length ? html`<section class="wrap"><h2>نظر مشتریان</h2><div class="cols">${h.testimonials.map((t) => html`<blockquote class="panel"><p>${t.text}</p><footer>${t.name}</footer></blockquote>`)}</div></section>` : ''}
    <section class="wrap"><h2>نکات نگهداری شمع</h2><div class="cols">${h.careTips.map((t) => html`<div class="panel"><h3>${t.title}</h3><p>${t.text}</p></div>`)}</div></section>
    <section class="wrap cols"><div><h2>پرسش‌های متداول</h2>${h.faq.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div>${contactBlock(s)}</section>`,
  };
};
