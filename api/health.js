// Health check: is the database reachable and which services are configured (no secret values are returned).
import { q } from './_lib/db.js';
import { json, handler } from './_lib/http.js';

export default handler(['GET'], async (req, res) => {
  let dbOk = false, products = null;
  try { products = (await q('select count(*)::int n from products'))[0].n; dbOk = true; } catch (e) { /* not ready */ }
  json(res, {
    db: dbOk, products,
    configured: {
      database: !!process.env.DATABASE_URL,
      session_secret: !!(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24),
      email: !!process.env.RESEND_API_KEY,
      payplus: !!(process.env.PAYPLUS_API_KEY && process.env.PAYPLUS_SECRET_KEY),
      ai: !!process.env.ANTHROPIC_API_KEY,
      images: !!process.env.BLOB_READ_WRITE_TOKEN,
    },
  }, dbOk ? 200 : 503);
});
