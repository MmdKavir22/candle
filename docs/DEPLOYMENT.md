# Deployment checklist
1. Push to `main`; Pages source = GitHub Actions.
2. Actions → "Deploy to GitHub Pages" must be green.
3. Visit the site URL; verify CSS, images, `#/shop`, a product, cart, Telegram button, `/admin/`.
4. `https://…/sitemap.xml` and a `products/<id>/` page load; view-source shows canonical + JSON-LD with the real URL.
5. Set a real Telegram username before announcing the store.
