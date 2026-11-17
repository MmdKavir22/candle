// Post-build: static SEO output for GitHub Pages (no server needed).
//  - replaces __SITE_URL__ in dist/index.html
//  - writes dist/products/<id>/index.html with real meta tags + JSON-LD (Product, Offer, BreadcrumbList)
//  - writes dist/sitemap.xml and dist/robots.txt
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL || 'http://localhost:4173').replace(/\/$/, '');
const BASE = process.env.BASE_PATH || '/';
const read = (n) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const products = read('products');
const categories = read('categories');
const settings = read('settings');
const { priceCurrency, priceMultiplier } = settings.seo;

const indexPath = 'dist/index.html';
let index = readFileSync(indexPath, 'utf8');
writeFileSync(indexPath, index.replaceAll('__SITE_URL__', SITE));
index = index.replaceAll('__SITE_URL__', SITE);
const css = [...index.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]).join('\n  ');

for (const p of products) {
  const url = `${SITE}/products/${p.id}/`;
  const img = `${SITE}/${p.images[0]}`;
  const cat = categories.find((c) => c.id === p.category);
  const price = p.discountPrice !== null && p.discountPrice < p.price ? p.discountPrice : p.price;
  const desc = p.description.slice(0, 155);
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, image: p.images.map((i) => `${SITE}/${i}`), sku: p.id, brand: { '@type': 'Brand', name: settings.brandName },
      offers: { '@type': 'Offer', url, priceCurrency, price: String(price * priceMultiplier), availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: `${SITE}/` },
      ...(cat ? [{ '@type': 'ListItem', position: 2, name: cat.name, item: `${SITE}/` }] : []),
      { '@type': 'ListItem', position: cat ? 3 : 2, name: p.name, item: url }] },
  ];
  const page = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(p.name)} | ${esc(settings.brandName)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="product" />
  <meta property="og:locale" content="fa_IR" />
  <meta property="og:title" content="${esc(p.name)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.name)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  ${css}
  ${jsonld.map((o) => `<script type="application/ld+json">${ld(o)}</script>`).join('\n  ')}
</head>
<body>
  <main class="static-product">
    <nav class="crumbs" aria-label="مسیر صفحه"><a href="${BASE}">خانه</a> ‹ <a href="${BASE}#/shop">فروشگاه</a> ‹ <span aria-current="page">${esc(p.name)}</span></nav>
    <img src="${BASE}${p.images[0]}" alt="${esc(p.imageAlts?.[0] ?? p.name)}" width="800" height="800" />
    <h1>${esc(p.name)}</h1>
    <p>${esc(p.description)}</p>
    <ul><li>رایحه: ${esc(p.fragrance)}</li><li>اندازه: ${esc(p.size)}</li><li>نوع موم: ${esc(p.waxType)}</li><li>مدت سوختن: ${esc(p.burningDuration)}</li><li>${p.available ? 'موجود' : 'ناموجود'}</li></ul>
    <p><a class="btn primary" href="${BASE}#/product/${p.id}">مشاهده در فروشگاه و افزودن به سبد</a></p>
  </main>
</body>
</html>
`;
  mkdirSync(`dist/products/${p.id}`, { recursive: true });
  writeFileSync(`dist/products/${p.id}/index.html`, page);
}

const today = new Date().toISOString().slice(0, 10);
const urls = [`${SITE}/`, ...products.map((p) => `${SITE}/products/${p.id}/`)];
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
// robots.txt: on project sites the file must live at the domain root to be honoured; kept here for custom domains.
writeFileSync('dist/robots.txt', `User-agent: *\nDisallow: ${BASE}admin/\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Generated ${products.length} product pages, sitemap.xml and robots.txt for ${SITE}`);
