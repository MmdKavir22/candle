import { DEFAULT_TEMPLATE, type Fmt, type Order, type OrderInput } from '../shared/order';
import type { Settings } from '../shared/types';
import { dateFa, faNum, money } from '../utils/format';

export const ORDERS_API = (import.meta.env.VITE_ORDERS_API_URL ?? '').replace(/\/$/, '');
/** Saved orders need the intake service; without it the cart keeps its Telegram-only flow. */
export const ordersEnabled = (s: Settings) => !!ORDERS_API && (s.orders?.enabled ?? true);
export const orderTemplate = (s: Settings) => s.orders?.messageTemplate?.trim() || DEFAULT_TEMPLATE;
export const makeFmt = (cur: string): Fmt => ({ money: (n) => money(n, cur), num: faNum, date: dateFa });

export async function submitOrder(payload: OrderInput): Promise<Order> {
  let r: Response;
  try {
    r = await fetch(`${ORDERS_API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch { throw new Error('اتصال به سرور برقرار نشد. اینترنت را بررسی کنید یا از ارسال مستقیم در تلگرام استفاده کنید.'); }
  const b = (await r.json().catch(() => ({}))) as { order?: Order; error?: string; details?: string[] };
  if (r.ok && b.order) return b.order;
  if (r.status === 429) throw new Error('تعداد درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره تلاش کنید.');
  throw new Error([b.error ?? 'ثبت سفارش انجام نشد.', ...(b.details ?? [])].join(' — '));
}
