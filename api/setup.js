// One-time setup: creates the tables in PostgreSQL and (optionally) copies all data from the old Supabase project.
// Protected by SETUP_TOKEN. Call:  POST /api/setup  with header  x-setup-token: <SETUP_TOKEN>
// To copy data, also set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (remove them afterwards).
// Safe to run more than once: existing rows are kept (on conflict do nothing).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, q } from './_lib/db.js';
import { json, handler } from './_lib/http.js';

export const config = { maxDuration: 300 };

// in an order that respects foreign keys (order_items -> orders)
const TABLES = ['admins', 'site_settings', 'integrations', 'products', 'coupons', 'orders', 'order_items', 'payment_events', 'admin_log',
  'leads', 'newsletter_subscribers', 'abandoned_checkouts', 'api_keys', 'admin_passkeys', 'order_webhook_log'];
const JSONB = { site_settings: ['value'], integrations: ['value'], payment_events: ['payload'], admin_log: ['detail'], abandoned_checkouts: ['items'] };
const IDENTITY = ['order_items', 'payment_events', 'admin_log', 'leads', 'newsletter_subscribers', 'order_webhook_log'];   // bigint ids kept as they were
const SKIP = { orders: ['phone9'] };   // generated columns
// product photos that were in Supabase Storage now ship with the site (img/p/g/)
const GALLERY = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/product-media\/gallery\/([A-Za-z0-9._-]+)$/;
const local = (u) => (typeof u === 'string' && GALLERY.test(u) ? 'img/p/g/' + u.match(GALLERY)[1] : u);

// new-style keys (sb_secret_...) go in the apikey header only; old JWT keys also as a bearer token
const H = (key) => (key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` });

async function fetchAll(base, key, table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/rest/v1/${table}?select=*`, {
      headers: { ...H(key), Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new Error(`supabase ${table}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export default handler(['POST'], async (req, res) => {
  const token = process.env.SETUP_TOKEN;
  const got = String(req.headers['x-setup-token'] ?? '');
  if (!token || token.length < 16 || got.length !== token.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token))) {
    return json(res, { error: 'forbidden' }, 403);
  }

  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  await db().query(schema);
  const report = { schema: 'ok', copied: {} };

  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (base && key) {
    // no triggers while copying: rows arrive exactly as they were (no stock changes, no webhooks, no "recovered" carts)
    for (const t of TABLES) await q(`alter table "${t}" disable trigger user`);
    try {
      for (const table of TABLES) {
        const rows = await fetchAll(base, key, table);
        let n = 0;
        for (const row of rows) {
          for (const c of SKIP[table] || []) delete row[c];
          if (table === 'products') { row.image = local(row.image); if (Array.isArray(row.images)) row.images = row.images.map(local); }
          const cols = Object.keys(row);
          const vals = cols.map((c) => (JSONB[table]?.includes(c) ? JSON.stringify(row[c]) : row[c]));
          const ph = cols.map((c, i) => (JSONB[table]?.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
          const over = IDENTITY.includes(table) ? ' overriding system value' : '';
          const r = await db().query(`insert into "${table}" (${cols.map((c) => `"${c}"`).join(',')})${over} values (${ph.join(',')}) on conflict do nothing`, vals);
          n += r.rowCount;
        }
        report.copied[table] = `${n}/${rows.length}`;
      }
    } finally {
      for (const t of TABLES) await q(`alter table "${t}" enable trigger user`);
    }
    for (const t of IDENTITY) {
      await q(`select setval(pg_get_serial_sequence('${t}', 'id'), greatest(coalesce((select max(id) from "${t}"), 0), 1), (select count(*) > 0 from "${t}"))`);
    }
    // Supabase stored settings with the same keys: make sure the copied values win over the defaults.
    for (const s of await fetchAll(base, key, 'site_settings')) await q('update site_settings set value = $2::jsonb where key = $1', [s.key, JSON.stringify(s.value)]);
    for (const s of await fetchAll(base, key, 'integrations')) await q('update integrations set value = $2::jsonb where key = $1', [s.key, JSON.stringify(s.value)]);

    // customer accounts (/account) and admins' last sign-in
    const r = await fetch(`${base}/auth/v1/admin/users?per_page=1000`, { headers: H(key) });
    if (r.ok) {
      const users = (await r.json()).users || [];
      let n = 0;
      for (const u of users) {
        if (!u.email) continue;
        const x = await db().query(`insert into auth.users (id, email, created_at, last_sign_in_at) values ($1, lower($2), $3, $4) on conflict do nothing`, [u.id, u.email, u.created_at, u.last_sign_in_at]);
        n += x.rowCount;
      }
      report.copied['auth.users'] = `${n}/${users.length}`;
    } else report.copied['auth.users'] = 'failed ' + r.status;
  }

  const counts = {};
  for (const t of TABLES) counts[t] = (await q(`select count(*)::int n from "${t}"`))[0].n;
  counts['auth.users'] = (await q('select count(*)::int n from auth.users'))[0].n;
  report.rows = counts;
  return json(res, report);
});
