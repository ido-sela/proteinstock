// Admin login with a 6-digit code sent by email (replaces Supabase Auth).
// Env: SESSION_SECRET, BREVO_API_KEY (or RESEND_API_KEY), MAIL_FROM (e.g. "פרוטאין סטוק <admin@proteinstock.co.il>").
// POST {action:'send', email} | {action:'verify', email, token} | {action:'logout'};  GET -> current session.
// scope:'customer' (POST body, or ?scope=customer on GET): the same flow for store customers (/account), any email, own cookie.
import crypto from 'node:crypto';
import { q, one } from './_lib/db.js';
import { json, readJson, handler } from './_lib/http.js';
import { sendEmail, mailProvider } from './_lib/mail.js';
import { adminEmail, setSession, clearSession, sha256, setCustomer, clearCustomer, customerEmail } from './_lib/auth.js';

// customer accounts and admins' last sign-in (auth.users, as on Supabase)
const signedIn = (email) => q(`insert into auth.users (email, last_sign_in_at) values ($1, now()) on conflict (email) do update set last_sign_in_at = now()`, [email]).catch((e) => console.error(e));

const err = (res, code, message, status = 400) => json(res, { error: { code, message, status } }, status);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendMail(to, code, customer) {
  const what = customer ? 'קוד הכניסה לחשבון שלך בפרוטאין סטוק' : 'קוד הכניסה לניהול פרוטאין סטוק';
  await sendEmail({
    to, subject: `קוד הכניסה שלך: ${code}`,
    text: `${what}: ${code}\nהקוד בתוקף ל-10 דקות. אם לא ביקשת אותו, אפשר להתעלם מהמייל.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px">${what}:<div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:14px 0">${code}</div>הקוד בתוקף ל-10 דקות. אם לא ביקשת אותו, אפשר להתעלם מהמייל.</div>`,
  });
}

// Without a mail key (BREVO_API_KEY / RESEND_API_KEY) the code is sent and checked by Supabase Auth (the store's Supabase
// project, which already emails admin codes). Only the public (publishable) key is used; the admins list in our database still decides access.
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Gcr_7r00CovbMZj-tJin8g_Jp8B1JcB';
const viaSupabase = () => !mailProvider() && !!SB_URL;
async function sbAuth(path, body) {
  const r = await fetch(`${SB_URL}/auth/v1/${path}`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

export default handler(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    if (new URL(req.url, 'http://x').searchParams.get('scope') === 'customer') {
      const ce = customerEmail(req);
      return json(res, { session: ce ? { user: { id: ce, email: ce } } : null });
    }
    const email = await adminEmail(req);
    return json(res, { session: email ? { user: { id: email, email } } : null });
  }
  const b = await readJson(req, 5000);

  const cust = b.scope === 'customer';
  if (b.action === 'logout') { if (cust) clearCustomer(res); else clearSession(res); return json(res, { ok: true }); }

  const email = String(b.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return err(res, 'invalid_email', 'כתובת אימייל לא תקינה');

  if (b.action === 'send') {
    const recent = await one(`select count(*)::int n, max(created_at) last from admin_otps where email = $1 and code_hash <> 'supabase-fail' and created_at > now() - interval '1 hour'`, [email]);
    if (recent.n >= 6 || (recent.last && Date.now() - new Date(recent.last).getTime() < 40000)) {
      return err(res, 'over_email_send_rate_limit', 'rate limit', 429);
    }
    const admin = cust || await one('select email from admins where email = $1', [email]);
    // Same answer whether or not the address is an admin, so the list of admins can't be probed.
    if (!admin) return json(res, { ok: true });
    if (viaSupabase()) {
      await q(`insert into admin_otps (email, code_hash, expires_at) values ($1, 'supabase', now() + interval '10 minutes')`, [email]);   // rate limit only
      const r = await sbAuth('otp', { email, create_user: true });
      if (!r.ok) {
        console.error('supabase otp failed', r.status, r.j);
        return r.status === 429 ? err(res, 'over_email_send_rate_limit', 'rate limit', 429) : err(res, 'mail_failed', 'שליחת המייל נכשלה', 500);
      }
      return json(res, { ok: true });
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await q(`insert into admin_otps (email, code_hash, expires_at) values ($1, $2, now() + interval '10 minutes')`, [email, sha256(email + ':' + code)]);
    try { await sendMail(email, code, cust); } catch (e) {
      console.error(e);
      return err(res, e.code || 'mail_failed', e.code === 'mail_not_configured' ? 'שליחת מיילים עדיין לא הוגדרה בשרת (BREVO_API_KEY).' : 'שליחת המייל נכשלה', 500);
    }
    await q(`delete from admin_otps where created_at < now() - interval '1 day'`);
    return json(res, { ok: true });
  }

  if (b.action === 'verify') {
    const token = String(b.token ?? '').replace(/\D/g, '');
    if (token.length < 6 || token.length > 10) return err(res, 'otp_expired', 'invalid');
    if (viaSupabase()) {
      const tries = await one(`select count(*)::int n from admin_otps where email = $1 and code_hash = 'supabase-fail' and created_at > now() - interval '15 minutes'`, [email]);
      if (tries.n >= 8) return err(res, 'otp_expired', 'too many attempts');
      const r = await sbAuth('verify', { type: 'email', email, token });
      const got = String(r.j?.user?.email || '').toLowerCase();
      if (!r.ok || got !== email) {
        await q(`insert into admin_otps (email, code_hash, expires_at) values ($1, 'supabase-fail', now())`, [email]);
        return err(res, 'otp_expired', 'invalid');
      }
      if (cust) { setCustomer(res, email); await signedIn(email); return json(res, { session: { user: { id: email, email } } }); }
      const ok = await one('select email from admins where email = $1', [email]);
      if (!ok) return err(res, 'forbidden', 'not an admin', 403);
      setSession(res, email); await signedIn(email);
      return json(res, { session: { user: { id: email, email } } });
    }
    if (token.length !== 6) return err(res, 'otp_expired', 'invalid');
    const row = await one(`select id, code_hash, attempts from admin_otps where email = $1 and not used and expires_at > now() order by created_at desc limit 1`, [email]);
    if (!row || row.attempts >= 5) return err(res, 'otp_expired', 'expired');
    const good = sha256(email + ':' + token);
    if (!crypto.timingSafeEqual(Buffer.from(good), Buffer.from(row.code_hash))) {
      await q('update admin_otps set attempts = attempts + 1 where id = $1', [row.id]);
      return err(res, 'otp_expired', 'invalid');
    }
    await q('update admin_otps set used = true where id = $1', [row.id]);
    if (cust) { setCustomer(res, email); await signedIn(email); return json(res, { session: { user: { id: email, email } } }); }
    const admin = await one('select email from admins where email = $1', [email]);
    if (!admin) return err(res, 'forbidden', 'not an admin', 403);
    setSession(res, email); await signedIn(email);
    return json(res, { session: { user: { id: email, email } } });
  }
  return err(res, 'bad_action', 'bad action');
});
