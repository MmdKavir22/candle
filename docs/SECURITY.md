# Security notes
- **Static site, no backend.** The admin talks directly to `api.github.com` from your browser with *your* token. The token is never stored in the repo, the bundle or the build; it lives in memory/sessionStorage of the admin tab and is cleared on exit.
- **Secrets**: `DATA_REPO` and `DATA_REPO_TOKEN` are Actions secrets used only during the build to read the private repo. Never put tokens in `VITE_*` variables (they are baked into public JS).
- **Access control** is GitHub's: only a token with write access to the private data repo can change the catalog. The admin refuses to run against a public data repo.
- **Least privilege**: build token = Contents read-only on one repo; admin token = Contents write on the data repo + Actions write on the site repo; use expiry and rotate.
- **Concurrency**: every write sends the file SHA; conflicts are reported, never overwritten.
- **Validation** runs in the admin and again in CI (`npm run validate:data`); an invalid catalog fails the build and the old site stays live. Images: JPG/PNG/WebP only, re-encoded and size-limited in the browser.
- **Frontend**: all interpolated values are HTML-escaped by default; data links must start with `#/` or `https://`; strict CSP (`script-src 'self'`) limits damage from XSS, which is the main risk for a token held in the page.
- **Privacy**: no customer data is collected or stored; the cart keeps only IDs and quantities; custom-order images stay on the device.
- **Limits to know**: published product data is public by design; anyone who steals your admin token can edit the catalog, so keep it short-lived and don't paste it on shared computers.
