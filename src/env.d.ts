/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SITE_REPO?: string; // owner/name of this public site repo (for auto-publish)
  readonly VITE_DATA_REPO?: string; // optional: prefill the private data repo name
  readonly VITE_TELEGRAM_USERNAME?: string;
  readonly VITE_ORDERS_API_URL?: string; // order-intake worker URL (public, not a secret)
}
