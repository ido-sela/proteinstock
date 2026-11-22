// Admin-only product image upload to Vercel Blob (replaces Supabase Storage).
// Env: BLOB_READ_WRITE_TOKEN (added automatically when a Blob store is connected to the project).
import { put } from '@vercel/blob';
import { json, handler } from './_lib/http.js';
import { adminEmail } from './_lib/auth.js';

export const config = { api: { bodyParser: false } };
const TYPES = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];

export default handler(['POST'], async (req, res) => {
  if (!(await adminEmail(req))) return json(res, { error: { message: 'unauthorized' } }, 401);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return json(res, { error: { message: 'אחסון התמונות עדיין לא חובר (Vercel Blob).' } }, 503);
  const type = String(req.headers['content-type'] ?? '').split(';')[0];
  if (!TYPES.includes(type)) return json(res, { error: { message: 'סוג קובץ לא נתמך' } }, 400);
  const p = String(new URL(req.url, 'http://x').searchParams.get('path') ?? '').replace(/[^a-zA-Z0-9/_.-]/g, '').replace(/^\/+/, '').slice(0, 160);
  if (!p || p.includes('..')) return json(res, { error: { message: 'bad path' } }, 400);

  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 4_000_000) return json(res, { error: { message: 'הקובץ גדול מדי (עד 4MB)' } }, 413); chunks.push(c); }
  const blob = await put(`product-media/${p}`, Buffer.concat(chunks), { access: 'public', contentType: type, addRandomSuffix: true, cacheControlMaxAge: 31536000 });
  return json(res, { data: { path: p, url: blob.url } });
});
