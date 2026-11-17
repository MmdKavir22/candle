# Security notes
- **No secrets in the browser.** OAuth client secret, session secret and repository token exist only as worker secrets. The GitHub user token is discarded right after identity lookup.
- **OAuth**: random `state` and PKCE verifier stored in a short-lived HttpOnly cookie; callback rejects mismatches.
- **Session**: HMAC-signed, expiring (8 h), `HttpOnly; Secure; SameSite=None; __Host-` cookie; allowlist re-checked on every request; logout clears it.
- **CSRF/CORS**: mutating requests require the exact `Origin` and an `X-Requested-With` header (forces a CORS preflight); only `ALLOWED_ORIGIN` receives CORS headers.
- **Writes** go only to `public/data/*.json` and `public/images/{products,banners,categories}`; payloads are validated with the same validators as the UI and CI; file SHA is required (conflicts → 409); uploads are size-limited and checked by magic bytes; SVG uploads are not accepted.
- **Frontend**: every interpolated value is HTML-escaped by default (`html` tag); links from data must start with `#/` or `https://`; strict CSP (`script-src 'self'`).
- **Privacy**: no customer data is collected or stored; the cart holds only IDs and quantities; custom-order images stay on the device.
- **Repository hygiene**: CI audits dependencies and greps for committed secrets; workflows run with read-only permissions (Pages deploy adds `pages`/`id-token`). Public workflows are never used as a write endpoint.
- Residual risks: the repo token has Contents write — keep it single-repo, short-lived, and protect `main` as you see fit; Safari may block third-party session cookies (see README).
