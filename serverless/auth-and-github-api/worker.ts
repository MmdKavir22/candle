/**
 * Serverless OAuth + GitHub write gateway (Cloudflare Workers, no dependencies).
 *
 * - GitHub OAuth (state + PKCE) with server-side code exchange; the GitHub user token is discarded.
 * - Signed, expiring, HttpOnly session cookie. Admin allowlist re-checked on every request.
 * - Only this service holds the repository token. It validates every payload with the same
 *   validators the admin UI uses, enforces file-SHA concurrency, and only touches data/ and images/.
 */
import { validators } from '../../src/shared/validate';
import type { DataName } from '../../src/shared/types';

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string; // secret
  SESSION_SECRET: string; // secret, >= 32 random chars
  GITHUB_REPO_TOKEN: string; // secret, fine-grained PAT: Contents read/write on this repo only
  GITHUB_REPO: string; // owner/name
  ALLOWED_USERS: string; // comma-separated GitHub logins
  ALLOWED_ORIGIN: string; // e.g. https://user.github.io  (no path, no trailing slash)
  ADMIN_URL: string; // e.g. https://user.github.io/repo/admin/
  BRANCH?: string;
  DATA_DIR?: string; // default public/data
  IMAGE_DIR?: string; // default public/images
}

const SESSION_COOKIE = '__Host-sid';
const OAUTH_COOKIE = '__Host-oauth';
const SESSION_TTL = 8 * 3600;
const NAMES = ['products', 'categories', 'homepage', 'settings'] as const;
const IMG_DIRS = ['products', 'banners', 'categories'];
const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const enc = new TextEncoder();

class HttpError extends Error {
  constructor(readonly status: number, m: string, readonly details?: string[]) { super(m); }
}

/* ---------- crypto helpers ---------- */
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  b.forEach((c) => { s += String.fromCharCode(c); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const rand = (n: number) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const hmacKey = (secret: string, usage: KeyUsage[]) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);

async function signToken(env: Env, payload: object) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.SESSION_SECRET, ['sign']), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}
async function readToken(env: Env, token: string): Promise<{ u: string; exp: number } | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.SESSION_SECRET, ['verify']), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body))) as { u: string; exp: number };
    return typeof p.u === 'string' && p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
const cookie = (req: Request, name: string) => req.headers.get('Cookie')?.split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
const setCookie = (name: string, value: string, maxAge: number, sameSite: 'None' | 'Lax') =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
const allowed = (env: Env, login: string) => env.ALLOWED_USERS.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(login.toLowerCase());

async function sessionUser(req: Request, env: Env): Promise<string> {
  const t = cookie(req, SESSION_COOKIE);
  const p = t ? await readToken(env, t) : null;
  if (!p || !allowed(env, p.u)) throw new HttpError(401, 'نشست معتبر نیست؛ دوباره وارد شوید.');
  return p.u;
}

/* ---------- GitHub API ---------- */
async function gh(env: Env, path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_REPO_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'candle-admin-gateway', ...(init.headers as Record<string, string>) },
  });
}
function ghError(r: Response): HttpError {
  if (r.status === 409 || r.status === 422) return new HttpError(409, 'فایل هم‌زمان تغییر کرده است.');
  if (r.status === 401 || r.status === 403) return new HttpError(502, 'دسترسی سرویس به GitHub کافی نیست (توکن یا مجوزها را بررسی کنید).');
  if (r.status === 404) return new HttpError(404, 'فایل یا مخزن پیدا نشد.');
  return new HttpError(502, `خطای GitHub (${r.status}).`);
}
const branch = (env: Env) => env.BRANCH ?? 'main';
const dataPath = (env: Env, n: string) => `${env.DATA_DIR ?? 'public/data'}/${n}.json`;
const imgRoot = (env: Env) => env.IMAGE_DIR ?? 'public/images';

async function getFile(env: Env, path: string): Promise<{ sha: string; text: string } | null> {
  const r = await gh(env, `/contents/${path}?ref=${encodeURIComponent(branch(env))}`);
  if (r.status === 404) return null;
  if (!r.ok) throw ghError(r);
  const j = (await r.json()) as { sha: string; content: string };
  const bin = atob(j.content.replace(/\n/g, ''));
  return { sha: j.sha, text: new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))) };
}
async function putFile(env: Env, path: string, b64: string, message: string, sha?: string): Promise<string> {
  const r = await gh(env, `/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64, branch: branch(env), ...(sha ? { sha } : {}) }) });
  if (!r.ok) throw ghError(r);
  return ((await r.json()) as { content: { sha: string } }).content.sha;
}
const utf8b64 = (s: string) => { let bin = ''; enc.encode(s).forEach((c) => { bin += String.fromCharCode(c); }); return btoa(bin); };

/* ---------- HTTP helpers ---------- */
function cors(env: Env, req: Request, res: Response) {
  if (req.headers.get('Origin') === env.ALLOWED_ORIGIN) {
    res.headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Vary', 'Origin');
  }
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
}
const json = (d: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...headers } });
async function body<T>(req: Request, max = 3_000_000): Promise<T> {
  if (Number(req.headers.get('Content-Length') ?? 0) > max) throw new HttpError(413, 'درخواست بیش از حد بزرگ است.');
  const t = await req.text();
  if (t.length > max) throw new HttpError(413, 'درخواست بیش از حد بزرگ است.');
  try { return JSON.parse(t) as T; } catch { throw new HttpError(400, 'JSON نامعتبر است.'); }
}
function requireCsrfSafe(env: Env, req: Request) {
  if (req.method === 'GET') return;
  if (req.headers.get('Origin') !== env.ALLOWED_ORIGIN || req.headers.get('X-Requested-With') !== 'admin') throw new HttpError(403, 'درخواست از مبدأ مجاز نیست.');
}

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const a = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (b.length > 12 && a(0, 4) === 'RIFF' && a(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/* ---------- handlers ---------- */
async function login(env: Env, url: URL): Promise<Response> {
  const state = rand(16), verifier = rand(32);
  const challenge = b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  const q = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, state, code_challenge: challenge, code_challenge_method: 'S256', allow_signup: 'false' });
  return new Response(null, { status: 302, headers: { Location: `https://github.com/login/oauth/authorize?${q}`, 'Set-Cookie': setCookie(OAUTH_COOKIE, `${state}.${verifier}`, 600, 'Lax') } });
}

async function callback(env: Env, req: Request, url: URL): Promise<Response> {
  const [state, verifier] = (cookie(req, OAUTH_COOKIE) ?? '').split('.');
  const code = url.searchParams.get('code');
  const clear = setCookie(OAUTH_COOKIE, '', 0, 'Lax');
  if (!state || !verifier || !code || state !== url.searchParams.get('state')) throw new HttpError(400, 'پاسخ OAuth نامعتبر است (state).');
  const tr = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/auth/callback`, code_verifier: verifier }),
  });
  const tok = (await tr.json()) as { access_token?: string };
  if (!tok.access_token) throw new HttpError(400, 'دریافت توکن از GitHub ناموفق بود.');
  const ur = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': 'candle-admin-gateway' } });
  const u = (await ur.json()) as { login?: string };
  // The user token is never stored; it is dropped here. Identity comes from GitHub, not the browser.
  const headers = new Headers({ 'Set-Cookie': clear });
  if (!u.login || !allowed(env, u.login)) {
    headers.set('Location', `${env.ADMIN_URL}#denied`);
    return new Response(null, { status: 302, headers });
  }
  const session = await signToken(env, { u: u.login, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
  headers.append('Set-Cookie', setCookie(SESSION_COOKIE, session, SESSION_TTL, 'None'));
  headers.set('Location', env.ADMIN_URL);
  return new Response(null, { status: 302, headers });
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === 'GET' && p === '/auth/login') return login(env, url);
  if (req.method === 'GET' && p === '/auth/callback') return callback(env, req, url);
  requireCsrfSafe(env, req);
  if (p === '/auth/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESSION_COOKIE, '', 0, 'None') });
  const user = await sessionUser(req, env);
  if (p === '/auth/me') return json({ login: user });

  if (p === '/api/history') {
    const r = await gh(env, `/commits?sha=${encodeURIComponent(branch(env))}&path=${encodeURIComponent(env.DATA_DIR ?? 'public/data')}&per_page=8`);
    if (!r.ok) throw ghError(r);
    const list = (await r.json()) as { commit: { message: string; author: { name: string; date: string } } }[];
    return json({ commits: list.map((c) => ({ message: c.commit.message.split('\n')[0], author: c.commit.author.name, date: c.commit.author.date })) });
  }

  const m = /^\/api\/data\/([a-z]+)$/.exec(p);
  if (m) {
    const name = m[1] as DataName;
    if (!(NAMES as readonly string[]).includes(name)) throw new HttpError(404, 'پیدا نشد.');
    if (req.method === 'GET') {
      const f = await getFile(env, dataPath(env, name));
      if (!f) throw new HttpError(404, 'فایل داده پیدا نشد.');
      return json({ content: JSON.parse(f.text), sha: f.sha });
    }
    if (req.method === 'PUT') {
      const b = await body<{ content: unknown; sha: string }>(req, 600_000);
      if (typeof b.sha !== 'string' || !/^[0-9a-f]{40}$/.test(b.sha)) throw new HttpError(400, 'شناسه نسخه (sha) نامعتبر است.');
      const errs = validators[name](b.content);
      if (errs.length) throw new HttpError(422, 'داده نامعتبر است.', errs);
      const text = JSON.stringify(b.content, null, 2) + '\n';
      if (text.length > 500_000) throw new HttpError(413, 'حجم داده زیاد است.');
      const sha = await putFile(env, dataPath(env, name), utf8b64(text), `admin(${user}): update ${name}.json`, b.sha);
      return json({ sha });
    }
  }

  if (p === '/api/images' && req.method === 'POST') {
    const b = await body<{ dir: string; name: string; contentType: string; data: string }>(req);
    const ext = EXT[b.contentType];
    if (!IMG_DIRS.includes(b.dir) || !ext || typeof b.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(b.name) || typeof b.data !== 'string') throw new HttpError(400, 'مشخصات تصویر نامعتبر است.');
    if (b.data.length > 2_800_000 || !/^[A-Za-z0-9+/]+=*$/.test(b.data)) throw new HttpError(413, 'تصویر نامعتبر یا بزرگ‌تر از ۲ مگابایت است.');
    const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0));
    if (sniff(bytes) !== b.contentType) throw new HttpError(400, 'محتوای فایل با نوع اعلام‌شده مطابقت ندارد.');
    const rel = `images/${b.dir}/${b.name}.${ext}`;
    const full = `${imgRoot(env).replace(/images$/, '')}${rel}`;
    const existing = await getFile(env, full);
    await putFile(env, full, b.data, `admin(${user}): upload ${rel}`, existing?.sha);
    return json({ path: rel });
  }

  if (p === '/api/images' && req.method === 'DELETE') {
    const { path } = await body<{ path: string }>(req, 2000);
    if (typeof path !== 'string' || !/^images\/(products|banners|categories)\/[a-z0-9][a-z0-9-]*\.(webp|jpg|png)$/.test(path)) throw new HttpError(400, 'مسیر نامعتبر است.');
    for (const n of NAMES) {
      const f = await getFile(env, dataPath(env, n));
      if (f?.text.includes(`"${path}"`)) throw new HttpError(409, 'این تصویر هنوز استفاده می‌شود.');
    }
    const full = `${imgRoot(env).replace(/images$/, '')}${path}`;
    const f = await getFile(env, full);
    if (!f) return json({ ok: true });
    const r = await gh(env, `/contents/${full}`, { method: 'DELETE', body: JSON.stringify({ message: `admin(${user}): delete ${path}`, sha: f.sha, branch: branch(env) }) });
    if (!r.ok) throw ghError(r);
    return json({ ok: true });
  }
  throw new HttpError(404, 'پیدا نشد.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return cors(env, req, new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With', 'Access-Control-Max-Age': '600' } }));
    }
    try {
      return cors(env, req, await route(req, env));
    } catch (e) {
      if (e instanceof HttpError) return cors(env, req, json({ error: e.message, details: e.details }, e.status));
      console.error('unhandled', e instanceof Error ? e.message : 'error'); // never log tokens or bodies
      return cors(env, req, json({ error: 'خطای داخلی سرویس.' }, 500));
    }
  },
};
