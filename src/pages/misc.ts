import { breadcrumbs, contactBlock, cover } from '../components/ui';
import { html } from '../utils/dom';
import { asset } from '../utils/format';
import { slotOf } from '../shared/theme';
import type { PageFn } from './types';

export const about: PageFn = ({ homepage: h, settings: s }) => ({
  title: `درباره ما | ${s.brandName}`, desc: s.brandDescription,
  view: html`${breadcrumbs([['خانه', '#/'], ['درباره ما']])}${cover(s, 'about')}<section class="wrap"><h1>درباره ${s.brandName}</h1><p>${s.brandDescription}</p><h2>${h.intro.title}</h2><p>${h.intro.text}</p><ul class="points">${h.intro.points.map((p) => html`<li>${p}</li>`)}</ul></section>`,
});
export const contact: PageFn = ({ settings: s }) => ({
  title: `تماس با ما | ${s.brandName}`, desc: 'راه‌های ارتباط و ثبت سفارش از طریق تلگرام.',
  view: html`${breadcrumbs([['خانه', '#/'], ['تماس']])}${cover(s, 'contact')}<section class="wrap"><h1>تماس با ما</h1>${contactBlock(s)}</section>`,
});
export const categoriesPage: PageFn = ({ categories, settings: s }) => ({
  title: `دسته‌بندی‌ها | ${s.brandName}`, desc: 'دسته‌بندی شمع‌های دست‌ساز.',
  view: html`${breadcrumbs([['خانه', '#/'], ['دسته‌بندی‌ها']])}<section class="wrap"><h1>دسته‌بندی‌ها</h1><div class="cats">${categories.map((c) => html`<a class="cat" href="#/shop?cat=${c.id}">${c.image && slotOf(s, 'categories').show ? html`<img src="${asset(c.image)}" alt="" loading="lazy" width="400" height="300" />` : ''}<div><strong>${c.name}</strong><span class="muted">${c.description ?? ''}</span></div></a>`)}</div></section>`,
});
export const notFound: PageFn = ({ settings: s }) => ({
  title: `صفحه پیدا نشد | ${s.brandName}`,
  view: html`<section class="wrap empty"><h1>صفحه پیدا نشد</h1><a class="btn primary" href="#/">بازگشت به خانه</a></section>`,
});
