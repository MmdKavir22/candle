import { breadcrumbs, sendViaTelegram, toast } from '../components/ui';
import { copyText } from '../services/telegram';
import { GROUP_KEYS, type GroupKey } from '../shared/types';
import { html, $, $$ } from '../utils/dom';
import { faNum, money } from '../utils/format';
import { clampQty } from '../cart/logic';
import type { PageFn } from './types';

const LABELS: Record<GroupKey, string> = { size: 'اندازه', shape: 'شکل', color: 'رنگ', fragrance: 'رایحه', wax: 'نوع موم', container: 'ظرف', style: 'سبک دکور' };
const MAX_IMG = 5 * 1024 * 1024;

export const custom: PageFn = ({ settings: s }) => {
  const c = s.customOrder;
  if (!c.enabled) return { title: `شمع سفارشی | ${s.brandName}`, view: html`<section class="wrap empty"><h1>شمع سفارشی</h1><p>سفارش شمع شخصی‌سازی‌شده فعلاً فعال نیست.</p></section>` };
  return {
    title: `شمع سفارشی | ${s.brandName}`,
    desc: 'شمع دلخواه خود را انتخاب کنید: اندازه، شکل، رنگ، رایحه و نوشته؛ سپس خلاصه را در تلگرام بفرستید.',
    view: html`${breadcrumbs([['خانه', '#/'], ['شمع سفارشی']])}
    <section class="wrap"><h1>شمع سفارشی</h1><p class="muted">گزینه‌ها را انتخاب کنید و خلاصه را در تلگرام بفرستید. هیچ اطلاعاتی در این سایت ذخیره یا ارسال نمی‌شود.</p>
    <div class="cart-layout"><form id="cf" class="panel"><div class="form-grid">
      ${GROUP_KEYS.map((k) => html`<label>${LABELS[k]}<select name="${k}">${c.groups[k].map((o, i) => html`<option value="${i}">${o.label}</option>`)}</select></label>`)}
      <label>متن یا نام روی شمع<input name="text" maxlength="60" /></label>
      <label>تعداد<input name="qty" type="number" min="1" max="50" value="1" /></label></div>
      <p><label class="chk"><input type="checkbox" name="gift" />${c.giftPackaging.label}${c.giftPackaging.extra ? ` (${c.giftPackaging.extra > 0 ? '+' : ''}${faNum(c.giftPackaging.extra)} ${s.currency})` : ''}</label></p>
      <label>توضیحات بیشتر<textarea name="notes" maxlength="500"></textarea></label>
      <label>تصویر مرجع (اختیاری)<input type="file" name="img" accept="image/jpeg,image/png,image/webp" /></label>
      <p class="muted" id="imgnote">تصویر فقط روی دستگاه شما نمایش داده می‌شود و آپلود نمی‌شود. پس از باز شدن تلگرام، خودتان آن را در گفتگو ضمیمه کنید.</p>
      <img class="preview" id="pv" alt="" hidden />
    </form>
    <aside class="panel sum"><h2>خلاصه درخواست</h2><div class="summary-box" id="sum" aria-live="polite"></div><p id="est" class="notice"></p>
      <button class="btn primary" type="button" id="tg">ارسال در تلگرام</button><button class="btn ghost" type="button" id="copy">کپی خلاصه</button></aside></div></section>`,
    mount(root, signal) {
      const form = $<HTMLFormElement>('#cf', root)!;
      let preview = '';
      const build = () => {
        const d = new FormData(form);
        const qty = clampQty(Number(d.get('qty')));
        let unit = c.basePrice;
        const lines = GROUP_KEYS.map((k) => {
          const o = c.groups[k][Number(d.get(k))];
          unit += o?.extra ?? 0;
          return `${LABELS[k]}: ${o?.label ?? '-'}`;
        });
        const gift = d.get('gift') === 'on';
        if (gift) unit += c.giftPackaging.extra;
        const text = String(d.get('text') ?? '').trim();
        const notes = String(d.get('notes') ?? '').trim();
        const est = c.basePrice > 0 ? Math.max(0, unit) * qty : null;
        const summary = ['درخواست شمع سفارشی:', ...lines, `${c.giftPackaging.label}: ${gift ? 'بله' : 'خیر'}`, `متن روی شمع: ${text || '—'}`, `تعداد: ${faNum(qty)}`, `توضیحات: ${notes || '—'}`, ...(est !== null ? [`قیمت تخمینی: ${money(est, s.currency)}`] : [])].join('\n');
        $('#sum', root)!.textContent = summary;
        $('#est', root)!.textContent = est !== null ? `قیمت تخمینی: ${money(est, s.currency)} — قیمت نهایی در تلگرام تأیید می‌شود.` : 'قیمت نهایی در تلگرام اعلام می‌شود.';
        return summary;
      };
      form.addEventListener('input', build, { signal });
      form.addEventListener('submit', (e) => e.preventDefault(), { signal });
      $<HTMLInputElement>('input[type=file]', root)!.addEventListener('change', (e) => {
        const i = e.target as HTMLInputElement;
        const f = i.files?.[0];
        const pv = $<HTMLImageElement>('#pv', root)!;
        if (preview) URL.revokeObjectURL(preview);
        preview = '';
        pv.hidden = true;
        if (!f) return;
        if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > MAX_IMG) { i.value = ''; return toast('فقط تصویر JPG، PNG یا WebP تا ۵ مگابایت.'); }
        preview = URL.createObjectURL(f);
        pv.src = preview; pv.hidden = false;
      }, { signal });
      signal.addEventListener('abort', () => preview && URL.revokeObjectURL(preview));
      $('#tg', root)!.addEventListener('click', () => void sendViaTelegram(build(), s), { signal });
      $('#copy', root)!.addEventListener('click', () => void copyText(build()).then((ok) => toast(ok ? 'خلاصه کپی شد.' : 'کپی انجام نشد.')), { signal });
      build();
    },
  };
};
