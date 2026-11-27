// Admin sessions: a signed, HttpOnly cookie (replaces Supabase Auth).
// SESSION_SECRET: long random string, set in the hosting environment.
import crypto from 'node:crypto';
import { one } from './db.js';

const COOKIE = 'ps_admin';
const DAYS = 30;

const secret = () => {
  // SESSION_SECRET if set; otherwise a key derived from the (secret) database address, so nothing extra has to be configured
  const s = process.env.SESSION_SECRET || (process.env.DATABASE_URL ? crypto.createHash('sha256').update('ps-session|' + process.env.DATABASE_URL).digest('hex') : '');
  if (!s || s.length < 24) { const e = new Error('SESSION_SECRET is not set'); e.code = 'not_configured'; throw e; }
  return s;
};
const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');

export function setSession(res, email) {
  const exp = Date.now() + DAYS * 864e5;
  const v = Buffer.from(JSON.stringify({ e: email, x: exp })).toString('base64url');
  res.setHeader('Set-Cookie', `${COOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function readCookie(req) {
  const raw = String(req.headers.cookie ?? '');
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === COOKIE) return part.slice(i + 1);
  }
  return '';
}

// Returns the admin's email, or null. Checks the signature, expiry and that the email is still an admin.
export async function adminEmail(req) {
  const c = readCookie(req);
  const dot = c.lastIndexOf('.');
  if (dot < 1) return null;
  const v = c.slice(0, dot), sig = c.slice(dot + 1);
  const good = sign(v);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(v, 'base64url').toString('utf8')); } catch { return null; }
  if (!p?.e || !(p.x > Date.now())) return null;
  const row = await one('select email from admins where email = $1', [String(p.e).toLowerCase()]);
  return row ? row.email : null;
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Customer sessions (the /account page): same signed cookie format, separate cookie, no admin rights.
const CCOOKIE = 'ps_cust';
export function setCustomer(res, email) {
  const exp = Date.now() + 90 * 864e5;
  const v = Buffer.from(JSON.stringify({ e: email, x: exp })).toString('base64url');
  res.setHeader('Set-Cookie', `${CCOOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${90 * 86400}`);
}
export function clearCustomer(res) {
  res.setHeader('Set-Cookie', `${CCOOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
export function customerEmail(req) {
  const raw = String(req.headers.cookie ?? '');
  let c = '';
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === CCOOKIE) c = part.slice(i + 1); }
  const dot = c.lastIndexOf('.');
  if (dot < 1) return null;
  const v = c.slice(0, dot), sig = c.slice(dot + 1), good = sign(v);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(v, 'base64url').toString('utf8')); } catch { return null; }
  return p?.e && p.x > Date.now() ? String(p.e).toLowerCase() : null;
}
