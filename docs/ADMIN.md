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
