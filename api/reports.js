// Back office reports: sales dashboard, orders search, customers and coupon usage. Admin session required.
// POST { action, ...params }. Dates are 'YYYY-MM-DD' days in Israel time and filter by the order's creation date.
// "Revenue" counts paid orders only; pending orders are reported separately.
import { q, one } from './_lib/db.js';
import { json, readJson, handler } from './_lib/http.js';
import { adminEmail } from './_lib/auth.js';

const TZ = 'Asia/Jerusalem';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];
// One customer = one phone number, whatever way it was typed (05x…, +9725x…, spaces, dashes).
const PHONE_KEY = `regexp_replace(regexp_replace(o.phone, '\\D', '', 'g'), '^972', '0')`;
const LOCAL_DAY = `(o.created_at at time zone '${TZ}')::date`;

const bad = (m) => { const e = new Error(m); e.bad = true; throw e; };
const day = (v, name) => { if (v == null || v === '') return null; if (!DAY.test(v) || isNaN(Date.parse(v))) bad('bad_' + name); return v; };
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };

// Shared WHERE builder for order lists. Returns [sqlParts, params].
function orderFilters(b, params = []) {
  const w = [];
  const from = day(b.from, 'from'), to = day(b.to, 'to');
  if (from) { params.push(from); w.push(`${LOCAL_DAY} >= $${params.length}::date`); }
  if (to) { params.push(to); w.push(`${LOCAL_DAY} <= $${params.length}::date`); }
  if (b.status && b.status !== 'all') {
    const list = String(b.status).split(',').filter((s) => STATUSES.includes(s));
    if (!list.length) bad('bad_status');
    params.push(list); w.push(`o.status = any($${params.length}::text[])`);
  }
  if (b.coupon === 'any') w.push('o.coupon_code is not null');
  else if (b.coupon === 'none') w.push('o.coupon_code is null');
  else if (b.coupon) { params.push(str(b.coupon, 40).toUpperCase()); w.push(`o.coupon_code = $${params.length}`); }
  if (b.delivery === 'pickup' || b.delivery === 'shipping') { params.push(b.delivery); w.push(`o.delivery = ${params.length}`); }
  if (b.fulfillment === 'none') w.push('o.fulfillment is null');
  else if (['pending', 'processing', 'shipped', 'completed', 'cancelled'].includes(b.fulfillment)) { params.push(b.fulfillment); w.push(`o.fulfillment = ${params.length}`); }
  if (b.customer) { params.push(str(b.customer, 30).replace(/\D/g, '').replace(/^972/, '0')); w.push(`${PHONE_KEY} = $${params.length}`); }
  const text = str(b.q, 100);
  if (text) {
    params.push('%' + text.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
    const p = `$${params.length}`;
    const digits = text.replace(/\D/g, '');
    let phone = '';
    if (digits.length >= 3) { params.push('%' + digits.replace(/^972/, '0') + '%'); phone = ` or ${PHONE_KEY} like $${params.length}`; }
    w.push(`(o.number ilike ${p} or o.customer_name ilike ${p} or coalesce(o.email,'') ilike ${p} or coalesce(o.coupon_code,'') ilike ${p} or coalesce(o.payment_ref,'') ilike ${p}${phone}
      or exists (select 1 from order_items i where i.order_id = o.id and i.title ilike ${p}))`);
  }
  return [w, params];
}
const whereOf = (w) => (w.length ? ' where ' + w.join(' and ') : '');

const ORDER_COLS = `o.id, o.number, o.status, o.customer_name, o.phone, o.email, o.address, o.delivery, o.notes,
  o.subtotal, o.discount, o.coupon_code, o.shipping, o.total, o.currency, o.payment_provider, o.payment_ref, o.paid_at, o.created_at,
  o.fulfillment, o.tracking_number, o.source, o.shipping_method`;
// up to 4 product images per order, for the thumbnails in order lists
const THUMBS = `(select coalesce(json_agg(x.image), '[]') from (select p.image from order_items i join products p on p.id = i.product_id where i.order_id = o.id and p.image is not null order by i.id limit 4) x) thumbs`;
const SORTS = { created_at: 'o.created_at', total: 'o.total', number: 'o.number', customer_name: 'o.customer_name', paid_at: 'o.paid_at', discount: 'o.discount' };

async function summary(b) {
  const from = day(b.from, 'from'), to = day(b.to, 'to');
  if (!from || !to) bad('range_required');
  if (to < from) bad('bad_range');
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  if (days > 1100) bad('range_too_long');
  // The period right before, of the same length, for the change badges.
  const prevTo = new Date(Date.parse(from) - 864e5).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.parse(from) - days * 864e5).toISOString().slice(0, 10);

  const kpiSql = `select
      coalesce(sum(o.total) filter (where o.status = 'paid'), 0) revenue,
      count(*) filter (where o.status = 'paid')::int paid_orders,
      count(*)::int all_orders,
      count(*) filter (where o.status = 'pending')::int pending_orders,
      coalesce(sum(o.total) filter (where o.status = 'pending'), 0) pending_value,
      count(*) filter (where o.status in ('failed','cancelled','refunded'))::int lost_orders,
      coalesce(sum(o.discount) filter (where o.status = 'paid'), 0) discounts,
      count(*) filter (where o.status = 'paid' and o.coupon_code is not null)::int coupon_orders,
      coalesce(sum(o.shipping) filter (where o.status = 'paid'), 0) shipping,
      count(distinct ${PHONE_KEY}) filter (where o.status = 'paid')::int customers
    from orders o where ${LOCAL_DAY} between $1::date and $2::date`;
  const [cur, prev] = await Promise.all([one(kpiSql, [from, to]), one(kpiSql, [prevFrom, prevTo])]);

  const [series, products, coups, statuses, delivery, recent, newCust] = await Promise.all([
    q(`select d::date::text as day, coalesce(sum(o.total) filter (where o.status = 'paid'), 0) revenue,
         count(o.id) filter (where o.status = 'paid')::int paid, count(o.id)::int orders
       from generate_series($1::date, $2::date, interval '1 day') d
       left join orders o on ${LOCAL_DAY} = d::date
       group by d order by d`, [from, to]),
    q(`select i.product_id, max(i.title) title, sum(i.qty)::int qty, sum(i.line_total) revenue, count(distinct o.id)::int orders
       from order_items i join orders o on o.id = i.order_id
       where o.status = 'paid' and ${LOCAL_DAY} between $1::date and $2::date
       group by i.product_id order by revenue desc, qty desc limit 10`, [from, to]),
    q(`select o.coupon_code code, count(*)::int uses, sum(o.discount) discount, sum(o.total) revenue
       from orders o where o.status = 'paid' and o.coupon_code is not null and ${LOCAL_DAY} between $1::date and $2::date
       group by o.coupon_code order by uses desc, revenue desc limit 8`, [from, to]),
    q(`select o.status, count(*)::int n, coalesce(sum(o.total), 0) total from orders o
       where ${LOCAL_DAY} between $1::date and $2::date group by o.status`, [from, to]),
    q(`select o.delivery, count(*)::int n from orders o
       where o.status = 'paid' and ${LOCAL_DAY} between $1::date and $2::date group by o.delivery`, [from, to]),
    q(`select ${ORDER_COLS}, (select coalesce(sum(qty),0)::int from order_items i where i.order_id = o.id) items, ${THUMBS} from orders o where ${LOCAL_DAY} between $1::date and $2::date order by o.created_at desc limit 8`, [from, to]),
    // customers whose first paid order falls in the period
    one(`select count(*)::int n from (select ${PHONE_KEY} as k, min(o.created_at) as first from orders o where o.status = 'paid' group by 1) c
       where (c.first at time zone '${TZ}')::date between $1::date and $2::date`, [from, to]),
  ]);
  cur.new_customers = newCust.n;
  return { from, to, prev: { from: prevFrom, to: prevTo, ...prev }, kpi: cur, series, products, coupons: coups, statuses, delivery, recent };
}

async function orders(b) {
  const [w, params] = orderFilters(b);
  const size = int(b.size, 50, 1, 5000), page = int(b.page, 0, 0, 100000);
  const sort = SORTS[b.sort] || 'o.created_at', dir = b.dir === 'asc' ? 'asc' : 'desc';
  const where = whereOf(w);
  const [rows, tot] = await Promise.all([
    q(`select ${ORDER_COLS}, (select coalesce(sum(qty),0)::int from order_items i where i.order_id = o.id) items, ${THUMBS}
       from orders o${where} order by ${sort} ${dir} nulls last, o.created_at desc limit ${size} offset ${page * size}`, params),
    one(`select count(*)::int n, coalesce(sum(o.total),0) total, coalesce(sum(o.total) filter (where o.status='paid'),0) paid,
         coalesce(sum(o.discount),0) discount, count(*) filter (where o.coupon_code is not null)::int with_coupon
       from orders o${where}`, params),
  ]);
  if (b.items) {   // used by the CSV export
    const ids = rows.map((r) => r.id);
    const items = ids.length ? await q('select order_id, title, qty, unit_price, line_total from order_items where order_id = any($1) order by id', [ids]) : [];
    rows.forEach((r) => { r.order_items = items.filter((i) => i.order_id === r.id); });
  }
  return { rows, count: tot.n, sums: tot, page, size };
}

async function order(b) {
  const id = str(b.id, 60), number = str(b.number, 20);
  if (!id && !number) bad('id_required');
  const o = await one(`select ${ORDER_COLS}, o.ip_hash is not null has_ip from orders o where ${id ? 'o.id::text = $1' : 'o.number = $1'}`, [id || number]);
  if (!o) return { order: null };
  const [items, events, history] = await Promise.all([
    q('select i.product_id, i.title, i.unit_price, i.qty, i.line_total, p.image from order_items i left join products p on p.id = i.product_id where i.order_id = $1 order by i.id', [o.id]),
    q(`select id, provider, event_id, received_at,
         payload #>> '{transaction,status_code}' status_code, coalesce(payload #>> '{transaction,amount}', payload ->> 'amount') amount,
         coalesce(payload #>> '{transaction,four_digits}', payload #>> '{data,card_information,four_digits}') card_last4,
         coalesce(payload #>> '{transaction,number_of_payments}', payload #>> '{transaction,payments}') payments,
         coalesce(payload #>> '{transaction,approval_number}', payload #>> '{transaction,voucher_number}') approval
       from payment_events where order_number = $1 order by received_at`, [o.number]),
    one(`select count(*)::int orders, count(*) filter (where o.status='paid')::int paid, coalesce(sum(o.total) filter (where o.status='paid'),0) spent,
         min(o.created_at) as first from orders o where ${PHONE_KEY} = regexp_replace(regexp_replace($1, '\\D', '', 'g'), '^972', '0')`, [o.phone]),
  ]);
  delete o.has_ip;
  return { order: { ...o, order_items: items }, events, customer: history };
}

async function customers(b) {
  const params = [];
  const text = str(b.q, 100);
  let having = '';
  if (text) {
    params.push('%' + text.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
    const digits = text.replace(/\D/g, '');
    let phone = '';
    if (digits.length >= 3) { params.push('%' + digits.replace(/^972/, '0') + '%'); phone = ` or ${PHONE_KEY} like $${params.length}`; }
    having = ` having bool_or(o.customer_name ilike $1 or coalesce(o.email,'') ilike $1${phone})`;
  }
  const sorts = { spent: 'spent', orders: 'orders', last: 'last', first: 'first', name: 'name' };
  const sort = sorts[b.sort] || 'last', dir = b.dir === 'asc' ? 'asc' : 'desc';
  const size = int(b.size, 50, 1, 5000), page = int(b.page, 0, 0, 100000);
  const base = `select ${PHONE_KEY} key,
      (array_agg(o.customer_name order by o.created_at desc))[1] as name,
      (array_agg(o.phone order by o.created_at desc))[1] phone,
      (array_agg(o.email order by o.created_at desc) filter (where o.email is not null))[1] email,
      (array_agg(o.address order by o.created_at desc) filter (where o.delivery = 'shipping' and o.address is not null))[1] address,
      count(*)::int orders, count(*) filter (where o.status = 'paid')::int paid,
      coalesce(sum(o.total) filter (where o.status = 'paid'), 0) spent,
      coalesce(sum(o.discount) filter (where o.status = 'paid'), 0) saved,
      min(o.created_at) as first, max(o.created_at) as last,
      coalesce(array_agg(distinct o.coupon_code) filter (where o.coupon_code is not null), '{}') coupons
    from orders o group by 1${having}`;
  const [rows, tot] = await Promise.all([
    q(`select * from (${base}) c order by ${sort} ${dir} nulls last, last desc limit ${size} offset ${page * size}`, params),
    one(`select count(*)::int n, count(*) filter (where paid > 1)::int repeat, coalesce(sum(spent),0) spent from (${base}) c`, params),
  ]);
  return { rows, count: tot.n, repeat: tot.repeat, spent: tot.spent, page, size };
}

async function couponReport(b) {
  const [w, params] = orderFilters({ from: b.from, to: b.to });
  w.push('o.coupon_code is not null');
  const rows = await q(`select o.coupon_code code,
      count(*) filter (where o.status = 'paid')::int paid_uses,
      count(*) filter (where o.status = 'pending')::int pending_uses,
      count(*) filter (where o.status in ('failed','cancelled','refunded'))::int lost_uses,
      coalesce(sum(o.total) filter (where o.status = 'paid'), 0) revenue,
      coalesce(sum(o.discount) filter (where o.status = 'paid'), 0) discount,
      count(distinct ${PHONE_KEY}) filter (where o.status = 'paid')::int customers,
      min(o.created_at) first_use, max(o.created_at) last_use,
      max(c.type) as type, max(c.value) as value, bool_or(c.active) as active, max(c.max_uses) max_uses, max(c.uses_count) uses_count,
      max(c.description) description, bool_or(c.code is null) deleted
    from orders o left join coupons c on c.code = o.coupon_code${whereOf(w)}
    group by o.coupon_code order by paid_uses desc, last_use desc`, params);
  const totals = rows.reduce((t, r) => ({ uses: t.uses + r.paid_uses, revenue: t.revenue + Number(r.revenue), discount: t.discount + Number(r.discount) }), { uses: 0, revenue: 0, discount: 0 });
  const unused = await one(`select count(*)::int n from coupons c where c.active and not exists (select 1 from orders o where o.coupon_code = c.code)`);
  return { rows, totals, unused: unused.n };
}

const ACTIONS = { summary, orders, order, customers, coupons: couponReport };

export default handler(['POST'], async (req, res) => {
  const admin = await adminEmail(req);
  if (!admin) return json(res, { error: { code: 'unauthorized', message: 'unauthorized' } }, 401);
  const b = await readJson(req, 20000);
  const fn = ACTIONS[b.action];
  if (!fn) return json(res, { error: { message: 'bad action' } }, 400);
  try {
    return json(res, { data: await fn(b) });
  } catch (e) {
    if (e.bad) return json(res, { error: { message: e.message } }, 400);
    throw e;
  }
});
