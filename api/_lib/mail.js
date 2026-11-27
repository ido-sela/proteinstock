// Transactional email (login codes). Brevo (BREVO_API_KEY) or Resend (RESEND_API_KEY); MAIL_FROM = "Name <email>".
const DEFAULT_FROM = 'פרוטאין סטוק <admin@proteinstock.co.il>';
export const mailProvider = () => (process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : null);
export function parseFrom(s = process.env.MAIL_FROM || DEFAULT_FROM) {
  const m = String(s).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, ''), email: m[2].trim() } : { name: '', email: String(s).trim() };
}

export async function sendEmail({ to, subject, text, html }) {
  const p = mailProvider();
  if (!p) { const e = new Error('mail_not_configured'); e.code = 'mail_not_configured'; throw e; }
  const from = parseFrom();
  const r = p === 'brevo'
    ? await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: from.name ? from : { email: from.email }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      })
    : await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from.name ? `${from.name} <${from.email}>` : from.email, to: [to], subject, text, html }),
      });
  if (!r.ok) { const t = await r.text().catch(() => ''); const e = new Error('mail_failed: ' + t.slice(0, 200)); e.code = 'mail_failed'; throw e; }
}

// For /api/health?check=mail: is the key accepted, and is the sender address verified (Brevo)? Sends nothing.
export async function checkMail() {
  const p = mailProvider();
  if (p !== 'brevo') return { ok: p === 'resend' ? null : false, provider: p, error: p ? 'check_only_for_brevo' : 'not_configured' };
  const h = { 'api-key': process.env.BREVO_API_KEY, Accept: 'application/json' };
  const a = await fetch('https://api.brevo.com/v3/account', { headers: h });
  if (!a.ok) return { ok: false, provider: p, error: 'key_rejected', status: a.status };
  const from = parseFrom().email.toLowerCase();
  const s = await fetch('https://api.brevo.com/v3/senders', { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const senders = s?.senders ?? [];
  const sender = senders.find((x) => String(x.email).toLowerCase() === from);
  const domains = await fetch('https://api.brevo.com/v3/senders/domains', { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const dom = (domains?.domains ?? []).find((d) => String(d.domain_name).toLowerCase() === from.split('@')[1]);
  return { ok: true, provider: p, from, sender_exists: !!sender, sender_active: !!sender?.active,
    domain_authenticated: dom ? !!dom.authenticated : null };
}
