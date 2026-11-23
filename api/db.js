// Data endpoint used by the storefront and the admin panel (replaces Supabase's REST API).
// Every request is checked against a whitelist: tables, columns and operations.
// The public may only read visible products and the public site settings; everything else needs an admin session.
import { q } from './_lib/db.js';
import { json, readJson, handler } from './_lib/http.js';
import { adminEmail } from './_lib/auth.js';

const T = {
  products: {
    pk: 'id',
    cols: ['id', 'title', 'price', 'old_price', 'out_of_stock', 'hidden', 'description', 'vendor', 'category', 'tags', 'image', 'quantity', 'sku', 'status', 'created_at', 'updated_at'],
    write: ['id', 'title', 'price', 'old_price', 'out_of_stock', 'hidden', 'description', 'vendor', 'category', 'tags', 'image', 'quantity', 'sku', 'status'],
    ops: ['select', 'insert', 'update', 'delete', 'upsert'],
    pub: { cols: ['id', 'title', 'description', 'price', 'old_price', 'out_of_stock', 'vendor', 'category', 'tags', 'image'], where: 'hidden = false' },
  },
  site_settings: {
    pk: 'key', cols: ['key', 'value', 'updated_at'], write: ['key', 'value'], json: ['value'],
    ops: ['select', 'update', 'upsert'],
    pub: { cols: ['key', 'value'], where: "key in ('content','shipping')" },
  },
  orders: {
    pk: 'id',
    cols: ['id', 'number', 'status', 'customer_name', 'phone', 'email', 'address', 'notes', 'subtotal', 'discount', 'coupon_code', 'shipping', 'total', 'currency', 'payment_provider', 'payment_ref', 'paid_at', 'delivery', 'created_at'],
    write: ['status'], ops: ['select', 'update'],
    embed: { order_items: { fk: 'order_id', cols: ['id', 'product_id', 'title', 'unit_price', 'qty', 'line_total'] } },
  },
  order_items: { pk: 'id', cols: ['id', 'order_id', 'product_id', 'title', 'unit_price', 'qty', 'line_total'], ops: ['select'] },
  coupons: {
    pk: 'code',
    cols: ['code', 'type', 'value', 'applies_to', 'category_ids', 'product_ids', 'min_order_amount', 'max_uses', 'uses_count', 'starts_at', 'ends_at', 'active', 'description', 'created_at', 'updated_at'],
    write: ['code', 'type', 'value', 'applies_to', 'category_ids', 'product_ids', 'min_order_amount', 'max_uses', 'starts_at', 'ends_at', 'active', 'description'],
    ops: ['select', 'insert', 'update', 'delete'],
  },
  admins: { pk: 'email', cols: ['email', 'added_at'], ops: ['select'] },
  payment_events: { pk: 'id', cols: ['id', 'provider', 'event_id', 'order_number', 'payload', 'received_at'], ops: ['select'] },
  admin_log: { pk: 'id', cols: ['id', 'at', 'admin_email', 'kind', 'detail'], ops: ['select'] },
};

const bad = (msg) => { const e = new Error(msg); e.bad = true; throw e; };
const ident = (s) => `"${s}"`;

// "id,title,order_items(title,qty)" -> { cols: [...], embeds: [{ name, cols }] }
function parseSelect(t, sel, allowed) {
  const out = { cols: [], embeds: [] };
  const s = String(sel || '*').replace(/\s+/g, '');
  let depth = 0, cur = '';
  const parts = [];
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) parts.push(cur);
  for (const p of parts) {
    const m = p.match(/^([a-z_]+)\((.*)\)$/);
    if (m) {
      const em = t.embed?.[m[1]];
      if (!em) bad('bad_embed');
      const ec = m[2] === '*' ? em.cols : m[2].split(',');
      ec.forEach((c) => { if (!em.cols.includes(c)) bad('bad_column'); });
      out.embeds.push({ name: m[1], cols: ec, fk: em.fk });
    } else if (p === '*') out.cols.push(...allowed);
    else if (allowed.includes(p)) out.cols.push(p);
    else bad('bad_column');
  }
  if (!out.cols.length) out.cols.push(t.pk);
  return out;
}

function whereSql(t, filters, params, cols) {
  const parts = [];
  for (const f of Array.isArray(filters) ? filters : []) {
    const [op, col, val] = f;
    if (!cols.includes(col)) bad('bad_column');
    if (op === 'eq') { params.push(val); parts.push(`${ident(col)} = $${params.length}`); }
    else if (op === 'neq') { params.push(val); parts.push(`${ident(col)} <> $${params.length}`); }
    else if (op === 'gte') { params.push(val); parts.push(`${ident(col)} >= $${params.length}`); }
    else if (op === 'lte') { params.push(val); parts.push(`${ident(col)} <= $${params.length}`); }
    else if (op === 'ilike') { params.push(String(val)); parts.push(`${ident(col)} ilike $${params.length}`); }
    else if (op === 'in') { if (!Array.isArray(val)) bad('bad_filter'); params.push(val.map(String)); parts.push(`${ident(col)}::text = any($${params.length}::text[])`); }
    else bad('bad_filter');
  }
  return parts;
}

function valueSql(t, col, v, params) {
  if (t.json?.includes(col)) { params.push(JSON.stringify(v ?? {})); return `$${params.length}::jsonb`; }
  if (col === 'tags') { params.push(Array.isArray(v) ? v.map(String) : []); return `$${params.length}::text[]`; }
  params.push(v); return `$${params.length}`;
}

function cleanRow(t, row) {
  const keys = Object.keys(row || {});
  if (!keys.length) bad('empty');
  keys.forEach((k) => { if (!t.write?.includes(k)) bad('bad_column'); });
  return keys;
}

async function attachEmbeds(rows, embeds, t) {
  for (const em of embeds) {
    if (!rows.length) continue;
    const ids = rows.map((r) => r[t.pk]);
    const cols = [...new Set([...em.cols, em.fk])];
    const kids = await q(`select ${cols.map(ident).join(',')} from ${ident(em.name)} where ${ident(em.fk)} = any($1) order by id`, [ids]);
    for (const r of rows) {
      r[em.name] = kids.filter((k) => k[em.fk] === r[t.pk]).map((k) => { const o = {}; em.cols.forEach((c) => (o[c] = k[c])); return o; });
    }
  }
}

export default handler(['POST'], async (req, res) => {
  const b = await readJson(req, 300000);
  const t = T[b.table];
  if (!t) return json(res, { error: { message: 'unknown table' } }, 400);
  const op = b.op || 'select';
  if (!t.ops.includes(op)) return json(res, { error: { message: 'operation not allowed' } }, 403);

  const admin = await adminEmail(req).catch((e) => { if (e.code === 'not_configured' && op === 'select' && t.pub) return null; throw e; });
  const isPublic = !admin;
  if (isPublic && !(op === 'select' && t.pub)) return json(res, { error: { message: 'unauthorized', code: 'unauthorized' } }, 401);

  try {
    const params = [];
    const visible = isPublic ? t.pub.cols : t.cols;

    if (op === 'select') {
      const sel = parseSelect(t, b.select, visible);
      if (isPublic && sel.embeds.length) bad('bad_embed');
      const cols = [...new Set([...sel.cols, ...(sel.embeds.length ? [t.pk] : [])])];
      const where = whereSql(t, b.filters, params, visible);
      if (isPublic) where.push(t.pub.where);
      let sql = `select ${cols.map(ident).join(',')} from ${ident(b.table)}`;
      if (where.length) sql += ` where ${where.join(' and ')}`;
      if (b.order) {
        const [col, asc] = b.order;
        if (!visible.includes(col)) bad('bad_column');
        sql += ` order by ${ident(col)} ${asc === false ? 'desc' : 'asc'}`;
      }
      const lim = Math.min(Number(b.limit) || 1000, 1000);
      sql += ` limit ${lim}`;
      const rows = await q(sql, params);
      await attachEmbeds(rows, sel.embeds, t);
      if (!sel.cols.includes(t.pk) && sel.embeds.length) rows.forEach((r) => delete r[t.pk]);
      return json(res, { data: rows });
    }

    const ret = b.returning ? parseSelect(t, b.returning, t.cols).cols : null;
    const retSql = ret ? ` returning ${ret.map(ident).join(',')}` : '';

    if (op === 'insert' || op === 'upsert') {
      const list = Array.isArray(b.values) ? b.values : [b.values];
      if (!list.length || list.length > 200) bad('bad_values');
      const out = [];
      for (const row of list) {
        const keys = cleanRow(t, row);
        const vals = keys.map((k) => valueSql(t, k, row[k], params));
        let sql = `insert into ${ident(b.table)} (${keys.map(ident).join(',')}) values (${vals.join(',')})`;
        if (op === 'upsert') {
          const upd = keys.filter((k) => k !== t.pk);
          sql += upd.length ? ` on conflict (${ident(t.pk)}) do update set ${upd.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(',')}` : ` on conflict do nothing`;
          if (b.table === 'site_settings') sql = sql.replace(' do update set ', ' do update set "updated_at" = now(), ');
        }
        out.push(...(await q(sql + retSql, params.splice(0))));
      }
      return json(res, { data: ret ? out : null });
    }

    if (op === 'update') {
      const keys = cleanRow(t, b.values);
      const sets = keys.map((k) => `${ident(k)} = ${valueSql(t, k, b.values[k], params)}`);
      if (b.table === 'site_settings') sets.push('"updated_at" = now()');
      const where = whereSql(t, b.filters, params, t.cols);
      if (!where.length) bad('filter_required');
      const rows = await q(`update ${ident(b.table)} set ${sets.join(',')} where ${where.join(' and ')}${retSql}`, params);
      return json(res, { data: ret ? rows : null });
    }

    if (op === 'delete') {
      const where = whereSql(t, b.filters, params, t.cols);
      if (!where.length) bad('filter_required');
      const rows = await q(`delete from ${ident(b.table)} where ${where.join(' and ')}${retSql}`, params);
      return json(res, { data: ret ? rows : null });
    }
    return json(res, { error: { message: 'bad op' } }, 400);
  } catch (e) {
    if (e.bad) return json(res, { error: { message: e.message } }, 400);
    if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return json(res, { error: { message: e.message, code: e.code } }, 400); // postgres errors (constraint etc.)
    throw e;
  }
});
