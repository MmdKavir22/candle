import type { CartItem } from '../cart/logic';
import { TG_RE } from '../shared/validate';
import { money, faNum } from '../utils/format';

export function telegramUrl(username: string): string | null {
  const n = username.trim().replace(/^@/, '');
  return TG_RE.test(n) ? `https://t.me/${n}` : null;
}

export function orderText(items: CartItem[], subtotal: number, cur: string, urlFor: (id: string) => string): string {
  const lines = items.map((i, n) =>
    `${faNum(n + 1)}. ${i.product.name} (کد: ${i.product.id})\n   ${faNum(i.qty)} × ${money(i.unit, cur)} = ${money(i.total, cur)}\n   ${urlFor(i.product.id)}`);
  return ['سلام، می‌خواهم این سفارش را ثبت کنم:', '', ...lines, '', `جمع کل: ${money(subtotal, cur)}`, '', 'لطفاً موجودی، هزینه ارسال و نحوه پرداخت را اعلام کنید.'].join('\n');
}

export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
}
