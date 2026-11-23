// One-time setup: creates the tables in PostgreSQL and (optionally) copies all data from the old Supabase project.
// Protected by SETUP_TOKEN. Call:  POST /api/setup  with header  x-setup-token: <SETUP_TOKEN>
// To copy data, also set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (remove them afterwards).
// Safe to run more than once: existing rows are kept (on conflict do nothing).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, q } from './_lib/db.js';
import { json, handler } from './_lib/http.js';

const TABLES = [
  ['admins', 'email'],
  ['site_settings', 'key'],
  ['products', 'id'],
  ['coupons', 'code'],
  ['orders', 'id'],
  ['order_items', 'id'],
  ['payment_events', 'id'],
  ['admin_log', 'id'],
];
const JSONB = { site_settings: ['value'], payment_events: ['payload'], admin_log: ['detail'] };
const IDENTITY = ['order_items', 'payment_events', 'admin_log'];

async function fetchAll(base, key, table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/rest/v1/${table}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
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

  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (base && key) {
    for (const [table] of TABLES) {
      const rows = await fetchAll(base.replace(/\/$/, ''), key, table);
      let n = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => (JSONB[table]?.includes(c) ? JSON.stringify(row[c]) : row[c]));
        const ph = cols.map((c, i) => (JSONB[table]?.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`));
        const over = IDENTITY.includes(table) ? ' overriding system value' : '';
        const r = await db().query(`insert into "${table}" (${cols.map((c) => `"${c}"`).join(',')})${over} values (${ph.join(',')}) on conflict do nothing`, vals);
        n += r.rowCount;
      }
      report.copied[table] = `${n}/${rows.length}`;
    }
    for (const t of IDENTITY) {
      await q(`select setval(pg_get_serial_sequence('${t}', 'id'), greatest(coalesce((select max(id) from "${t}"), 0), 1), (select count(*) > 0 from "${t}"))`);
    }
    // Supabase stored settings with the same keys: make sure the copied values win over the defaults.
    const ss = await fetchAll(base.replace(/\/$/, ''), key, 'site_settings');
    for (const s of ss) await q('update site_settings set value = $2::jsonb where key = $1', [s.key, JSON.stringify(s.value)]);
  }

  const counts = {};
  for (const [t] of TABLES) counts[t] = (await q(`select count(*)::int n from "${t}"`))[0].n;
  report.rows = counts;
  return json(res, report);
});
