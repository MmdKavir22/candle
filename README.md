# Candle Store — site (public repo)

Persian (RTL) static candle shop on GitHub Pages. Customers browse, fill a cart and send the order in Telegram.
The **admin panel lives in a separate repository** (`candle-admin`). It edits this repo directly (products, categories, homepage, settings, images); every save is a commit on `main`, which rebuilds and publishes the site automatically.

## Where the content lives
| What | Path in this repo |
|---|---|
| Products, categories, homepage, settings | `public/data/*.json` |
| Images (products, categories, banners, wallpaper) | `public/images/…` |

You normally never edit these by hand; use the admin panel.

## Setup
1. Create a GitHub repo (e.g. `candle`), push this project to `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. (Optional) **Settings → Secrets and variables → Actions → Variables**: `VITE_TELEGRAM_USERNAME`, `ORDERS_API_URL`.
4. Push. `deploy.yml` validates, tests, builds and publishes: `https://USERNAME.github.io/REPOSITORY/`.
5. Set up the admin repo (see its README) and log in with a token that has **Contents: Read and write** on this repo.

## Local development
```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck && npm test && npm run build
```

## Orders (optional)
`serverless/orders-api` is a small Cloudflare Worker that stores each order as a JSON file in a **separate private repo** (never this one). Set `GITHUB_REPO` / `ALLOWED_ORIGIN` in its `wrangler.toml`, run `npx wrangler deploy`, add the secret `GITHUB_REPO_TOKEN`, then set the repo variable `ORDERS_API_URL`. Enter the same private orders repo on the admin login form to see orders in the admin.

## Security / SEO
See `docs/SECURITY.md` and `docs/SEO.md`.
