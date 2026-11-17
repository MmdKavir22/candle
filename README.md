# Candle Store — static catalog on GitHub Pages

A Persian (RTL), pastel-blue showcase store for handmade candles. Customers browse, fill a cart, and **place the order manually in Telegram**. There is no payment, no customer login and no customer database. The site is 100% static; an optional tiny serverless service lets the owner edit the catalog through `/admin/` using GitHub login.

## Features
- Home, shop (search, category filter, price/newest sort, availability filter), product pages with gallery, quick view, related products
- Cart persisted in `localStorage` (only product IDs and quantities)
- **Telegram order**: builds a Persian summary, copies it to the clipboard, opens `https://t.me/<username>`. The customer must paste and send it — the site never claims a message was sent. A "copy summary" button is always available.
- Custom candle request page with live summary, optional price estimate, local-only image preview
- Admin (`/admin/`): GitHub OAuth, product/category/homepage/settings editing, image upload with client-side WebP optimisation
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
3. (Optional) Settings → Secrets and variables → Actions → **Variables**: `VITE_API_URL` (your worker URL), `VITE_TELEGRAM_USERNAME`.
4. Push. `deploy.yml` type-checks, validates JSON, runs tests, builds and deploys.
The workflow computes `BASE_PATH` (`/REPOSITORY/` or `/` for `USERNAME.github.io`) and `SITE_URL` automatically; locally set them in `.env` if you test a sub-path build. Routing uses `#/…` hashes, so refresh works on any page; `products/<id>/` pages are real static files.
Test: open `https://USERNAME.github.io/REPOSITORY/`, check CSS/images, `#/shop`, a product, the cart, `/admin/`.

## Admin setup
Full steps in [docs/ADMIN.md](docs/ADMIN.md). Summary:
1. Create a GitHub OAuth App; callback URL `https://<worker>/auth/callback`.
2. Create a fine-grained PAT limited to this repository with **Contents: read/write** only.
3. Deploy `serverless/auth-and-github-api` (Cloudflare Workers): `npx wrangler deploy`, set vars in `wrangler.toml` (`GITHUB_REPO`, `ALLOWED_USERS`, `ALLOWED_ORIGIN`, `ADMIN_URL`) and secrets with `wrangler secret put` (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `GITHUB_REPO_TOKEN`).
4. Set repository variable `VITE_API_URL` and redeploy.
A GitHub App installation token can replace the PAT with small changes in `worker.ts` (same permission scope).

## Product management
Products live in `public/data/products.json`; categories, homepage and settings in sibling files. The admin edits them through the worker, which validates the data, checks the SHA to avoid overwriting concurrent edits, and commits to `main`; the push triggers a new deployment (takes a few minutes). Images go to `public/images/{products,banners,categories}`.

## SEO
See [docs/SEO.md](docs/SEO.md). Add the site to Google Search Console and submit `sitemap.xml`. No ranking or score is promised.

## Security
See [docs/SECURITY.md](docs/SECURITY.md).

## Troubleshooting
| Problem | Fix |
|---|---|
| Blank page / 404 for CSS/JS | `BASE_PATH` wrong; must be `/REPOSITORY/` |
| Admin says "VITE_API_URL not set" | Add the repo variable and redeploy |
| Login loops back to login (Safari/Brave) | Third-party cookies blocked: put the worker on a subdomain of your own domain and host Pages on the same parent domain, then change cookie `SameSite` to `Lax` |
| "فایل هم‌زمان تغییر کرده" (409) | Press Reload in the admin and redo the edit |
| 502 GitHub permission error | PAT expired or lacks Contents write on this repo |
| Image rejected | JPG/PNG/WebP only; ≤ 2 MB after optimisation |
| `validate:data` fails | Read the message; it names the file and field |
