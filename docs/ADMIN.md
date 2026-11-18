# Admin guide (GitHub-only, no worker)

## One-time setup
1. **Private data repo**: create `USERNAME/candle-data` (Private). Create it with "Add a README" ticked (the build needs at least one commit). You do **not** need to upload anything: on first login the admin creates any missing `data/*.json` file automatically (empty product list, sample categories/homepage/settings). `data-repo-template/` is optional if you want the sample products and images.
2. **Build token** (read-only): Settings → Developer settings → Fine-grained tokens → only `candle-data`, **Contents: Read-only**. In the *site* repo: Settings → Secrets and variables → Actions → Secrets:
   - `DATA_REPO` = `USERNAME/candle-data`
   - `DATA_REPO_TOKEN` = that token
   Secrets are readable only by the workflow at build time; they never reach the browser.
3. **Admin token** (yours, read/write): fine-grained token for `candle-data` (**Contents: Read and write**) and the site repo (**Actions: Read and write**). Set an expiry.

## Daily use
Open `https://USERNAME.github.io/REPOSITORY/admin/`, paste the admin token and `USERNAME/candle-data`. Saving commits to the private repo and dispatches the deploy workflow; the live site updates in a few minutes. If the build fails validation, the previous version stays live.
The token stays in this tab's memory/sessionStorage only; "Exit" or closing the tab clears it. Real customer reviews only: testimonials ship empty.

## Orders worker
1. **Token for the worker**: fine-grained token, only the private data repo, **Contents: Read and write** (separate from your admin token).
2. ```bash
   cd serverless/orders-api
   # edit wrangler.toml: GITHUB_REPO, ALLOWED_ORIGIN (https://USERNAME.github.io, no path)
   npx wrangler deploy
   npx wrangler secret put GITHUB_REPO_TOKEN
   ```
3. In the site repo: Settings → Secrets and variables → Actions → **Variables** → `ORDERS_API_URL` = the worker URL. Re-run the deploy workflow (the build adds this origin to the page's CSP).
4. Recommended: Cloudflare → Security → rate-limiting rule for `POST /orders` (the worker also has a best-effort limit).
5. Check: `https://<worker>/health` returns `{"ok":true}`; place a test order; it appears in the admin **Orders** tab and as `orders/…` in the private repo.

Orders live only in the private repo and are never copied into the public site (the build copies `data/` and `images/` only).

## Order message template
Settings → «ثبت سفارش و پیام». Placeholders: `{{code}} {{name}} {{phone}} {{address}} {{items}} {{total}} {{notes}} {{date}} {{brand}}`. The same template is used on the customer's confirmation page and in the admin's "copy message". The customer must still paste and send the message in Telegram themselves.

## Existing data / migration
If a `data/*.json` file is missing in the private repo, the admin copies it from what the live site currently publishes (validated), writes it, re-reads it to verify, and never overwrites an existing file. A snapshot of the project before this update is in `backup-before-update/`; the admin also has "download JSON backup".
