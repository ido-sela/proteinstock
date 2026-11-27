// PayPlus callback: verifies the signature, then marks the order paid (idempotent) or failed.
import { q, one } from './_lib/db.js';
import { json, rawBody, handler } from './_lib/http.js';
import { getProvider } from './_lib/payplus.js';
import { flushWebhooks } from './_lib/order-webhook.js';

export const config = { api: { bodyParser: false } };

export default handler(['POST'], async (req, res) => {
  const name = new URL(req.url, 'http://x').searchParams.get('provider');
  const provider = getProvider(name);
  if (!provider) return json(res, { error: 'no_provider_connected' }, 501);

  const raw = await rawBody(req, 100000);
  const settings = (await one(`select value from site_settings where key = 'payment'`))?.value ?? {};

  let ev;
  try {
    ev = await provider.parseWebhook(req.headers, raw, settings); // throws if the signature is invalid
  } catch (e) {
    console.error('webhook rejected', e);
    return json(res, { error: 'invalid_signature' }, 401);
  }
  if (!ev) return json(res, { ok: true, ignored: true });

  if (ev.status === 'paid') {
    const r = await one('select mark_order_paid($1,$2,$3,$4,$5,$6::jsonb) r',
      [ev.orderNumber, name, ev.eventId, ev.ref ?? null, ev.amount, JSON.stringify(ev.raw ?? null)]);
    if (r.r === 'amount_mismatch' || r.r === 'order_not_found') { console.error('payment problem', r.r, ev.orderNumber); return json(res, { result: r.r }, 422); }
    if (r.r === 'paid') await flushWebhooks().catch((e) => console.error(e));   // send the paid order to the stock system
    return json(res, { result: r.r });
  }

  await q(`update orders set status = 'failed', payment_provider = $1, payment_ref = $2 where number = $3 and status = 'pending'`, [name, ev.ref ?? null, ev.orderNumber]);
  return json(res, { result: 'failed_recorded' });
});
