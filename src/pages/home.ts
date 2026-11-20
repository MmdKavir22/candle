import type { Product } from '../shared/types';
import { contactBlock, productCard } from '../components/ui';
import { resolveHome, resolveMarketing, slotOf, slotVars } from '../shared/theme';
import { isImageRef } from '../shared/validate';
import { html, safeLink, type Safe } from '../utils/dom';
import { asset, faNum } from '../utils/format';
import { getRecent } from '../utils/recent';
import type { PageFn } from './types';

const countdown = (end: number) => {
  const t = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${d ? `${faNum(d)} روز ` : ''}${faNum(h)}:${faNum(m).padStart(2, '۰')}:${faNum(s).padStart(2, '۰')}`;
};

export const home: PageFn = ({ products, categories, homepage: h, settings: s }) => {
  const cfg = resolveHome(s), mk = resolveMarketing(s);
  const hero = slotOf(s, 'hero'), cats = slotOf(s, 'categories'), bans = slotOf(s, 'banners'), intro = slotOf(s, 'intro');
  const heroImg = hero.image || h.heroImage;
  const byId = new Map(products.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);
  const grid = (list: Product[]): Safe => html`<div class="grid">${list.map((p) => productCard(p, s.currency))}</div>`;
  const block = (title: string, list: Product[], more = '#/shop'): Safe =>
    list.length ? html`<section class="wrap"><div class="sec-head"><h2>${title}</h2><a href="${more}">مشاهده همه</a></div>${grid(list)}</section>` : html``;
  const promo = cfg.promo;
  const end = promo.endsAt ? Date.parse(promo.endsAt) : 0;
  const promoOn = promo.enabled && !!promo.title && (!end || end > Date.now());
  const recent = mk.recentlyViewed ? pick(getRecent()).slice(0, 4) : [];

  const sections: Record<string, () => Safe> = {
    hero: () => html`<div class="wrap hero ${hero.show && heroImg ? '' : 'hero--solo'}">
      <div><h1>${h.heroTitle}</h1><p>${h.heroDescription}</p>
        <div class="hero-cta"><a class="btn primary" href="#/shop">همین حالا بخرید</a><a class="btn ghost" href="#/custom">شمع سفارشی</a></div></div>
      ${hero.show && heroImg ? html`<div class="hero-art" style="${slotVars(hero)}"><img class="slot-img" src="${asset(heroImg)}" alt="تصویر محصولات ${s.brandName}" width="800" height="800" fetchpriority="high" /></div>` : ''}
    </div>`,
    benefits: () => (cfg.benefits.length ? html`<section class="wrap"><div class="benefit-grid">${cfg.benefits.map((b) => html`<div class="benefit"><span class="ico" aria-hidden="true">${b.icon}</span><div><strong>${b.title}</strong><p>${b.text}</p></div></div>`)}</div></section>` : html``),
    promo: () => (promoOn ? html`<section class="wrap"><a class="promo" href="${safeLink(promo.link || '#/shop')}"><div><strong>${promo.title}</strong>${promo.text ? html`<p>${promo.text}</p>` : ''}</div>${end ? html`<div class="countdown" data-end="${end}" aria-hidden="true">${countdown(end)}</div>` : ''}</a></section>` : html``),
    featured: () => block('محصولات ویژه', pick(h.featuredIds)),
    bestsellers: () => block('پرفروش‌ها', products.filter((p) => p.bestSeller).slice(0, 4)),
    new: () => block('تازه‌ها', products.filter((p) => p.isNew).slice(0, 4)),
    recent: () => block('اخیراً دیده‌اید', recent),
    categories: () => html`<section class="wrap"><div class="sec-head"><h2>دسته‌بندی‌ها</h2><a href="#/categories">همه دسته‌ها</a></div>
      <div class="cats">${categories.map((c) => html`<a class="cat" href="#/shop?cat=${c.id}">${c.image && cats.show ? html`<img src="${asset(c.image)}" alt="" loading="lazy" width="400" height="300" />` : ''}<div><strong>${c.name}</strong><span class="muted">${c.description ?? ''}</span></div></a>`)}</div></section>`,
    collections: () => (h.collections.length ? html`<section class="wrap"><div class="sec-head"><h2>مجموعه‌های ویژه</h2></div><div class="cols">${h.collections.map((c) => html`<a class="panel" href="#/shop?cat=${c.categoryId}"><h3>${c.title}</h3><p class="muted">${c.description}</p></a>`)}</div></section>` : html``),
    banners: () => (h.banners.length ? html`<section class="wrap"><div class="banners">${h.banners.map((b) => html`<a class="banner" href="${safeLink(b.link)}"><div><h3>${b.title}</h3><p>${b.text}</p></div>${b.image && bans.show ? html`<img src="${asset(b.image)}" alt="" loading="lazy" width="110" height="110" />` : ''}</a>`)}</div></section>` : html``),
    steps: () => (cfg.steps.length ? html`<section class="wrap"><div class="sec-head"><h2>سفارش چطور انجام می‌شود؟</h2></div><ol class="steps">${cfg.steps.map((st) => html`<li class="step"><h3>${st.title}</h3><p>${st.text}</p></li>`)}</ol></section>` : html``),
    intro: () => html`<div class="alt"><section class="wrap cols ${intro.show && intro.image && isImageRef(intro.image) ? 'with-fig' : ''}">
      ${intro.show && intro.image && isImageRef(intro.image) ? html`<figure class="fig" style="${slotVars(intro)}"><img class="slot-img" src="${asset(intro.image)}" alt="" loading="lazy" width="600" height="450" /></figure>` : ''}
      <div><h2>${h.intro.title}</h2><p>${h.intro.text}</p></div><ul class="points">${h.intro.points.map((p) => html`<li>${p}</li>`)}</ul></section></div>`,
    testimonials: () => (h.testimonials.length ? html`<section class="wrap"><h2>نظر مشتریان</h2><div class="cols">${h.testimonials.map((t) => html`<blockquote class="panel"><p>${t.text}</p><footer>${t.name}</footer></blockquote>`)}</div></section>` : html``),
    care: () => html`<section class="wrap"><h2>نکات نگهداری شمع</h2><div class="cols">${h.careTips.map((t) => html`<div class="panel"><h3>${t.title}</h3><p>${t.text}</p></div>`)}</div></section>`,
    faq: () => html`<section class="wrap cols"><div><h2>پرسش‌های متداول</h2>${h.faq.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div>${contactBlock(s)}</section>`,
  };

  return {
    title: `${s.brandName} | شمع‌های دست‌ساز معطر و دکوراتیو`,
    desc: s.brandDescription,
    view: html`${cfg.sections.filter((x) => x.show).map((x) => html`<div class="hs hs-${x.id}">${sections[x.id]?.() ?? ''}</div>`)}`,
    mount(root, signal) {
      const el = root.querySelector<HTMLElement>('.countdown[data-end]');
      if (!el) return;
      const endAt = Number(el.dataset.end);
      const tick = () => {
        if (Date.now() >= endAt) { el.closest('section')?.remove(); clearInterval(id); return; }
        el.textContent = countdown(endAt);
      };
      const id = window.setInterval(tick, 1000);
      signal.addEventListener('abort', () => clearInterval(id));
    },
  };
};
