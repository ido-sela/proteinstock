// Health check: is the database reachable and which services are configured (no secret values are returned).
// ?check=mail asks Brevo whether the key and sender are accepted (sends nothing).
// ?check=payplus also asks PayPlus whether the saved keys are accepted (creates a 1 ILS payment link that nobody pays
// and returns only ok/error, never the link), at most once a minute.
import { q, one, isLive } from './_lib/db.js';
import { json, handler } from './_lib/http.js';
import { getProvider, webhookUrl } from './_lib/payplus.js';
import { checkMail, mailProvider } from './_lib/mail.js';

// mail key check, at most once a minute (calls Brevo)
async function mailCheck() {
  await q('create table if not exists mail_checks (at timestamptz not null default now())');
  if ((await q(`select 1 from mail_checks where at > now() - interval '1 minute'`)).length) return { ok: null, error: 'too_soon' };
  await q('insert into mail_checks default values');
  return checkMail().catch((e) => ({ ok: false, error: String(e.message).slice(0, 100) }));
}

async function checkPayplus() {
  await q('create table if not exists payplus_checks (at timestamptz not null default now())');
  if ((await q(`select 1 from payplus_checks where at > now() - interval '1 minute'`)).length) return { ok: null, error: 'too_soon' };
  await q('insert into payplus_checks default values');
  const settings = (await one(`select value from site_settings where key = 'payment'`))?.value ?? {};
  try {
    await getProvider('payplus').createPayment(
      { number: 'KEYCHECK', total: 1, currency: 'ILS', customer_name: 'בדיקת חיבור', phone: '0500000000', email: null,
        items: [{ title: 'בדיקת חיבור (לא מחויב)', qty: 1, unit_price: 1 }] },
      { returnUrl: process.env.SITE_URL || 'https://proteinstock.co.il', webhookUrl: webhookUrl(process.env.SITE_URL || 'https://proteinstock.co.il'), settings },
    );
    return { ok: true, sandbox: !!settings.sandbox };
  } catch (e) {
    const m = String(e?.message ?? e);
    return { ok: false, error: m.startsWith('payplus_keys_missing') ? 'keys_missing' : m.startsWith('payplus_page_uid_missing') ? 'page_uid_missing' : 'provider_rejected', detail: m.replace(/^payplus_generate_failed: /, '').slice(0, 200) };
  }
}

export default handler(['GET'], async (req, res) => {
  let dbOk = false, products = null;
  try { products = (await q('select count(*)::int n from products'))[0].n; dbOk = true; } catch (e) { /* not ready */ }
  const live = dbOk && await isLive();
  const check = new URL(req.url, 'http://x').searchParams.get('check');
  json(res, {
    db: live, reachable: dbOk, products,
    configured: {
      database: !!process.env.DATABASE_URL,
      session_secret: !!(process.env.SESSION_SECRET || process.env.DATABASE_URL),
      email: mailProvider(),
      payplus: !!(process.env.PAYPLUS_API_KEY && process.env.PAYPLUS_SECRET_KEY),
      ai: !!process.env.ANTHROPIC_API_KEY,
      images: !!process.env.BLOB_READ_WRITE_TOKEN,
      dns: !!process.env.CLOUDFLARE_API_TOKEN,
    },
    ...(check === 'payplus' && dbOk ? { payplus_check: await checkPayplus() } : {}),
    ...(check === 'mail' && dbOk ? { mail_check: await mailCheck() } : {}),
  }, live ? 200 : 503);
}, { beforeLive: true });
