import '@fontsource-variable/vazirmatn';
import './styles/main.css';
import { cart } from './cart/store';
import { markActive, renderLayout, setCount } from './components/layout';
import { toast } from './components/ui';
import { loadCatalog, type Catalog } from './services/data';
import { validateSettings } from './shared/validate';
import type { Settings } from './shared/types';
import { html, mount, $ } from './utils/dom';
import { reveal, watchHeader } from './utils/motion';
import { asset, money, unitPrice } from './utils/format';
import { cartPage } from './pages/cart';
import { custom } from './pages/custom';
import { home } from './pages/home';
import { about, categoriesPage, contact, notFound } from './pages/misc';
import { product } from './pages/product';
import { shop } from './pages/shop';
import type { PageFn, Route } from './pages/types';

const ROUTES: Record<string, PageFn> = { '': home, shop, product, cart: cartPage, custom, about, contact, categories: categoriesPage };
let ctx: Catalog;
let ac = new AbortController();

function parse(): Route {
  const [path = '', qs = ''] = (location.hash.slice(1) || '/').split('?');
  return { segs: path.split('/').filter(Boolean), params: new URLSearchParams(qs) };
}

function setMeta(title: string, desc?: string) {
  document.title = title;
  const m = $<HTMLMetaElement>('meta[name=description]');
  if (m && desc) m.content = desc;
}

function render(scroll = true) {
  ac.abort();
  ac = new AbortController();
  const route = parse();
  const key = route.segs[0] ?? '';
  const page = (ROUTES[key] ?? notFound)(ctx, route);
  const app = $('#app')!;
  mount(app, page.view);
  page.mount?.(app, ac.signal);
  setMeta(page.title, page.desc);
  markActive(key);
  if (scroll) {
    window.scrollTo(0, 0); app.focus({ preventScroll: true });
    app.classList.remove('page-in'); void app.offsetWidth; app.classList.add('page-in');
    reveal(app);
  }
}

function quickView(id: string) {
  const p = ctx.products.find((x) => x.id === id);
  const dlg = $<HTMLDialogElement>('#quick');
  if (!p || !dlg) return;
  mount(dlg, html`<div class="qv"><img src="${asset(p.images[0] ?? '')}" alt="${p.imageAlts?.[0] ?? p.name}" /><div>
    <h2>${p.name}</h2><p class="price">${money(unitPrice(p), ctx.settings.currency)}</p><p>${p.description}</p>
    <p class="muted">${p.fragrance} · ${p.size} · ${p.waxType}</p>
    <div class="card-actions"><button class="btn primary" type="button" data-add="${p.id}" ${p.available ? '' : html`disabled`}>افزودن به سبد</button>
    <a class="btn ghost" href="#/product/${p.id}" data-close>جزئیات کامل</a><button class="btn ghost" type="button" data-close>بستن</button></div></div></div>`);
  dlg.showModal();
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const add = t.closest<HTMLElement>('[data-add]');
  const q = t.closest<HTMLElement>('[data-quick]');
  if (add?.dataset.add) { cart.add(add.dataset.add); toast('به سبد خرید اضافه شد.'); }
  else if (q?.dataset.quick) quickView(q.dataset.quick);
  const dlg = $<HTMLDialogElement>('#quick');
  if (dlg?.open && (t.closest('[data-close]') || t === dlg)) dlg.close();
});


async function start() {
  try {
    ctx = await loadCatalog();
  } catch {
    mount($('#app')!, html`<div class="wrap empty"><h1>بارگذاری فروشگاه ممکن نشد</h1><p>لطفاً صفحه را دوباره بارگذاری کنید.</p></div>`);
    return;
  }
  renderLayout(ctx.settings);
  watchHeader();
  setCount(cart.count());
  cart.subscribe(() => {
    setCount(cart.count());
    if (parse().segs[0] === 'cart') render(false);
  });
  window.addEventListener('hashchange', () => render());
  // Admin live preview: same-origin only, validated, appearance applied in memory (never saved from here).
  if (new URLSearchParams(location.search).has('preview')) {
    document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex" />');
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin) return;
      const d = e.data as { type?: string; settings?: Settings } | null;
      if (d?.type !== 'candle-preview' || !d.settings || validateSettings(d.settings).length) return;
      ctx = { ...ctx, settings: d.settings };
      renderLayout(d.settings);
      setCount(cart.count());
      render(false);
    });
    window.parent.postMessage({ type: 'candle-preview-ready' }, location.origin);
  }
  render(false);
}
void start();
