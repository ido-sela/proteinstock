// Small helpers for Vercel Node functions.
import { isLive } from './db.js';
export const json = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

// Reads the exact request bytes (needed for webhook signatures). Falls back to an already-parsed body.
export async function rawBody(req, limit = 100000) {
  if (req.readableEnded) {
    const b = req.body;
    if (typeof b === 'string') return b;
    if (Buffer.isBuffer(b)) return b.toString('utf8');
    return b && typeof b === 'object' ? JSON.stringify(b) : '';
  }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) { const e = new Error('too_large'); e.code = 'too_large'; throw e; } chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req, limit = 100000) {
  const raw = await rawBody(req, limit);
  if (raw.length > limit) { const e = new Error('too_large'); e.code = 'too_large'; throw e; }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { const e = new Error('bad_json'); e.code = 'bad_json'; throw e; }
}

export const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

export const origin = (req) => {
  const o = req.headers.origin;
  if (o) return o;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${req.headers['x-forwarded-proto'] || 'https'}://${host}` : '';
};

// Wraps a handler: method check + uniform error output. Unless opts.beforeLive, answers 503 until the new database is live.
export const handler = (methods, fn, opts = {}) => async (req, res) => {
  if (!methods.includes(req.method)) return json(res, { error: 'method_not_allowed' }, 405);
  try {
    if (!opts.beforeLive && !(await isLive())) return json(res, { error: 'not_configured' }, 503);
    await fn(req, res);
  } catch (e) {
    if (e?.code === 'not_configured') return json(res, { error: 'not_configured' }, 503);
    if (e?.code === 'too_large') return json(res, { error: 'too_large' }, 413);
    if (e?.code === 'bad_json') return json(res, { error: 'bad_json' }, 400);
    console.error(e);
    return json(res, { error: 'server_error' }, 500);
  }
};
