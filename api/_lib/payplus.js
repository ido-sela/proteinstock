// PayPlus payment provider (ported unchanged in behaviour from the Supabase edge functions).
// Env: PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY, optional PAYPLUS_PAYMENT_PAGE_UID.
import crypto from 'node:crypto';

const ppBase = (s) => (s?.sandbox ? 'https://restapidev.payplus.co.il/api/v1.0' : 'https://restapi.payplus.co.il/api/v1.0');
const ppKeys = () => ({ api: process.env.PAYPLUS_API_KEY ?? '', secret: process.env.PAYPLUS_SECRET_KEY ?? '' });
const ppHeaders = () => {
  const k = ppKeys();
  return { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': k.api, 'secret-key': k.secret };
};
const hmacB64 = (secret, msg) => crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('base64');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const payplus = {
  async createPayment(order, ctx) {
    const k = ppKeys();
    const pageUid = ctx.settings?.page_uid || process.env.PAYPLUS_PAYMENT_PAGE_UID || '';
    if (!k.api || !k.secret) throw new Error('payplus_keys_missing');
    if (!pageUid) throw new Error('payplus_page_uid_missing');

    // A coupon lowers line totals; PayPlus needs the items to add up to the amount, so a discounted line is sent
    // at its discounted unit price, or as one line for the whole quantity when the price doesn't divide evenly.
    const items = order.items.map((i) => {
      const full = Math.round(i.unit_price * 100) * i.qty;
      const paid = i.line_total == null ? full : Math.round(i.line_total * 100);
      if (paid === full) return { name: i.title.slice(0, 120), quantity: i.qty, price: i.unit_price };
      if (paid % i.qty === 0) return { name: i.title.slice(0, 120), quantity: i.qty, price: paid / i.qty / 100 };
      return { name: `${i.title.slice(0, 110)} ×${i.qty}`, quantity: 1, price: paid / 100 };
    });
    const sum = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100);
    const diff = Math.round(order.total * 100) - sum;
    if (diff > 0) items.push({ name: 'משלוח', quantity: 1, price: diff / 100 });

    const ret = (ctx.returnUrl || 'https://proteinstock.co.il').replace(/\/$/, '');
    const qs = (s) => `${ret}/?pay=${s}&order=${encodeURIComponent(order.number)}`;
    const customer = { customer_name: order.customer_name, phone: order.phone };
    if (order.email) customer.email = order.email;

    const res = await fetch(`${ppBase(ctx.settings)}/PaymentPages/generateLink`, {
      method: 'POST',
      headers: ppHeaders(),
      body: JSON.stringify({
        payment_page_uid: pageUid, charge_method: 1, amount: order.total, currency_code: order.currency || 'ILS',
        sendEmailApproval: !!order.email, sendEmailFailure: false, send_failure_callback: true,
        refURL_success: qs('success'), refURL_failure: qs('failure'), refURL_cancel: qs('cancel'), refURL_callback: ctx.webhookUrl,
        more_info: order.number, customer, items,
      }),
    });
    const j = await res.json().catch(() => ({}));
    const link = j?.data?.payment_page_link;
    if (!res.ok || j?.results?.status !== 'success' || !link) {
      throw new Error('payplus_generate_failed: ' + JSON.stringify(j?.results ?? j).slice(0, 300));
    }
    return { url: link, ref: j?.data?.page_request_uid };
  },

  async parseWebhook(headers, raw, settings) {
    const k = ppKeys();
    if (!k.secret) throw new Error('payplus_keys_missing');
    if (headers['user-agent'] !== 'PayPlus') throw new Error('bad_user_agent');
    const got = String(headers.hash ?? '');
    let body;
    try { body = JSON.parse(raw); } catch { throw new Error('bad_json'); }
    const okRaw = got && safeEqual(hmacB64(k.secret, raw), got);
    const okJson = got && safeEqual(hmacB64(k.secret, JSON.stringify(body)), got);
    if (!okRaw && !okJson) throw new Error('bad_hash');

    const t = body?.transaction ?? body?.data?.transaction ?? body;
    const orderNumber = String(t?.more_info ?? body?.more_info ?? '').trim();
    if (!orderNumber) return null;
    const code = String(t?.status_code ?? body?.status_code ?? '');
    const uid = String(t?.uid ?? body?.transaction_uid ?? '');
    const reqUid = String(t?.payment_page_request_uid ?? body?.payment_page_request_uid ?? '');
    const amount = Number(t?.amount ?? body?.amount ?? 0);
    const paid = code === '000';

    if (paid) {
      try {
        const r = await fetch(`${ppBase(settings)}/PaymentPages/ipn`, {
          method: 'POST', headers: ppHeaders(),
          body: JSON.stringify(uid ? { transaction_uid: uid } : { payment_request_uid: reqUid }),
        });
        const j = await r.json().catch(() => null);
        const d = j?.data ?? {};
        const st = String(d?.status_code ?? d?.transaction?.status_code ?? '');
        if (st && st !== '000') throw new Error('ipn_not_approved:' + st);
        const a = Number(d?.amount ?? d?.transaction?.amount ?? NaN);
        if (Number.isFinite(a) && Math.abs(a - amount) > 0.001) throw new Error('ipn_amount_mismatch');
      } catch (e) {
        if (String(e?.message).startsWith('ipn_')) throw e;
        console.error('ipn lookup failed (continuing on signed callback)', e);
      }
    }
    return { eventId: uid || `${reqUid}:${code}`, orderNumber, status: paid ? 'paid' : 'failed', amount, ref: uid || reqUid || undefined, raw: body };
  },
};

const providers = { payplus };
export const getProvider = (name) => (name && providers[name] ? providers[name] : null);
export const paymentKeysPresent = () => { const k = ppKeys(); return { api_key: !!k.api, secret_key: !!k.secret }; };
export const webhookUrl = (base) => `${base.replace(/\/$/, '')}/api/payment-webhook?provider=payplus`;
