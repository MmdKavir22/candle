import { breadcrumbs, productCard } from '../components/ui';
import { filterProducts, type Filters } from '../utils/catalog';
import { html, $, mount } from '../utils/dom';
import { faNum } from '../utils/format';
import type { PageFn } from './types';

export const shop: PageFn = ({ products, categories, settings: s }, route) => {
  const readSort = (v: string | null): Filters['sort'] => (v === 'asc' || v === 'desc' ? v : 'newest');
  const f: Filters = { q: route.params.get('q') ?? '', cat: route.params.get('cat') ?? '', sort: readSort(route.params.get('sort')), avail: route.params.get('avail') === '1' };
  const list = (x: Filters) => filterProducts(products, x, categories);
  const results = (x: Filters) => {
    const l = list(x);
    return html`<p class="muted" id="count">${faNum(l.length)} محصول</p>${l.length ? html`<div class="grid">${l.map((p) => productCard(p, s.currency))}</div>` : html`<div class="empty"><p>محصولی با این فیلترها پیدا نشد.</p><a href="#/shop">پاک‌کردن فیلترها</a></div>`}`;
  };
  const catName = categories.find((c) => c.id === f.cat)?.name;
  return {
    title: `${catName ?? 'فروشگاه'} | ${s.brandName}`,
    desc: `فهرست شمع‌های دست‌ساز ${s.brandName}؛ جستجو، فیلتر و مرتب‌سازی بر اساس قیمت و دسته‌بندی.`,
    view: html`${breadcrumbs([['خانه', '#/'], [catName ?? 'فروشگاه']])}
    <section class="wrap"><h1>${catName ?? 'فروشگاه'}</h1>
      <form class="filters" role="search" id="filters">
        <label>جستجو<input type="search" name="q" value="${f.q}" placeholder="نام یا رایحه…" /></label>
        <label>دسته‌بندی<select name="cat"><option value="">همه</option>${categories.map((c) => html`<option value="${c.id}" ${c.id === f.cat ? html`selected` : ''}>${c.name}</option>`)}</select></label>
        <label>مرتب‌سازی<select name="sort"><option value="newest" ${f.sort === 'newest' ? html`selected` : ''}>جدیدترین</option><option value="asc" ${f.sort === 'asc' ? html`selected` : ''}>ارزان‌ترین</option><option value="desc" ${f.sort === 'desc' ? html`selected` : ''}>گران‌ترین</option></select></label>
        <label class="chk"><input type="checkbox" name="avail" ${f.avail ? html`checked` : ''} />فقط موجود</label>
      </form>
      <div id="results" aria-live="polite">${results(f)}</div></section>`,
    mount(root, signal) {
      const form = $<HTMLFormElement>('#filters', root)!;
      const update = () => {
        const d = new FormData(form);
        const x: Filters = { q: String(d.get('q') ?? ''), cat: String(d.get('cat') ?? ''), sort: readSort(String(d.get('sort'))), avail: d.get('avail') === 'on' };
        const p = new URLSearchParams();
        if (x.q) p.set('q', x.q);
        if (x.cat) p.set('cat', x.cat);
        if (x.sort !== 'newest') p.set('sort', x.sort);
        if (x.avail) p.set('avail', '1');
        const qs = p.toString();
        history.replaceState(null, '', `#/shop${qs ? `?${qs}` : ''}`);
        mount($('#results', root)!, results(x));
      };
      form.addEventListener('input', update, { signal });
      form.addEventListener('submit', (e) => e.preventDefault(), { signal });
    },
  };
};
