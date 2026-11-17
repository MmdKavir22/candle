const nf = new Intl.NumberFormat('fa-IR');
export const faNum = (n: number) => nf.format(n);
export const toFa = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
export const money = (n: number, cur: string) => `${faNum(n)} ${cur}`;
export const dateFa = (iso: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(iso));
export const onSale = (p: { price: number; discountPrice: number | null }) => p.discountPrice !== null && p.discountPrice < p.price;
export const unitPrice = (p: { price: number; discountPrice: number | null }) => (onSale(p) ? (p.discountPrice as number) : p.price);
export const discountPct = (p: { price: number; discountPrice: number | null }) => (onSale(p) ? Math.round((1 - (p.discountPrice as number) / p.price) * 100) : 0);
/** Resolve a repo-relative asset path against the Vite base (GitHub Pages sub-path safe). */
export const asset = (p: string) => (/^https?:/.test(p) ? p : import.meta.env.BASE_URL + p.replace(/^\//, ''));
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
