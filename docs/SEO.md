# SEO
- `index.html` ships static title, description, canonical, Open Graph, Twitter and JSON-LD (Organization, WebSite). `__SITE_URL__` is replaced at build time.
- `scripts/postbuild.mjs` writes `products/<id>/index.html` per product with its own meta tags and JSON-LD (Product, Offer, BreadcrumbList), plus `sitemap.xml` and `robots.txt`. Prices use `settings.seo` (`IRR` with ×10 from Toman); availability mirrors the data. No ratings or reviews are invented.
- The interactive app uses `#/` routes; the static product pages are what search engines index and link to the app.
- Replace `images/banners/hero.svg` as the social image with a 1200×630 JPG/PNG for best previews, and update the `og:image` tag.
- On project sites (`user.github.io/repo/`) `robots.txt` is only honoured at the domain root; use a custom domain for full control.
- Submit `sitemap.xml` in Google Search Console. Measure with Lighthouse; no scores or rankings are guaranteed. Use real photos, `.webp` files and write descriptive alt text in the admin.
