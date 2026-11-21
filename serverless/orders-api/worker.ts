/**
 * Order intake (Cloudflare Worker, no dependencies).
 *
 * The public storefront cannot hold a GitHub token, so customers POST orders here. This service:
 *  - accepts requests only from ALLOWED_ORIGIN, with size limits, a honeypot and a best-effort rate limit
 *  - re-validates everything and takes names/prices from the PRIVATE repo's products.json (never from the client)
 *  - writes one new file per order to the private repo: orders/YYYY-MM/<id>.json (no shared file => no write conflicts)
 * It never reads or returns other orders or customer data. The repo token exists only as a Worker secret.
 */
import { buildOrder, newOrderId } from '../../src/shared/order';
import type { Product, Settings } from '../../src/shared/types';

interface Env {
  GITHUB_REPO: string; // owner/private-data-repo
  GITHUB_REPO_TOKEN: string; // secret: fine-grained PAT, Contents read/write on the private repo only
  ALLOWED_ORIGIN: string; // https://USERNAME.github.io  (no path, no trailing slash)
  BRANCH?: string;
}

const MAX_BODY = 20_000;
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>(); // best effort per isolate; add a Cloudflare rate-limit rule too
let cache: { at: number; products: Product[]; settings: Settings } | null = null;

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const withCors = (env: Env, res: Response) => {
  res.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
  res.headers.set('Vary', 'Origin');
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
};
class HttpError extends Error { constructor(readonly status: number, m: string, readonly details?: string[]) { super(m); } }

async function gh(env: Env, path: string, init: RequestInit = {}, raw = false): Promise<Response> {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_REPO_TOKEN}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'candle-orders-intake',
    },
  });
}
async function catalog(env: Env) {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const branch = encodeURIComponent(env.BRANCH ?? 'main');
  const [p, s] = await Promise.all([gh(env, `/contents/data/products.json?ref=${branch}`, {}, true), gh(env, `/contents/data/settings.json?ref=${branch}`, {}, true)]);
  if (!p.ok || !s.ok) throw new HttpError(502, 'سرویس موقتاً در دسترس نیست.');
  cache = { at: Date.now(), products: (await p.json()) as Product[], settings: (await s.json()) as Settings };
  return cache;
}
const utf8b64 = (t: string) => { let b = ''; new TextEncoder().encode(t).forEach((c) => { b += String.fromCharCode(c); }); return btoa(b); };

async function createOrder(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('Origin') !== env.ALLOWED_ORIGIN) throw new HttpError(403, 'مبدأ درخواست مجاز نیست.');
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) throw new HttpError(429, 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.');
  hits.set(ip, [...recent, now]);

  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) throw new HttpError(413, 'درخواست بزرگ است.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'درخواست بزرگ است.');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new HttpError(400, 'JSON نامعتبر است.'); }

  const { products, settings } = await catalog(env);
  if (settings.orders && !settings.orders.enabled) throw new HttpError(403, 'ثبت سفارش فعلاً غیرفعال است.');
  const requireAddress = settings.orders?.requireAddress ?? false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const id = newOrderId(now + attempt, crypto.getRandomValues(new Uint8Array(6)));
    const iso = new Date(now).toISOString();
    const { order, errors } = buildOrder(input, products, { id, now: iso, currency: settings.currency, requireAddress });
    if (!order) throw new HttpError(422, 'اطلاعات سفارش نامعتبر است.', errors);
    const path = `orders/${iso.slice(0, 7)}/${id}.json`;
    const r = await gh(env, `/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `order: ${id}`, content: utf8b64(JSON.stringify(order, null, 2) + '\n'), branch: env.BRANCH ?? 'main' }) });
    if (r.status === 201 || r.status === 200) return json({ order }, 201);
    if (r.status !== 422 && r.status !== 409) throw new HttpError(502, 'ذخیره سفارش انجام نشد؛ دوباره تلاش کنید.');
  }
  throw new HttpError(502, 'ذخیره سفارش انجام نشد؛ دوباره تلاش کنید.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return withCors(env, new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } }));
    }
    try {
      if (req.method === 'GET' && url.pathname === '/health') return withCors(env, json({ ok: true }));
      if (req.method === 'POST' && url.pathname === '/orders') return withCors(env, await createOrder(req, env));
      throw new HttpError(404, 'پیدا نشد.');
    } catch (e) {
      if (e instanceof HttpError) return withCors(env, json({ error: e.message, details: e.details }, e.status));
      console.error('unhandled error'); // never log request bodies: they contain customer data
      return withCors(env, json({ error: 'خطای داخلی سرویس.' }, 500));
    }
  },
};
