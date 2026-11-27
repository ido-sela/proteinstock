// Checkout: validates the cart, prices it from the database (coupon included), reserves stock, stores the order
// and (when enabled in the admin) creates a PayPlus payment page. Same rules as the old Supabase function.
// { action: 'quote' } only prices the cart (for showing a coupon's discount at checkout) and stores nothing.
import crypto from 'node:crypto';
import { tx, one, q } from './_lib/db.js';
import { json, readJson, handler, clientIp, origin } from './_lib/http.js';
import { sha256 } from './_lib/auth.js';
import { getProvider, webhookUrl, paymentKeysPresent } from './_lib/payplus.js';
import { priceCoupon, normCode } from './_lib/coupons.js';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cents = (n) => Math.round(Number(n) * 100);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newNumber = () => 'PS' + Array.from(crypto.randomBytes(6), (x) => ALPHABET[x % ALPHABET.length]).join('');

export default handler(['POST'], async (req, res) => {
  const body = await readJson(req, 20000);
  const quote = body.action === 'quote';

  // Card payments are on but the PayPlus keys aren't on this server yet: answer 503 so checkout.html uses the
  // Supabase checkout function (which has the keys) instead of taking an order the customer couldn't pay.
  if (!quote) {
    const pay = (await one(`select value from site_settings where key = 'payment'`))?.value ?? {};
    const k = paymentKeysPresent();
    if (pay.enabled && pay.provider === 'payplus' && !(k.api_key && k.secret_key)) return json(res, { error: 'payment_not_configured' }, 503);
  }

  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20);
  const email = clean(body.email, 120);
  const pickup = body.delivery === 'pickup';
  const address = pickup ? 'איסוף עצמי' : clean(body.address, 220);
  const notes = clean(body.notes, 500);
  // חשבונית על שם חברה (לא חובה): שם + ח.פ/ע.מ של 9 ספרות — עובר ל-PayPlus
  const invVat = typeof body.invoice_vat_id === 'string' && /^\d{9}$/.test(body.invoice_vat_id) ? body.invoice_vat_id : null;
  const invCompany = invVat ? clean(body.invoice_company, 80) : null;
  if (!quote) {
    if (name.length < 2) return json(res, { error: 'invalid_name' }, 400);
    if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) return json(res, { error: 'invalid_phone' }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, { error: 'invalid_email' }, 400);
    if (!pickup && address.length < 6) return json(res, { error: 'invalid_address' }, 400);
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 40) return json(res, { error: 'invalid_items' }, 400);

  const qtyById = new Map();
  for (const it of body.items) {
    const id = clean(it?.id, 20);
    const n = Number(it?.qty);
    if (!id || !Number.isInteger(n) || n < 1 || n > 50) return json(res, { error: 'invalid_items' }, 400);
    qtyById.set(id, Math.min(50, (qtyById.get(id) ?? 0) + n));
  }

  // basic abuse limit (per IP hash)
  const ipHash = sha256(clientIp(req));
  if (!quote) {
    const rl = await one(`select count(*)::int n from orders where ip_hash = $1 and created_at > now() - interval '10 minutes'`, [ipHash]);
    if (rl.n >= 8) return json(res, { error: 'rate_limited' }, 429);
  }

  // price everything from the database, never from the client
  const ids = [...qtyById.keys()];
  const prods = await q('select id, title, category, price, out_of_stock, hidden, status from products where id = any($1)', [ids]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  const unavailable = ids.filter((id) => { const p = byId.get(id); return !p || p.hidden || p.status !== 'active' || p.out_of_stock; });
  if (unavailable.length) return json(res, { error: 'unavailable', ids: unavailable }, 409);

  let subtotalC = 0;
  const lines = ids.map((id) => {
    const p = byId.get(id), n = qtyById.get(id), lineC = cents(p.price) * n;
    subtotalC += lineC;
    return { product_id: id, title: p.title, category: p.category, cents: lineC, unit_price: Number(p.price), qty: n, line_total: lineC / 100 };
  });

  // coupon (validated and priced on the server only)
  const code = normCode(body.coupon);
  let discountC = 0, perLine = new Map(), couponCode = null;
  if (code) {
    const c = (await one('select coupon_check($1) r', [code])).r;
    if (c.error) return json(res, { error: c.error }, 400);
    const pr = priceCoupon(c, lines, subtotalC);
    if (pr.error) return json(res, { error: pr.error, min: pr.min ?? undefined }, 400);
    discountC = pr.discountC; perLine = pr.perLine; couponCode = c.code;
  }
  const afterC = subtotalC - discountC;

  const sset = (await one(`select value from site_settings where key = 'shipping'`))?.value ?? {};
  const freeOver = Number(sset.free_over ?? 0), freeOverList = Number(sset.free_over_list ?? 0), fee = Number(sset.fee ?? 0);
  if (pickup && sset.pickup === false) return json(res, { error: 'pickup_unavailable' }, 400);
  // free shipping: the total after the discount reaches free_over, and (when set) the cart before the discount reaches free_over_list
  const free = freeOver > 0 && afterC >= cents(freeOver) && !(freeOverList > 0 && subtotalC < cents(freeOverList));
  const shippingC = pickup ? 0 : (free ? 0 : cents(fee));
  const totalC = afterC + shippingC;

  if (quote) {
    return json(res, { subtotal: subtotalC / 100, discount: discountC / 100, shipping: shippingC / 100, total: totalC / 100, coupon: couponCode });
  }

  // stock reservation + order + items in one transaction: all or nothing
  let order;
  try {
    order = await tx(async (sql) => {
      const [{ r }] = await sql('select reserve_stock($1::jsonb) r', [JSON.stringify(ids.map((id) => ({ id, qty: qtyById.get(id) })))]);
      if (r?.failed?.length) { const e = new Error('unavailable'); e.unavailable = r.failed; throw e; }
      let o = null;
      for (let i = 0; i < 4 && !o; i++) {
        try {
          await sql('savepoint ins');
          [o] = await sql(
            `insert into orders (number, customer_name, phone, email, address, notes, delivery, subtotal, discount, coupon_code, shipping, total, ip_hash)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id, number, total, currency, status`,
            [newNumber(), name, phone, email || null, address || null, notes || null, pickup ? 'pickup' : 'shipping', subtotalC / 100, discountC / 100, couponCode, shippingC / 100, totalC / 100, ipHash]);
        } catch (e) {
          if (e.code !== '23505') throw e; // only retry on an order-number collision
          await sql('rollback to savepoint ins');
        }
      }
      if (!o) throw new Error('order_number_collision');
      for (const l of lines) {
        await sql('insert into order_items (order_id, product_id, title, unit_price, qty, line_total) values ($1,$2,$3,$4,$5,$6)',
          [o.id, l.product_id, l.title, l.unit_price, l.qty, l.line_total]);
      }
      return o;
    });
  } catch (e) {
    if (e.unavailable) return json(res, { error: 'unavailable', ids: e.unavailable }, 409);
    throw e;
  }

  // payment (optional; used only when enabled in the admin)
  let paymentUrl = null;
  const settings = (await one(`select value from site_settings where key = 'payment'`))?.value ?? {};
  const providerName = settings.enabled ? settings.provider ?? null : null;
  const provider = getProvider(providerName);
  if (provider) {
    try {
      const base = process.env.SITE_URL || origin(req);
      const r = await provider.createPayment(
        { number: order.number, total: Number(order.total), currency: order.currency, customer_name: name, phone, email: email || null,
          invoice_company: invCompany || null, vat_id: invVat || null,
          items: lines.map((l) => ({ title: l.title, qty: l.qty, unit_price: l.unit_price, line_total: (l.cents - (perLine.get(l.product_id) ?? 0)) / 100 })) },
        { returnUrl: req.headers.origin || base, webhookUrl: webhookUrl(base), settings },
      );
      paymentUrl = r.url;
      await q('update orders set payment_provider = $1, payment_ref = $2 where id = $3', [providerName, r.ref ?? null, order.id]);
    } catch (e) {
      console.error('createPayment failed', e);
    }
  }

  return json(res, {
    order_number: order.number, total: Number(order.total), shipping: shippingC / 100, discount: discountC / 100, coupon: couponCode, currency: order.currency,
    status: order.status, delivery: pickup ? 'pickup' : 'shipping', payment_url: paymentUrl,
  });
});
