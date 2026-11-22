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
