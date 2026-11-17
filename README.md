# Candle Store — static catalog on GitHub Pages

A Persian (RTL), pastel-blue showcase store for handmade candles. Customers browse, fill a cart, and **place the order manually in Telegram**. There is no payment, no customer login and no customer database. The site is 100% static; an private GitHub repository holds the catalog, and the owner edits it through `/admin/` with their own GitHub token. No server or worker is needed.

## Features
- Home, shop (search, category filter, price/newest sort, availability filter), product pages with gallery, quick view, related products
- Cart persisted in `localStorage` (only product IDs and quantities)
- **Telegram order**: builds a Persian summary, copies it to the clipboard, opens `https://t.me/<username>`. The customer must paste and send it — the site never claims a message was sent. A "copy summary" button is always available.
- Custom candle request page with live summary, optional price estimate, local-only image preview
- Admin (`/admin/`): sign in with your GitHub token; edit products, categories, homepage and settings; images are optimised to WebP in the browser; data is committed to a **private** repo and the site is rebuilt automatically
- SEO: static meta, canonical, Open Graph/Twitter, JSON-LD (Organization, WebSite, Product, Offer, BreadcrumbList), sitemap, robots.txt, pre-rendered product pages
- Stack: HTML5, CSS3, TypeScript (strict), Vite, GitHub Actions, JSON data. No PHP, Python, database or paid backend.

## Local development
```bash
node -v            # 20+
npm install
cp .env.example .env   # optional
npm run dev            # http://localhost:5173
npm run typecheck
npm test
npm run build          # tsc + vite build + static SEO pages; output in dist/
npm run preview
```
Layout deviation: catalog JSON lives in `public/data/` (not `data/`) so Vite serves and copies it as-is.

## Telegram configuration
Set `telegramUsername` in `public/data/settings.json` (or in the admin → Settings). Without `@`, 5–32 characters.
Fallback: build variable `VITE_TELEGRAM_USERNAME`. Test: open the cart, press the order button, confirm `https://t.me/<username>` opens and the summary is on your clipboard. (Telegram has no documented prefilled-text link for personal chats, so the copy flow is used.)

## Deploy to GitHub Pages
1. Create a GitHub repository, push this project to `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. (Optional) Actions **Variables**: `VITE_TELEGRAM_USERNAME`, `DATA_REPO_NAME` (prefills the admin login; the name is not secret).
4. Push. `deploy.yml` type-checks, validates JSON, runs tests, builds and deploys.
The workflow computes `BASE_PATH` (`/REPOSITORY/` or `/` for `USERNAME.github.io`) and `SITE_URL` automatically; locally set them in `.env` if you test a sub-path build. Routing uses `#/…` hashes, so refresh works on any page; `products/<id>/` pages are real static files.
Test: open `https://USERNAME.github.io/REPOSITORY/`, check CSS/images, `#/shop`, a product, the cart, `/admin/`.

## Admin setup (no worker)
Full steps in [docs/ADMIN.md](docs/ADMIN.md). Summary:
1. Create a **private** repository (e.g. `candle-data`) and upload the contents of `data-repo-template/` (`data/` and `images/`) to its root.
2. Create a fine-grained token with access to the data repo (**Contents: Read**) and add Actions **secrets** in the site repo: `DATA_REPO` (`USERNAME/candle-data`) and `DATA_REPO_TOKEN`. The deploy workflow uses them at build time to pull the catalog into the site.
3. Create your own admin token (fine-grained, repos: data repo + this site repo; **Contents: Read and write** on the data repo, **Actions: Read and write** on the site repo).
4. Open `/admin/`, paste that token and the data repo name. Every save commits to the private repo and triggers a new deploy.

## Product management
The catalog lives in the private data repo: `data/products.json`, `categories.json`, `homepage.json`, `settings.json`, and `images/{products,banners,categories}`. The admin validates input, commits with file-SHA checks (no overwriting concurrent edits), then dispatches the deploy workflow. The site repo's `public/data/` holds only sample data used when no `DATA_REPO` secret is set. Note: the published storefront is public by nature, so product data you publish is visible to visitors; only the repository itself is private.

## SEO
See [docs/SEO.md](docs/SEO.md). Add the site to Google Search Console and submit `sitemap.xml`. No ranking or score is promised.

## Security
See [docs/SECURITY.md](docs/SECURITY.md).

## Troubleshooting
| Problem | Fix |
|---|---|
| Blank page / 404 for CSS/JS | `BASE_PATH` wrong; must be `/REPOSITORY/` |
| Admin login says token has no access | Token must include the data repo with Contents: Read and write |
| "مخزن عمومی است" | The data repo must be private |
| Saved but not published | Token needs Actions: Read and write on the site repo, or run the deploy workflow manually |
| 409 / concurrent change | Press Reload in the admin and redo the edit |
| Image rejected | JPG/PNG/WebP only; ≤ 2 MB after optimisation |
| `validate:data` fails | Read the message; it names the file and field |
