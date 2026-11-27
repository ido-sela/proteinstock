// PostgreSQL connection shared by all API functions.
// DATABASE_URL: any PostgreSQL connection string (Neon, Vercel Postgres, RDS, self-hosted).
import pg from 'pg';

pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric -> number (prices are small)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint ids -> number

let pool;
export function db() {
  if (!process.env.DATABASE_URL) {
    const e = new Error('DATABASE_URL is not set'); e.code = 'not_configured'; throw e;
  }
  if (!pool) {
    const url = process.env.DATABASE_URL;
    const local = /@(localhost|127\.0\.0\.1)|host=\/|sslmode=disable/.test(url);
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000, ssl: local ? false : { rejectUnauthorized: false } });
  }
  return pool;
}

export const q = async (text, params = []) => (await db().query(text, params)).rows;
export const one = async (text, params = []) => (await q(text, params))[0] ?? null;

export async function tx(fn) {
  const c = await db().connect();
  try {
    await c.query('begin');
    const out = await fn((text, params = []) => c.query(text, params).then((r) => r.rows));
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// The site switches to this database only after the data was copied and someone ran "go live" (/api/setup, action golive):
// until then every endpoint answers 503 and the pages keep using the old Supabase project.
let liveCache = { v: false, at: 0 };
export async function isLive() {
  if (!process.env.DATABASE_URL) return false;
  if (Date.now() - liveCache.at < 20000) return liveCache.v;
  let v = false;
  try {
    if ((await one(`select to_regclass('public.integrations') is not null ok`))?.ok) v = !!(await one(`select 1 from integrations where key = 'db_live'`));
  } catch (e) { console.error('isLive', e.message); }
  liveCache = { v, at: Date.now() };
  return v;
}
