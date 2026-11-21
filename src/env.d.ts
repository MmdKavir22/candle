/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SITE_REPO?: string; // owner/name of this repo (prefills the admin login)
  readonly VITE_TELEGRAM_USERNAME?: string;
  readonly VITE_ORDERS_API_URL?: string; // order-intake worker URL (public, not a secret)
}
