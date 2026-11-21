/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_TELEGRAM_USERNAME?: string;
  readonly VITE_ORDERS_API_URL?: string; // order-intake worker URL (public, not a secret)
}
