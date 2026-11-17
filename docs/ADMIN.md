# Admin guide

## Create the OAuth App
GitHub → Settings → Developer settings → OAuth Apps → New. Homepage: your site URL. Callback: `https://<worker-domain>/auth/callback`. Copy the Client ID; generate a Client Secret (store it only as a worker secret).

## Repository token
Settings → Developer settings → Fine-grained tokens → select **only this repository**, permission **Contents: Read and write**, nothing else. Set an expiry and rotate it.

## Worker
```bash
cd serverless/auth-and-github-api
npx wrangler deploy
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET      # 32+ random chars (openssl rand -base64 48)
npx wrangler secret put GITHUB_REPO_TOKEN
```
Edit `wrangler.toml` vars: `ALLOWED_USERS` (comma-separated logins), `ALLOWED_ORIGIN` (`https://USER.github.io`, no path), `ADMIN_URL`, `GITHUB_REPO`.
Recommended: add a Cloudflare rate-limiting rule for `/api/*` and `/auth/*`.

## Using the panel
Open `/admin/`, sign in with GitHub. Only allowlisted logins get a session (8 hours, then sign in again). Each save is a commit; the site redeploys automatically. Real customer reviews only — the testimonials list ships empty on purpose.
