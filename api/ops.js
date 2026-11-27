// Server functions that ran on Supabase (Edge Functions + database functions called from the browser), in one Vercel function
// (rewrites in vercel.json send each address here with ?fn=):
//   /api/rpc/<name>      database functions (ps_*, admin_report ...) with the caller's session, like Supabase's /rest/v1/rpc
//   /api/order-webhook   back office: test / resend / preview of the stock-system webhook
//   /api/passkey         Face ID / Touch ID sign-in for the admin (WebAuthn)
//   /api/dns-admin       DNS records of proteinstock.co.il (Cloudflare)          env CLOUDFLARE_API_TOKEN
//   /api/v1/...          store API for external systems (API keys)
// Until DATABASE_URL is set, /api/rpc and /api/v1 pass the request on to the old Supabase project, so the shop keeps working during the move.
import { q, one, db } from './_lib/db.js';
import { json, readJson } from './_lib/http.js';
import { adminEmail, customerEmail, setSession, sha256 } from './_lib/auth.js';
import { cfg, orderPayload, deliver } from './_lib/order-webhook.js';

const SB = { url: 'https://yplzliqpohqehypllxdq.supabase.co', key: 'sb_publishable_Gcr_7r00CovbMZj-tJin8g_Jp8B1JcB' };   // public key only
const live = () => !!process.env.DATABASE_URL;
// Which function and arguments: from the address itself (/api/rpc/<name>, /api/v1/<path>), or from the rewrite's ?fn=&name=&path=.
function route(req) {
  const u = new URL(req.url, 'http://x'), qy = req.query || {};
  const get = (k) => (qy[k] != null ? (Array.isArray(qy[k]) ? qy[k].join('/') : String(qy[k])) : u.searchParams.get(k));
  const r = { fn: get('fn'), name: get('name'), path: get('path') || '', sp: u.searchParams };
  const m = u.pathname.match(/^\/api\/(?:rpc\/([a-z_]+)|(order-webhook|passkey|dns-admin)|v1(?:\/(.*))?)\/?$/);
  if (m) { if (m[1]) { r.fn = 'rpc'; r.name = m[1]; } else if (m[2]) r.fn = m[2]; else { r.fn = 'store'; r.path = m[3] || ''; } }
  return r;
}

/* ---------------- /api/rpc/<name> ---------------- */
// who may call each function, and its arguments with their SQL types. The functions check admin rights themselves too (is_admin()).
const RPC = {
  ps_save_lead: { who: 'public', args: { p: 'jsonb' } },
  ps_subscribe: { who: 'public', args: { p_email: 'text', p_source: 'text' } },
  ps_save_checkout: { who: 'public', args: { p: 'jsonb' } },
  ps_order_public: { who: 'public', args: { p_number: 'text' } },
  coupon_check: { who: 'public', args: { p_code: 'text' } },
  ps_my_account: { who: 'customer', args: {} },
  admin_report: { who: 'admin', args: { p: 'jsonb' } },
  admin_abandoned: { who: 'admin', args: { p: 'jsonb' } },
  ps_admins: { who: 'admin', args: {} },
  ps_admin_add: { who: 'admin', args: { p_email: 'text' } },
  ps_admin_remove: { who: 'admin', args: { p_email: 'text' } },
  ps_api_keys: { who: 'admin', args: {} },
  ps_api_key_create: { who: 'admin', args: { p_name: 'text', p_scopes: 'text[]' } },
  ps_api_key_revoke: { who: 'admin', args: { p_id: 'uuid' } },
  ps_webhook_get: { who: 'admin', args: {} },
  ps_webhook_set: { who: 'admin', args: { p: 'jsonb' } },
  ps_customer_accounts: { who: 'admin', args: {} },
};

async function rpc(req, res) {
  const name = String(route(req).name || '');
  const fn = RPC[name];
  if (!fn) return json(res, { message: 'unknown function', code: 'PGRST202' }, 404);
  const body = await readJson(req, 50000);
  if (!live()) {   // before the move: the old project answers (public functions only; the rest already talk to it directly)
    if (fn.who !== 'public') return json(res, { error: 'not_configured' }, 503);
    const r = await fetch(`${SB.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    res.statusCode = r.status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    return res.end(await r.text());
  }
  let email = '';
  if (fn.who === 'admin') { email = await adminEmail(req); if (!email) return json(res, { message: 'unauthorized', code: '42501' }, 401); }
  if (fn.who === 'customer') email = customerEmail(req) || '';
  const names = Object.keys(fn.args).filter((a) => body[a] !== undefined);
  const vals = names.map((a) => (fn.args[a] === 'jsonb' ? JSON.stringify(body[a]) : body[a]));
  const call = `select public.${name}(${names.map((a, i) => `${a} => $${i + 1}::${fn.args[a]}`).join(', ')}) as r`;
  const c = await db().connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(email ? { email, role: 'authenticated' } : { role: 'anon' })]);
    const out = await c.query(call, vals);
    await c.query('commit');
    return json(res, out.rows[0]?.r ?? null);
  } catch (e) {
    await c.query('rollback').catch(() => {});
    if (e.code === '42501') return json(res, { message: 'unauthorized', code: e.code }, 401);
    if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return json(res, { message: e.message, code: e.code }, 400);
    throw e;
  } finally { c.release(); }
}

/* ---------------- /api/order-webhook (admins) ---------------- */
async function orderWebhook(req, res) {
  const email = await adminEmail(req);
  if (!email) return json(res, { error: 'unauthorized' }, 401);
  const b = await readJson(req, 5000);
  const lastPaid = async () => (await one(`select number from orders where status = 'paid' order by created_at desc limit 1`))?.number || '';
  if (b.action === 'test' || b.action === 'resend') {
    const number = String(b.order_number || '') || await lastPaid();
    const test = b.action === 'test';
    const p = number ? await orderPayload({ number }, test) : null;
    if (!p) return json(res, { error: 'not_found' }, 404);
    return json(res, await deliver(p, test));
  }
  if (b.action === 'preview') {
    const number = await lastPaid();
    return json(res, { order: number ? await orderPayload({ number }, true) : null });
  }
  return json(res, { error: 'unknown_action' }, 400);
}

/* ---------------- /api/passkey ---------------- */
const RP_ID = 'proteinstock.co.il';
const ORIGINS = ['https://proteinstock.co.il', 'https://www.proteinstock.co.il'];
async function passkey(req, res) {
  const W = await import('@simplewebauthn/server');
  const { isoBase64URL } = await import('@simplewebauthn/server/helpers');
  const b = await readJson(req, 50000);
  const origin = req.headers.origin;
  const expectedOrigin = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  const take = async (id, kind) => one(`delete from webauthn_challenges where id::text = $1 and kind = $2 and created_at > now() - interval '5 minutes' returning challenge, email`, [String(id || ''), kind]);
  await q(`delete from webauthn_challenges where created_at < now() - interval '10 minutes'`);

  if (b.action === 'register-options') {
    const email = await adminEmail(req); if (!email) return json(res, { error: 'unauthorized' }, 401);
    const mine = await q('select credential_id, transports from admin_passkeys where email = $1', [email]);
    const opts = await W.generateRegistrationOptions({
      rpName: 'פרוטאין סטוק — ניהול', rpID: RP_ID, userName: email, userDisplayName: email,
      userID: new TextEncoder().encode(email), attestationType: 'none',
      excludeCredentials: mine.map((c) => ({ id: c.credential_id, transports: c.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
    });
    const ch = await one(`insert into webauthn_challenges (challenge, kind, email) values ($1, 'register', $2) returning id`, [opts.challenge, email]);
    return json(res, { options: opts, challengeId: ch.id });
  }
  if (b.action === 'register-verify') {
    const email = await adminEmail(req); if (!email) return json(res, { error: 'unauthorized' }, 401);
    const ch = await take(b.challengeId, 'register');
    if (!ch || ch.email !== email) return json(res, { error: 'challenge_expired' }, 400);
    const v = await W.verifyRegistrationResponse({ response: b.response, expectedChallenge: ch.challenge, expectedOrigin, expectedRPID: RP_ID, requireUserVerification: true });
    if (!v.verified || !v.registrationInfo) return json(res, { error: 'not_verified' }, 400);
    const info = v.registrationInfo;
    await q(`insert into admin_passkeys (email, credential_id, public_key, counter, transports, device_name) values ($1,$2,$3,$4,$5,$6)`,
      [email, info.credentialID, isoBase64URL.fromBuffer(info.credentialPublicKey), info.counter, b.response?.response?.transports || [], String(b.deviceName || '').slice(0, 60) || null]);
    return json(res, { ok: true });
  }
  if (b.action === 'login-options') {
    const opts = await W.generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required' });
    const ch = await one(`insert into webauthn_challenges (challenge, kind) values ($1, 'login') returning id`, [opts.challenge]);
    return json(res, { options: opts, challengeId: ch.id });
  }
  if (b.action === 'login-verify') {
    const ch = await take(b.challengeId, 'login');
    if (!ch) return json(res, { error: 'challenge_expired' }, 400);
    const pk = await one('select * from admin_passkeys where credential_id = $1', [String(b.response?.id || '')]);
    if (!pk) return json(res, { error: 'unknown_device' }, 400);
    if (!(await one('select email from admins where email = $1', [pk.email]))) return json(res, { error: 'not_admin' }, 403);
    const v = await W.verifyAuthenticationResponse({ response: b.response, expectedChallenge: ch.challenge, expectedOrigin, expectedRPID: RP_ID, requireUserVerification: true,
      authenticator: { credentialID: pk.credential_id, credentialPublicKey: isoBase64URL.toBuffer(pk.public_key), counter: Number(pk.counter), transports: pk.transports } });
    if (!v.verified) return json(res, { error: 'not_verified' }, 400);
    await q('update admin_passkeys set counter = $1, last_used_at = now() where id = $2', [v.authenticationInfo.newCounter, pk.id]);
    await q(`insert into auth.users (email, last_sign_in_at) values ($1, now()) on conflict (email) do update set last_sign_in_at = now()`, [pk.email]);
    setSession(res, pk.email);
    return json(res, { ok: true, email: pk.email, session: { user: { id: pk.email, email: pk.email } } });
  }
  if (b.action === 'list' || b.action === 'remove') {
    const email = await adminEmail(req); if (!email) return json(res, { error: 'unauthorized' }, 401);
    if (b.action === 'remove') await q('delete from admin_passkeys where id::text = $1 and email = $2', [String(b.id || ''), email]);
    return json(res, { devices: await q('select id, device_name, created_at, last_used_at from admin_passkeys where email = $1 order by created_at', [email]) });
  }
  return json(res, { error: 'bad_action' }, 400);
}

/* ---------------- /api/dns-admin ---------------- */
const ZONE_NAME = 'proteinstock.co.il';
const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA', 'SRV'];
// protected: the website (@, www), mail (MX, SPF, DKIM, DMARC) and domain verifications can be seen but not changed here
function isProtected(r) {
  const name = String(r.name || '').toLowerCase();
  const sub = name === ZONE_NAME ? '@' : name.replace('.' + ZONE_NAME, '');
  if (sub === '@' && ['A', 'AAAA', 'CNAME', 'MX'].includes(r.type)) return 'האתר והמייל';
  if (sub === 'www') return 'האתר';
  if (r.type === 'MX') return 'המייל';
  if (r.type === 'TXT' && (sub === '@' || sub === '_dmarc' || /_domainkey$/.test(sub))) return 'אבטחת המייל';
  if (/_domainkey$/.test(sub)) return 'אבטחת המייל';
  if (/^_zappy|^_vercel|^_acme/.test(sub)) return 'אימות דומיין';
  return '';
}
async function cf(path, init = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw Object.assign(new Error('not_configured'), { code: 'dns_not_configured' });
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw Object.assign(new Error((j.errors || []).map((x) => x.message).join('; ') || 'cloudflare_' + r.status), { code: r.status === 403 || r.status === 401 ? 'token_forbidden' : 'cloudflare_error' });
  return j;
}
let zoneId = '';
const zone = async () => {
  if (zoneId) return zoneId;
  const j = await cf('/zones?name=' + ZONE_NAME);
  if (!j.result?.length) throw Object.assign(new Error('zone_not_found'), { code: 'zone_not_found' });
  return (zoneId = j.result[0].id);
};
const view = (r) => ({ id: r.id, type: r.type, name: r.name === ZONE_NAME ? '@' : String(r.name).replace('.' + ZONE_NAME, ''), content: r.content, proxied: !!r.proxied, ttl: r.ttl, priority: r.priority ?? null, comment: r.comment || '', locked: isProtected(r) });
function clean(b) {
  const type = String(b.type || '').toUpperCase();
  if (!DNS_TYPES.includes(type)) return { error: 'bad_type' };
  let name = String(b.name || '').trim().toLowerCase().replace(/\.$/, '');
  if (name.endsWith('.' + ZONE_NAME)) name = name.slice(0, -(ZONE_NAME.length + 1));
  if (name === ZONE_NAME || name === '') name = '@';
  if (name !== '@' && !/^[a-z0-9_]([a-z0-9_.-]{0,61}[a-z0-9_])?$/.test(name)) return { error: 'bad_name' };
  const content = String(b.content || '').trim();
  if (!content || content.length > 2048) return { error: 'bad_content' };
  if (type === 'A' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(content)) return { error: 'bad_ip' };
  if (type === 'AAAA' && !/^[0-9a-f:]+$/i.test(content)) return { error: 'bad_ip' };
  const out = { type, name: name === '@' ? ZONE_NAME : name + '.' + ZONE_NAME, content, ttl: 1, proxied: ['A', 'AAAA', 'CNAME'].includes(type) ? !!b.proxied : false, comment: String(b.comment || '').slice(0, 100) };
  if (type === 'MX') { const p = Number(b.priority); out.priority = Number.isInteger(p) && p >= 0 && p <= 65535 ? p : 10; }
  return { rec: out };
}
async function dnsAdmin(req, res) {
  const email = await adminEmail(req);
  if (!email) return json(res, { error: 'unauthorized' }, 401);
  const b = await readJson(req, 20000);
  const log = (detail) => q(`insert into admin_log (admin_email, kind, detail) values ($1, 'change', $2::jsonb)`, [email, JSON.stringify(detail)]);
  try {
    const z = await zone();
    const list = async () => ((await cf(`/zones/${z}/dns_records?per_page=200`)).result || []).map(view).sort((a, c) => (a.locked ? 1 : 0) - (c.locked ? 1 : 0) || a.name.localeCompare(c.name));
    if (b.action === 'list') return json(res, { zone: ZONE_NAME, records: await list() });
    if (b.action === 'create') {
      const c = clean(b.record || {}); if (c.error) return json(res, { error: c.error }, 400);
      if (isProtected(c.rec)) return json(res, { error: 'protected', why: isProtected(c.rec) }, 400);
      await cf(`/zones/${z}/dns_records`, { method: 'POST', body: JSON.stringify(c.rec) });
      await log({ tool: 'dns_create', record: c.rec });
      return json(res, { ok: true, records: await list() });
    }
    if (b.action === 'update' || b.action === 'delete') {
      const id = encodeURIComponent(String(b.id || ''));
      const cur = (await cf(`/zones/${z}/dns_records/${id}`)).result;
      if (isProtected(cur)) return json(res, { error: 'protected', why: isProtected(cur) }, 400);
      if (b.action === 'delete') {
        await cf(`/zones/${z}/dns_records/${id}`, { method: 'DELETE' });
        await log({ tool: 'dns_delete', before: view(cur) });
        return json(res, { ok: true, records: await list() });
      }
      const c = clean(b.record || {}); if (c.error) return json(res, { error: c.error }, 400);
      if (isProtected(c.rec)) return json(res, { error: 'protected', why: isProtected(c.rec) }, 400);
      await cf(`/zones/${z}/dns_records/${id}`, { method: 'PUT', body: JSON.stringify(c.rec) });
      await log({ tool: 'dns_update', before: view(cur), after: c.rec });
      return json(res, { ok: true, records: await list() });
    }
    return json(res, { error: 'unknown_action' }, 400);
  } catch (e) {
    if (e.code === 'not_configured') throw e;
    return json(res, { error: e.code === 'dns_not_configured' ? 'not_configured' : e.code || 'error', detail: String(e.message || '').slice(0, 300) }, e.code === 'dns_not_configured' ? 503 : 502);
  }
}

/* ---------------- /api/v1 (store API for external systems) ---------------- */
const ORDER_STATUS = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];
const FULFILL = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
const P_COLS = 'id,sku,title,vendor,category,price,old_price,quantity,low_stock_threshold,out_of_stock,status,image,updated_at';
const out = (res, body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*'); res.end(JSON.stringify(body, null, 2)); };
const err = (res, status, code, message) => out(res, { error: { code, message } }, status);
const num = (v) => (v == null ? v : Number(v));
function orderJson(o, items) {
  return {
    number: o.number, created_at: o.created_at, source: o.source,
    payment_status: o.status, fulfillment_status: o.fulfillment,
    customer: { name: o.customer_name, phone: o.phone, email: o.email },
    delivery: { method: o.delivery, shipping_method: o.shipping_method, address: o.delivery === 'pickup' ? null : o.address, tracking_number: o.tracking_number, notes: o.notes },
    totals: { currency: o.currency, subtotal: num(o.subtotal), discount: num(o.discount), coupon_code: o.coupon_code, shipping: num(o.shipping), total: num(o.total) },
    payment: { provider: o.payment_provider, reference: o.payment_ref, paid_at: o.paid_at },
    items: items.map((i) => ({ product_id: i.product_id, sku: i.sku ?? null, title: i.title, quantity: i.qty, unit_price: num(i.unit_price), line_total: num(i.line_total) })),
  };
}
async function withItems(orders) {
  if (!orders.length) return [];
  const items = await q(`select i.order_id, i.product_id, i.title, i.qty, i.unit_price, i.line_total, p.sku from order_items i left join products p on p.id = i.product_id
    where i.order_id = any($1::uuid[]) order by i.id`, [orders.map((o) => o.id)]);
  return orders.map((o) => orderJson(o, items.filter((i) => i.order_id === o.id)));
}
const productJson = (p) => ({ id: p.id, sku: p.sku, title: p.title, brand: p.vendor, category: p.category, price: num(p.price), compare_at_price: num(p.old_price) || null,
  stock: { tracked: p.quantity != null, quantity: p.quantity, low_stock_threshold: p.low_stock_threshold, in_stock: !p.out_of_stock },
  status: p.status, image: p.image ? (/^https?:/.test(p.image) ? p.image : 'https://proteinstock.co.il/' + p.image) : null, updated_at: p.updated_at });
async function findProduct(ref) {
  const r = decodeURIComponent(ref).trim();
  const p = await one(`select ${P_COLS} from products where id = $1`, [r]);
  if (p) return { p };
  // barcode: also match with / without leading zeros (US barcodes are often written without the leading 0)
  const bare = r.replace(/^0+(?=\d)/, '');
  const rows = await q(`select ${P_COLS} from products where sku = any($1::text[]) limit 3`, [[...new Set([r, bare, '0' + bare, '00' + bare])]]);
  if (rows.length > 1) return { ambiguous: true };
  return { p: rows[0] };
}
async function setStock(p, body) {
  const sets = [], vals = [];
  if (body.quantity !== undefined || body.delta !== undefined) {
    const qty = body.quantity !== undefined ? Number(body.quantity) : (p.quantity ?? 0) + Number(body.delta);
    if (!Number.isInteger(qty) || qty < 0 || qty > 1000000) return { error: 'quantity must be a whole number, 0 or more' };
    vals.push(qty); sets.push(`quantity = $${vals.length}`, `out_of_stock = $${vals.length} <= 0`);
  }
  if (body.low_stock_threshold !== undefined) {
    const t = body.low_stock_threshold === null ? null : Number(body.low_stock_threshold);
    if (t !== null && (!Number.isInteger(t) || t < 0)) return { error: 'low_stock_threshold must be a whole number, 0 or more, or null' };
    vals.push(t); sets.push(`low_stock_threshold = $${vals.length}`);
  }
  if (!sets.length) return { error: 'send quantity, delta or low_stock_threshold' };
  vals.push(p.id);
  const row = await one(`update products set ${sets.join(', ')} where id = $${vals.length} returning ${P_COLS}`, vals);
  return { product: productJson(row) };
}
async function store(req, res) {
  const { path, sp: qsIn } = route(req);
  if (!live()) {   // before the move: the old Supabase function answers
    const qs = new URLSearchParams(qsIn); qs.delete('fn'); qs.delete('path');
    const body = ['POST', 'PATCH'].includes(req.method) ? JSON.stringify(await readJson(req, 300000)) : undefined;
    const r = await fetch(`${SB.url}/functions/v1/store-api/${path}${qs.toString() ? '?' + qs : ''}`, { method: req.method,
      headers: { 'Content-Type': 'application/json', ...(req.headers['x-api-key'] ? { 'x-api-key': req.headers['x-api-key'] } : {}), ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) }, body });
    res.statusCode = r.status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    return res.end(await r.text());
  }
  const parts = path.split('/').filter(Boolean);
  const key = String(req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')).trim();
  if (!key) return err(res, 401, 'missing_key', 'Send your API key in the x-api-key header.');
  const k = await one('select id, scopes, revoked_at from api_keys where key_hash = $1', [sha256(key)]);
  if (!k || k.revoked_at) return err(res, 401, 'invalid_key', 'The API key is not valid or was revoked.');
  await q('update api_keys set last_used_at = now() where id = $1', [k.id]).catch(() => {});
  const can = (s) => (k.scopes || []).includes(s);
  const sp = qsIn;

  if (!parts.length) return out(res, { api: 'Protein Stock store API', version: 1, scopes: k.scopes,
    endpoints: ['GET /orders', 'GET /orders?phone=0501234567', 'GET /orders/{number}', 'PATCH /orders/{number}', 'GET /products', 'GET /products/{id|sku}', 'PATCH /products/{id|sku}', 'POST /stock'] });

  if (parts[0] === 'orders' && req.method === 'GET') {
    if (!can('orders:read')) return err(res, 403, 'forbidden', 'This key cannot read orders.');
    if (parts[1]) {
      const o = await one('select * from orders where number = $1', [decodeURIComponent(parts[1]).toUpperCase()]);
      if (!o) return err(res, 404, 'not_found', 'No order with this number.');
      return out(res, { order: (await withItems([o]))[0] });
    }
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 100, 1), 500);
    const page = Math.max(Number(sp.get('page')) || 0, 0);
    const ph = sp.get('phone');
    const where = [], vals = [];
    const add = (sql, v) => { vals.push(v); where.push(sql.replace('$?', '$' + vals.length)); };
    if (ph !== null) {
      const p9 = String(ph).replace(/\D/g, '').slice(-9);
      if (p9.length < 9) return err(res, 400, 'bad_request', 'phone must have at least 9 digits');
      add('phone9 = $?', p9);
    }
    const bad = (s) => s && isNaN(Date.parse(s));
    const since = sp.get('since'), until = sp.get('until'), st = sp.get('status'), ful = sp.get('fulfillment_status'), upd = sp.get('updated_since');
    if (bad(since) || bad(until) || bad(upd)) return err(res, 400, 'bad_request', 'dates must be ISO 8601');
    if (since) add('created_at >= $?', since);
    if (until) add('created_at <= $?', until);
    if (st) { const l = st.split(',').filter((s) => ORDER_STATUS.includes(s)); if (l.length) add('status = any($?::text[])', l); }
    if (ful) { const l = ful.split(',').filter((s) => FULFILL.includes(s)); if (l.length) add('fulfillment = any($?::text[])', l); }
    if (upd) { vals.push(upd); where.push(`(created_at >= $${vals.length} or paid_at >= $${vals.length})`); }
    const w = where.length ? ' where ' + where.join(' and ') : '';
    const total = (await one(`select count(*)::int n from orders${w}`, vals)).n;
    const rows = await q(`select * from orders${w} order by created_at ${ph !== null ? 'desc' : 'asc'} limit ${limit} offset ${page * limit}`, vals);
    return out(res, { orders: await withItems(rows), page, limit, total });
  }

  // PATCH /orders/{number}: tracking number and shipping status (e.g. when the parcel is handed to the courier)
  if (parts[0] === 'orders' && parts[1] && req.method === 'PATCH') {
    if (!can('orders:write')) return err(res, 403, 'forbidden', 'This key cannot update orders.');
    const number = decodeURIComponent(parts[1]).toUpperCase();
    const body = await readJson(req, 20000);
    const sets = [], vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    let tracking;
    if (body.tracking_number !== undefined) {
      tracking = body.tracking_number === null ? null : String(body.tracking_number).trim();
      if (tracking !== null && (tracking.length < 3 || tracking.length > 80)) return err(res, 400, 'bad_request', 'tracking_number must be 3-80 characters, or null');
      set('tracking_number', tracking);
    }
    if (body.shipping_method !== undefined) set('shipping_method', body.shipping_method === null ? null : String(body.shipping_method).slice(0, 80));
    if (body.fulfillment_status !== undefined) {
      if (!FULFILL.includes(body.fulfillment_status)) return err(res, 400, 'bad_request', 'fulfillment_status must be one of ' + FULFILL.join(', '));
      set('fulfillment', body.fulfillment_status);
    } else if (tracking) set('fulfillment', 'shipped');   // a tracking number means it was handed to the courier
    if (!sets.length) return err(res, 400, 'bad_request', 'send tracking_number, fulfillment_status or shipping_method');
    vals.push(number);
    const rows = await q(`update orders set ${sets.join(', ')} where number = $${vals.length} returning *`, vals);
    if (!rows.length) return err(res, 404, 'not_found', 'No order with this number.');
    return out(res, { order: (await withItems(rows))[0] });
  }

  if (parts[0] === 'products' && req.method === 'GET') {
    if (!can('products:read')) return err(res, 403, 'forbidden', 'This key cannot read products.');
    if (parts[1]) {
      const r = await findProduct(parts[1]);
      if (r.ambiguous) return err(res, 409, 'ambiguous_sku', 'Several products share this barcode; use the product id.');
      if (!r.p) return err(res, 404, 'not_found', 'No product with this id or barcode.');
      return out(res, { product: productJson(r.p) });
    }
    const upd = sp.get('updated_since');
    if (upd && isNaN(Date.parse(upd))) return err(res, 400, 'bad_request', 'dates must be ISO 8601');
    const rows = await q(`select ${P_COLS} from products where status <> 'archived'${upd ? ' and updated_at >= $1' : ''} order by title`, upd ? [upd] : []);
    return out(res, { products: rows.map(productJson) });
  }

  if (parts[0] === 'products' && parts[1] && req.method === 'PATCH') {
    if (!can('stock:write')) return err(res, 403, 'forbidden', 'This key cannot change stock.');
    const r = await findProduct(parts[1]);
    if (r.ambiguous) return err(res, 409, 'ambiguous_sku', 'Several products share this barcode; use the product id.');
    if (!r.p) return err(res, 404, 'not_found', 'No product with this id or barcode.');
    const s = await setStock(r.p, await readJson(req, 20000));
    return s.error ? err(res, 400, 'bad_request', s.error) : out(res, s);
  }

  if (parts[0] === 'stock' && req.method === 'POST') {
    if (!can('stock:write')) return err(res, 403, 'forbidden', 'This key cannot change stock.');
    const body = await readJson(req, 300000);
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : null;
    if (!items) return err(res, 400, 'bad_request', 'Send { "items": [ { "sku": "...", "quantity": 10 } ] }');
    const results = [];
    for (const it of items) {
      const ref = String(it.id || it.sku || '');
      if (!ref) { results.push({ ok: false, error: 'id or sku required' }); continue; }
      const r = await findProduct(ref);
      if (r.ambiguous) { results.push({ ref, ok: false, error: 'ambiguous barcode, use id' }); continue; }
      if (!r.p) { results.push({ ref, ok: false, error: 'not found' }); continue; }
      const s = await setStock(r.p, it);
      results.push(s.error ? { ref, ok: false, error: s.error } : { ref, ok: true, id: r.p.id, quantity: s.product.stock.quantity });
    }
    return out(res, { updated: results.filter((x) => x.ok).length, results });
  }
  return err(res, 404, 'not_found', 'Unknown endpoint. GET / lists the endpoints.');
}

const ROUTES = { rpc, 'order-webhook': orderWebhook, passkey, 'dns-admin': dnsAdmin, store };
export default async function handler(req, res) {
  const fn = ROUTES[route(req).fn];
  if (!fn) return json(res, { error: 'not_found' }, 404);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'x-api-key, authorization, content-type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS'); return res.end(); }
  if (fn !== store && req.method !== 'POST') return json(res, { error: 'method_not_allowed' }, 405);
  try {
    await fn(req, res);
  } catch (e) {
    if (e?.code === 'not_configured') return json(res, { error: 'not_configured' }, 503);
    if (e?.code === 'too_large') return json(res, { error: 'too_large' }, 413);
    if (e?.code === 'bad_json') return json(res, { error: 'bad_json' }, 400);
    console.error(e);
    return fn === store ? err(res, 500, 'server_error', 'Something went wrong.') : json(res, { error: 'server_error' }, 500);
  }
}
