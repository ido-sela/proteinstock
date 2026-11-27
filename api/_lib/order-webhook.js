// Sends each paid order to the store's stock system (stock.proteinstock.co.il), in the format its owner specified
// ("חיבור האתר החדש למערכת המלאי", 24.11.2026): POST JSON, header x-zappy-signature: sha256=<hex HMAC-SHA256 of the raw body>.
// The database queues an order when it becomes paid (order_webhook_queue, trigger ps_order_paid_hook);
// every API call that can mark an order paid then calls flushWebhooks(). Same payload as the old Supabase function.
import crypto from 'node:crypto';
import { q, one } from './db.js';

const money = (n) => Math.round(Number(n || 0) * 100) / 100;
export const cfg = async (key) => (await one('select value from integrations where key = $1', [key]))?.value ?? {};

/* pack compositions chosen at checkout travel in the order notes: "הרכב מארז — <name> ×<q>: <choice> | ..." */
function packChoices(notes) {
  const m = String(notes || '').match(/הרכב מארז — ([^\n]+)/);
  if (!m) return [];
  return m[1].split(' | ').map((p) => { const i = p.indexOf(': '); return { name: p.slice(0, i).replace(/ ×\d+$/, '').trim(), choice: p.slice(i + 2).trim() }; }).filter((x) => x.name && x.choice);
}

export async function orderPayload(where, test = false) {
  const o = where.id != null
    ? await one('select * from orders where id = $1', [where.id])
    : await one('select * from orders where number = $1', [String(where.number || '').toUpperCase()]);
  if (!o) return null;
  const items = await q(`select i.product_id, i.title, i.qty, i.unit_price, i.line_total, p.sku from order_items i
    left join products p on p.id = i.product_id where i.order_id = $1 order by i.id`, [o.id]);
  const pickup = o.delivery === 'pickup';
  const packs = packChoices(o.notes);
  const notes = String(o.notes || '').replace(/הרכב מארז — [^\n]+\n?/, '').trim();
  const body = {
    event: 'order.paid',
    order_id: o.number,
    total: money(o.total),
    shipping_price: money(o.shipping),
    customer: { name: o.customer_name, phone: o.phone, ...(o.email ? { email: o.email } : {}) },
    shipping: pickup ? { method: 'איסוף עצמי' } : { method: 'שליח עד הבית', address: o.address || '' },
    ...(notes ? { notes: notes.slice(0, 2000) } : {}),
    items: items.map((i) => {
      const sku = String(i.sku ?? i.product_id).replace(/^0+(?=\d)/, '');   // the stock system lists US barcodes without the leading 0
      const pack = packs.find((p) => String(i.title || '').startsWith(p.name));
      return { sku, name: i.title, quantity: i.qty, price: money(i.unit_price), ...(pack ? { options: pack.choice } : {}) };
    }),
    // extra fields for the store's own records (ignored by the stock system)
    created_at: o.created_at, paid_at: o.paid_at, coupon_code: o.coupon_code, discount: money(o.discount),
  };
  if (test) body.test = true;
  return body;
}

export async function deliver(payload, test = false) {
  const c = await cfg('order_webhook');
  if (!c.url) return { ok: false, error: 'no_url' };
  const body = JSON.stringify(payload);
  const sig = c.secret ? crypto.createHmac('sha256', c.secret).update(body).digest('hex') : '';
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    let status = 0, text = '';
    try {
      const r = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'ProteinStock-Webhook/2',
        ...(sig ? { 'x-zappy-signature': 'sha256=' + sig, 'X-ProteinStock-Signature': 'sha256=' + sig } : {}) }, body, signal: AbortSignal.timeout(15000) });
      status = r.status; text = (await r.text().catch(() => '')).slice(0, 300);
    } catch (e) { text = String(e?.message || e).slice(0, 300); }
    const ok = status >= 200 && status < 300;
    await q('insert into order_webhook_log (order_number, event, url, ok, status, ms, response, attempt) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [payload.order_id, test ? 'order.paid (test)' : 'order.paid', c.url, ok, status, Date.now() - t0, text, attempt]);
    last = { ok, status, response: text };
    if (ok || (status >= 400 && status < 500)) break;
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
  return last;
}

// Sends every queued paid order. Each order is taken off the queue first, so two calls never send it twice.
export async function flushWebhooks() {
  for (let n = 0; n < 20; n++) {
    const row = await one('delete from order_webhook_queue where order_id = (select order_id from order_webhook_queue order by queued_at limit 1 for update skip locked) returning order_id');
    if (!row) return;
    try {
      const c = await cfg('order_webhook');
      if (!c.enabled) continue;
      const p = await orderPayload({ id: row.order_id });
      if (p) await deliver(p);
    } catch (e) { console.error('order webhook', e); }
  }
}
