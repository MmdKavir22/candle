# Security notes
- **One public repo.** The admin (`/admin/`) talks directly to `api.github.com` from your browser with your own token; the token is never stored in the repo, the bundle or the build (tab memory/sessionStorage only).
- **Everything here is public.** `public/data/*.json` and `public/images/` are visible to anyone. Never put customer data, orders or tokens in this repo. Saved orders go to a *separate private* repo through the orders worker.
- **Drafts**: products with `published: false` are removed from the built site by `npm run prepare:public`, but they remain visible in the repo's files. Don't keep secrets in them.
- **Access control** is GitHub's: only a token with Contents write on this repo can change the catalog. Use a fine-grained token limited to this repo, with an expiry, and rotate it.
- **Validation** runs in the admin and again in CI (`npm run validate:data`); an invalid catalog fails the build and the previous site stays live.
- **Orders worker** (optional): the origin check does not stop non-browser spam; add a Cloudflare rate-limit rule. Order JSON contains personal data, so keep the orders repo private.
