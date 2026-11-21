# Candle Store — one repo: site + admin panel

Persian (RTL) static candle shop on GitHub Pages. The public site is at `https://USERNAME.github.io/REPOSITORY/` and the admin panel at `.../REPOSITORY/admin/`. The admin edits **this same repo** (products, categories, homepage, settings, images) through the GitHub API with your token; every save is a commit on `main`, which rebuilds and publishes the site automatically.

## Where the content lives
| What | Path |
|---|---|
| Products, categories, homepage, settings | `public/data/*.json` |
| Images | `public/images/…` |

## Setup
1. Create a **public** GitHub repo, push this project to `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. (Optional) Actions **Variables**: `VITE_TELEGRAM_USERNAME`, `ORDERS_API_URL`.
4. Create a fine-grained token (GitHub → Settings → Developer settings): only this repo, **Contents: Read and write** (add **Actions: Read and write** for the manual publish button), with an expiry.
5. Open `/admin/`, paste the token (the repo link is prefilled).

The token stays in the tab's memory/sessionStorage and goes only to `api.github.com`; it is never committed.

## Notes
- The repo is public, so all saved data is public. Draft products are hidden from the site but visible in the repo files. Don't store secrets or customer data here.
- Orders (optional): `serverless/orders-api` is a Cloudflare Worker that stores orders in a **separate private repo**. Enter that repo in the admin login form to see orders.

## Development
```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck && npm test && npm run build
```
See `docs/SECURITY.md` and `docs/SEO.md`.
