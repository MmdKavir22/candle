// Order logic shared by the storefront, the admin panel, the serverless intake and tests. Pure: no DOM, no network.
import type { Product } from './types';
import { ID_RE } from './validate';

export const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'done', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const STATUS_LABEL: Record<OrderStatus, string> = { new: 'جدید', confirmed: 'تأیید شده', preparing: 'در حال آماده‌سازی', shipped: 'ارسال شده', done: 'تکمیل شده', cancelled: 'لغو شده' };

export interface Customer { name: string; phone: string; address: string; notes: string; postalCode?: string; telegram?: string }
export interface OrderInput { customer: Customer; items: { id: string; qty: number }[]; website?: string }
export interface OrderItem { id: string; name: string; qty: number; unit: number; total: number }
export interface Order {
  id: string; createdAt: string; updatedAt?: string; status: OrderStatus;
  customer: Customer; items: OrderItem[]; total: number; currency: string; adminNote?: string;
}

export const PHONE_RE = /^[0-9۰-۹+\-\s()]{7,20}$/;
export const ORDER_ID_RE = /^ord-[a-z0-9]+-[a-z0-9]{4,8}$/;
export const POSTAL_RE = /^[0-9۰-۹]{10}$/;
export const TG_RE = /^(@?[A-Za-z0-9_]{4,32}|\+?[0-9۰-۹]{8,15})$/;
export const TEMPLATE_VARS = ['code', 'name', 'address', 'postalCode', 'phone', 'telegram', 'items', 'total', 'notes', 'date', 'brand'] as const;
export const DEFAULT_TEMPLATE = `نام و نام خانوادگی: {{name}}\nآدرس: {{address}}\nکدپستی: {{postalCode}}\nشماره تماس: {{phone}}\nآیدی تلگرام: {{telegram}}\nمحصولات:\n{{items}}\nجمع کل: {{total}}\nتوضیحات: {{notes}}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function validateOrderInput(x: unknown, requireAddress: boolean): string[] {
  const e: string[] = [];
  if (!isObj(x)) return ['درخواست نامعتبر است.'];
  if (x.website !== undefined && x.website !== '') e.push('درخواست نامعتبر است.'); // honeypot
  const c = x.customer;
  if (!isObj(c)) return [...e, 'اطلاعات مشتری ارسال نشده است.'];
  const name = s(c.name), phone = s(c.phone), address = s(c.address), notes = s(c.notes);
  if (name.length < 2 || name.length > 80) e.push('نام را وارد کنید (۲ تا ۸۰ نویسه).');
  if (!PHONE_RE.test(phone)) e.push('شماره تماس نامعتبر است.');
  if (requireAddress && address.length < 8) e.push('نشانی را کامل وارد کنید.');
  if (address.length > 400) e.push('نشانی حداکثر ۴۰۰ نویسه است.');
  if (notes.length > 500) e.push('توضیحات حداکثر ۵۰۰ نویسه است.');
  const postal = s(c.postalCode).replace(/[\s-]/g, ''), tg = s(c.telegram);
  if (postal && !POSTAL_RE.test(postal)) e.push('کدپستی باید ۱۰ رقم باشد.');
  if (tg && !TG_RE.test(tg)) e.push('آیدی تلگرام نامعتبر است (مثلاً @username).');
  if (!Array.isArray(x.items) || x.items.length < 1 || x.items.length > 30) e.push('سبد خرید خالی یا بیش از حد بزرگ است.');
  else x.items.forEach((i) => {
    if (!isObj(i) || typeof i.id !== 'string' || !ID_RE.test(i.id) || typeof i.qty !== 'number' || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 99) e.push('یکی از اقلام سبد نامعتبر است.');
  });
  return e;
}

export function newOrderId(nowMs: number, rnd: Uint8Array): string {
  const r = Array.from(rnd).map((b) => (b % 36).toString(36)).join('').slice(0, 6).padEnd(4, '0');
  return `ord-${nowMs.toString(36)}-${r}`;
}

/** Prices and names are always taken from the catalog, never from the client. */
export function buildOrder(input: unknown, products: Product[], o: { id: string; now: string; currency: string; requireAddress: boolean }): { order?: Order; errors: string[] } {
  const errors = validateOrderInput(input, o.requireAddress);
  if (errors.length) return { errors };
  const x = input as OrderInput;
  const byId = new Map(products.map((p) => [p.id, p]));
  const qty = new Map<string, number>();
  x.items.forEach((i) => qty.set(i.id, Math.min(99, (qty.get(i.id) ?? 0) + i.qty)));
  const items: OrderItem[] = [];
  for (const [id, q] of qty) {
    const p = byId.get(id);
    if (!p || p.published === false) { errors.push(`محصول «${id}» پیدا نشد.`); continue; }
    if (!p.available) { errors.push(`«${p.name}» در حال حاضر ناموجود است.`); continue; }
    const unit = p.discountPrice !== null && p.discountPrice < p.price ? p.discountPrice : p.price;
    items.push({ id, name: p.name, qty: q, unit, total: unit * q });
  }
  if (errors.length) return { errors };
  const c = x.customer;
  return {
    errors,
    order: {
      id: o.id, createdAt: o.now, status: 'new', currency: o.currency, items, total: items.reduce((a, i) => a + i.total, 0),
      customer: { name: s(c.name), phone: s(c.phone), address: s(c.address), notes: s(c.notes), postalCode: s(c.postalCode).replace(/[\s-]/g, ''), telegram: s(c.telegram) },
    },
  };
}

export interface Fmt { money: (n: number) => string; num: (n: number) => string; date: (iso: string) => string }
export function renderOrderMessage(template: string, o: Order, brand: string, f: Fmt): string {
  const vars: Record<string, string> = {
    code: o.id, name: o.customer.name, phone: o.customer.phone, address: o.customer.address || '—', notes: o.customer.notes || '—',
    postalCode: o.customer.postalCode || '—', telegram: o.customer.telegram || '—',
    items: o.items.map((i) => `• ${i.name} × ${f.num(i.qty)} = ${f.money(i.total)}`).join('\n'),
    total: f.money(o.total), date: f.date(o.createdAt), brand,
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? (vars[k] as string) : m));
}
