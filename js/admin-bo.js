/* Back office: dashboard, orders, order page, customers and coupon usage.
   Reads from /api/reports (admin only). Uses the admin globals: sb, esc, money, when, STATUS, toast, setBar, pane, ICO.
   Days are Israel days; "revenue" counts paid orders only. */
const BO = {
  range: { preset: '30d', from: '', to: '' },
  orders: { q: '', status: 'all', coupon: '', delivery: '', fulfillment: '', sort: 'created_at', dir: 'desc', page: 0, customer: '' },
  customers: { q: '', sort: 'last', dir: 'desc', page: 0 },
  metric: 'revenue',
};
const BO_PAGE = 50;
const BO_TZ = 'Asia/Jerusalem';
const boDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: BO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const boAdd = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const boFmtDay = s => { const [y, m, d] = s.split('-'); return `${+d}.${+m}.${y.slice(2)}`; };
const boDate = d => d ? new Date(d).toLocaleDateString('he-IL', { timeZone: BO_TZ, day: 'numeric', month: 'numeric', year: '2-digit' }) : '';
const boWhen = d => d ? new Date(d).toLocaleString('he-IL', { timeZone: BO_TZ, day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const boMoney = n => { const v = Math.round(Number(n || 0) * 100) / 100; return '₪' + v.toLocaleString('he-IL', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
const boCompact = n => { n = Number(n) || 0; return Math.abs(n) >= 10000 ? '₪' + (n / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 }) + 'K' : boMoney(n); };
const boPhone = p => String(p || '').replace(/\D/g, '').replace(/^972/, '0');
const boWa = p => 'https://wa.me/' + boPhone(p).replace(/^0/, '972');
const boImg = (src, cls) => `<img class="${cls || 'bo-pimg'}" src="${esc(src ? (/^(https?:)?\/\//.test(src) || src.startsWith('/') ? src : '/' + src) : '/img/protein-stock-sports-nutrition-e-commerce-logo.webp')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/img/protein-stock-sports-nutrition-e-commerce-logo.webp'">`;
const FUL = { pending: 'ממתינה לטיפול', processing: 'בטיפול', shipped: 'נשלחה', completed: 'הושלמה', cancelled: 'בוטלה' };
const boFul = f => f ? `<span class="badge ful-${esc(f)}">${esc(FUL[f] || f)}</span>` : '';
const boSrc = o => o.source === 'zappy' ? '<span class="bo-src" title="הזמנה מהחנות הקודמת ב-Zappy">Zappy</span>' : '';
const boBadge = s => `<span class="badge ${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const BO_PRESETS = [['today', 'היום'], ['yesterday', 'אתמול'], ['7d', '7 הימים האחרונים'], ['30d', '30 הימים האחרונים'], ['90d', '90 הימים האחרונים'], ['month', 'החודש הנוכחי'], ['lastmonth', 'החודש הקודם'], ['year', 'השנה הנוכחית'], ['all', 'כל הזמנים'], ['custom', 'טווח מותאם…']];
const BO_ICO = {
  home: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16.5V9l6.5-5.5L16.5 9v7.5h-4.5v-4.5h-4v4.5z"/></svg>',
  customers: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.3.6 2.2 2 2.5 4.2"/></svg>',
  couponUse: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16.5h13"/><path d="M5.5 13.5v-4M10 13.5v-8M14.5 13.5v-6"/></svg>',
  inventory: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5l7 3.5v8l-7 3.5-7-3.5v-8z"/><path d="M3 6l7 3.5L17 6M10 9.5v8"/></svg>',
  abandoned: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h2l2 9h9l1.5-6.5H6"/><circle cx="8" cy="16" r="1"/><circle cx="14" cy="16" r="1"/><path d="M10.5 7.5l3 3M13.5 7.5l-3 3"/></svg>',
  dns: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2.2 2.2 2.2 12.8 0 15M10 2.5c-2.2 2.2-2.2 12.8 0 15"/></svg>',
  leads: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h14v9H7l-4 3z"/><path d="M6.5 8h7M6.5 10.5h4"/></svg>',
  print: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 7.5v-4h9v4M5.5 13.5h-2v-6h13v6h-2"/><path d="M5.5 11.5h9v5h-9z"/></svg>',
  dl: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 15.5h12"/></svg>',
};

/* ---------- data ---------- */
async function boApi(action, params) {
  if (window.PSDB && (await PSDB.mode()) === 'sb') {   // no server database yet: same reports from Supabase (admin_report)
    const { data, error } = await PSDB.rpc('admin_report', { p: { action, ...params } });
    if (error) return { error: /unauthorized|42501|JWT/i.test(error.message || '') ? 'ההתחברות פגה. התנתקו והתחברו שוב.' : error.message };
    return { data };
  }
  let r;
  try {
    r = await fetch('/api/reports', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...params }) });
  } catch (e) { return { error: 'אין חיבור לשרת' }; }
  let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
  if (r.status === 401) return { error: 'ההתחברות פגה. התנתקו והתחברו שוב.' };
  if (r.status === 503) return { error: 'מסד הנתונים עדיין לא מחובר לשרת (DATABASE_URL).' };
  if (!r.ok || j.error) return { error: (j.error && (j.error.message || j.error)) || 'שגיאת שרת (' + r.status + ')' };
  return { data: j.data };
}
function boRange() {
  const R = BO.range, today = boDay(new Date());
  const ym = today.slice(0, 7);
  const lm = boAdd(ym + '-01', -1);
  const m = {
    today: [today, today], yesterday: [boAdd(today, -1), boAdd(today, -1)], '7d': [boAdd(today, -6), today], '30d': [boAdd(today, -29), today],
    '90d': [boAdd(today, -89), today], month: [ym + '-01', today], lastmonth: [lm.slice(0, 7) + '-01', lm], year: [today.slice(0, 4) + '-01-01', today],
    all: ['2024-01-01', today],
  }[R.preset];
  if (m) { R.from = m[0]; R.to = m[1]; }
  if (!R.from || !R.to) { R.from = boAdd(today, -29); R.to = today; }
  if (R.to < R.from) [R.from, R.to] = [R.to, R.from];
  return { from: R.from, to: R.to };
}
const boRangeLabel = () => { const { from, to } = boRange(); const p = BO_PRESETS.find(x => x[0] === BO.range.preset); return BO.range.preset !== 'custom' && p ? p[1] : from === to ? boFmtDay(from) : `${boFmtDay(from)} – ${boFmtDay(to)}`; };

/* range picker: a select of presets plus two date fields for a custom range */
function boRangeHtml(id) {
  const { from, to } = boRange();
  return `<div class="bo-range" id="${id}"><select aria-label="טווח תאריכים" data-r="preset">${BO_PRESETS.map(([k, v]) => `<option value="${k}"${k === BO.range.preset ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <span class="bo-cust"${BO.range.preset === 'custom' ? '' : ' hidden'}><input type="date" data-r="from" value="${from}" aria-label="מתאריך" max="${boDay(new Date())}"><span>עד</span><input type="date" data-r="to" value="${to}" aria-label="עד תאריך" max="${boDay(new Date())}"></span>
    <span class="bo-rl">${BO.range.preset === 'custom' ? '' : esc(boFmtDay(from) + (from === to ? '' : ' – ' + boFmtDay(to)))}</span></div>`;
}
function boBindRange(id, redraw) {
  const el = document.getElementById(id); if (!el) return;
  el.querySelector('[data-r=preset]').onchange = e => { BO.range.preset = e.target.value; if (e.target.value !== 'custom') redraw(); else { el.querySelector('.bo-cust').hidden = false; el.querySelector('.bo-rl').textContent = ''; } };
  el.querySelectorAll('input[type=date]').forEach(i => i.onchange = () => {
    const f = el.querySelector('[data-r=from]').value, t = el.querySelector('[data-r=to]').value;
    if (f && t) { BO.range.from = f; BO.range.to = t; redraw(); }
  });
}
const boLoading = t => `<div class="sp-card"><p class="sp-empty">${esc(t || 'טוען…')}</p></div>`;
const boError = m => `<div class="msg err">${esc(m)}</div>`;

/* ---------- dashboard ---------- */
/* small helpers for the dashboard's motion: numbers count up, live refresh, skeletons */
const BO_TILE_ICO = {
  paid: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.5l1-3h11l1 3"/><path d="M3.5 6.5v10h13v-10"/><path d="M7.5 10.5l2 2 3.5-4"/></svg>',
  aov: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M12.5 7.5h-3.2a1.6 1.6 0 0 0 0 3.2h1.4a1.6 1.6 0 0 1 0 3.2H7.5M10 6v1.5M10 13.9v1.5"/></svg>',
  customers: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.3.6 2.2 2 2.5 4.2"/></svg>',
  coupon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7V5.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1V7a3 3 0 0 0 0 6v1.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V13a3 3 0 0 0 0-6z"/><path d="M8 12.5l4-5"/></svg>',
  pending: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/></svg>',
  lost: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M7.5 7.5l5 5M12.5 7.5l-5 5"/></svg>',
  stock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5l7 3.5v8l-7 3.5-7-3.5v-8z"/><path d="M3 6l7 3.5L17 6M10 9.5v8"/></svg>',
  cart: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h2l2 9h9l1.5-6.5H6"/><circle cx="8" cy="16" r="1"/><circle cx="14" cy="16" r="1"/></svg>',
};
function boCountUp(root) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = Number(el.dataset.count) || 0, fmt = el.dataset.fmt === 'money' ? boMoney : v => Math.round(v).toLocaleString('he-IL');
    if (reduce || !to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(el.dataset.fmt === 'money' ? to * e : Math.round(to * e)); if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to); };
    requestAnimationFrame(step);
  });
}
const boSkel = () => `<div class="bo-skel-wrap"><div class="bo-skel bo-skel-hero"></div><div class="bo-tiles bo-tiles4">${'<div class="bo-skel bo-skel-tile"></div>'.repeat(4)}</div><div class="bo-skel bo-skel-card"></div></div>`;
const boGreet = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: BO_TZ, hour: 'numeric', hour12: false }).format(new Date())); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב'; };
let boLiveTimer = null;
function boLive() {   // refresh the dashboard every 60 seconds while it is open and visible
  clearInterval(boLiveTimer);
  boLiveTimer = setInterval(() => { if (boCur.view !== 'home' || document.hidden || !document.getElementById('bo-body')) return; boHome({ silent: true }); }, 60000);
}

async function boHome(opt = {}) {
  const silent = !!opt.silent && !!document.getElementById('bo-body');
  if (!silent) {
    setBar('home', 'לוח בקרה', `<button class="btn" id="bo-csv-h">${ICO.dl}ייצוא הזמנות</button>`);
    document.getElementById('bo-csv-h').onclick = () => { const { from, to } = boRange(); boExportOrders({ from, to }); };
    document.getElementById('panel').classList.add('gray');
    const R = pane();
    const now = new Date().toLocaleDateString('he-IL', { timeZone: BO_TZ, weekday: 'long', day: 'numeric', month: 'long' });
    R.innerHTML = `<div class="bo-hello"><div><h1>${boGreet()} 👋</h1><p>${esc(now)} · <span class="bo-live" title="הנתונים מתעדכנים כל דקה"><i></i>מתעדכן בזמן אמת</span> <span class="bo-upd" id="bo-upd"></span></p></div>${boRangeHtml('bo-r')}</div><div id="bo-body">${boSkel()}</div>`;
    boBindRange('bo-r', () => boHome());
  }
  const { from, to } = boRange();
  const [{ data, error }, inv, ab] = await Promise.all([
    boApi('summary', { from, to }),
    sb.from('products').select('quantity,low_stock_threshold,status').then(r => r, () => ({ data: null })),
    (window.PSDB && PSDB.mode ? PSDB.mode().then(m => (m === 'sb' ? PSDB.rpc('admin_abandoned', { p: { show: 'open' } }) : { data: null })) : Promise.resolve({ data: null })).catch(() => ({ data: null })),
  ]);
  const body = document.getElementById('bo-body'); if (!body) return;
  if (error) { if (!silent) body.innerHTML = boError(error); return; }
  // new orders since the last look -> a toast
  const nums = new Set((data.recent || []).map(o => o.number));
  if (BO.seen && silent) { const fresh = (data.recent || []).filter(o => !BO.seen.has(o.number)); if (fresh.length) toast(`🎉 הזמנה חדשה: ${fresh[0].customer_name} · ${boMoney(fresh[0].total)}`); }
  BO.seen = nums;
  const upd = document.getElementById('bo-upd'); if (upd) upd.textContent = 'עודכן ' + new Date().toLocaleTimeString('he-IL', { timeZone: BO_TZ, hour: '2-digit', minute: '2-digit' });
  if (silent) { const y = document.getElementById('panel').scrollTop; boHomeRender(body, data, inv, ab, true); document.getElementById('panel').scrollTop = y; }
  else { boHomeRender(body, data, inv, ab, false); boLive(); if (window.PK) PK.offer(body); }
}

function boHomeRender(body, data, inv, ab, silent) {
  const k = data.kpi, p = data.prev;
  const aov = k.paid_orders ? k.revenue / k.paid_orders : 0, paov = p.paid_orders ? p.revenue / p.paid_orders : 0;
  const delta = (a, b, goodUp = true) => {
    a = Number(a) || 0; b = Number(b) || 0;
    if (!b && !a) return '';
    if (!b) return '<span class="bo-d new">חדש</span>';
    const pct = Math.round(((a - b) / b) * 100);
    if (!pct) return '<span class="bo-d">ללא שינוי</span>';
    const good = (pct > 0) === goodUp;
    return `<span class="bo-d ${good ? 'up' : 'down'}" title="לעומת ${esc(boFmtDay(p.from))}–${esc(boFmtDay(p.to))}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  };
  const cnt = (v, money) => `<span data-count="${Number(v) || 0}" data-fmt="${money ? 'money' : 'int'}">${money ? boMoney(silent ? v : 0) : (silent ? Number(v).toLocaleString('he-IL') : '0')}</span>`;
  const tile = (label, value, d, sub, go, ico, tone) => `<button class="bo-tile bo-tile-i" ${go ? `data-go="${esc(go)}"` : 'disabled'}><span class="bo-ti ${tone || ''}">${BO_TILE_ICO[ico] || ''}</span><span class="bo-tl">${label}</span><span class="bo-tv">${value}</span><span class="bo-ts">${d || ''}${sub ? `<span>${sub}</span>` : ''}</span></button>`;
  const P = (inv && inv.data) || [];
  const low = P.filter(x => x.status !== 'archived' && x.quantity != null && x.quantity > 0 && x.low_stock_threshold != null && x.quantity <= x.low_stock_threshold).length;
  const out = P.filter(x => x.status !== 'archived' && x.quantity != null && x.quantity <= 0).length;
  const abd = ab && ab.data;
  const maxP = Math.max(1, ...data.products.map(x => Number(x.revenue)));
  const maxC = Math.max(1, ...data.coupons.map(x => x.uses));
  const st = Object.fromEntries(data.statuses.map(s => [s.status, s]));
  const allN = data.statuses.reduce((s, x) => s + x.n, 0);
  body.innerHTML = `
    <section class="bo-hero2"><div class="bo-hero2-main"><div class="bo-hl">הכנסות מהזמנות ששולמו · ${esc(boRangeLabel())}</div>
        <div class="bo-hv">${cnt(k.revenue, true)}</div><div class="bo-hs">${delta(k.revenue, p.revenue)}<span>תקופה קודמת: ${boMoney(p.revenue)}</span></div></div>
      <div class="bo-hero2-mini">
        <button class="bo-mini" data-go="paid"><span>הזמנות ששולמו</span><b>${cnt(k.paid_orders)}</b>${delta(k.paid_orders, p.paid_orders)}</button>
        <button class="bo-mini" data-go="paid"><span>ממוצע להזמנה</span><b>${cnt(aov, true)}</b>${delta(aov, paov)}</button>
        <button class="bo-mini" data-go="customers"><span>לקוחות שקנו</span><b>${cnt(k.customers)}</b><small>${k.new_customers} חדשים</small></button></div></section>
    <section class="sp-card sp-pad bo-chart-card">
      <div class="bo-chart-h"><div class="tb" role="tablist" aria-label="מה להציג בגרף"><button role="tab" data-m="revenue" aria-selected="${BO.metric === 'revenue'}">הכנסות</button><button role="tab" data-m="paid" aria-selected="${BO.metric === 'paid'}">הזמנות ששולמו</button><button role="tab" data-m="orders" aria-selected="${BO.metric === 'orders'}">כל ההזמנות</button></div>
        <button class="btn link" id="bo-tbl" aria-expanded="false">הצגה כטבלה</button></div>
      <div class="bo-chart" id="bo-chart"></div><div id="bo-ctbl" hidden></div></section>
    <div class="bo-tiles bo-tiles-dash">
      ${tile('ממתינות לתשלום', cnt(k.pending_orders), '', `בשווי ${boMoney(k.pending_value)}`, 'pending', 'pending', 't-amber')}
      ${tile('הנחות בקופונים', cnt(k.discounts, true), delta(k.discounts, p.discounts, false), `${k.coupon_orders} הזמנות עם קופון`, 'couponUse', 'coupon', 't-violet')}
      ${tile('מלאי נמוך', cnt(low), out ? `<span class="bo-d down">${out} אזלו</span>` : '', 'בסף ההתראה או מתחתיו', 'inventory', 'stock', 't-rose')}
      ${abd ? tile('עגלות נטושות', cnt(abd.open), '', `בשווי ${boMoney(abd.open_value)}`, 'abandoned', 'cart', 't-sky') : tile('נכשלו / בוטלו', cnt(k.lost_orders), '', '', 'lost', 'lost', 't-rose')}
    </div>
    <div class="bo-grid2">
      <section class="sp-card"><div class="bo-ch"><h2>מוצרים מובילים</h2><span class="mute">לפי הכנסה, הזמנות ששולמו</span></div>
        ${data.products.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>מוצר</th><th class="num">יחידות</th><th class="num">הכנסה</th></tr></thead><tbody>
        ${data.products.map(x => `<tr data-q="${esc(x.title)}"><td><div class="bo-name">${esc(x.title)}</div><div class="bo-meter"><i style="width:${(Number(x.revenue) / maxP) * 100}%"></i></div></td><td class="num">${x.qty}</td><td class="num">${boMoney(x.revenue)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sp-empty">אין מכירות בתקופה הזו.</p>'}</section>
      <section class="sp-card"><div class="bo-ch"><h2>קופונים מובילים</h2><button class="btn link" data-go="couponUse">לדוח המלא</button></div>
        ${data.coupons.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>קוד</th><th class="num">שימושים</th><th class="num">הנחה</th><th class="num">הכנסה</th></tr></thead><tbody>
        ${data.coupons.map(x => `<tr data-coupon="${esc(x.code)}"><td><div class="bo-name" dir="ltr">${esc(x.code)}</div><div class="bo-meter"><i style="width:${(x.uses / maxC) * 100}%"></i></div></td><td class="num">${x.uses}</td><td class="num">${boMoney(x.discount)}</td><td class="num">${boMoney(x.revenue)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sp-empty">לא נעשה שימוש בקופונים בתקופה הזו.</p>'}</section>
    </div>
    <section class="sp-card"><div class="bo-ch"><h2>הזמנות אחרונות</h2><span class="bo-stat">${Object.keys(STATUS).filter(s => st[s]).map(s => `${boBadge(s)} ${st[s].n}`).join(' ')}${allN ? '' : ''}</span><button class="btn link" data-go="all">לכל ההזמנות</button></div>
      ${data.recent.length ? boOrdersTable(data.recent, { compact: true }) : '<p class="sp-empty">אין הזמנות בתקופה הזו.</p>'}</section>`;
  boChart(data.series, !silent);
  if (!silent) boCountUp(body);
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { BO.metric = b.dataset.m; body.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-selected', x === b)); boChart(data.series, true); });
  document.getElementById('bo-tbl').onclick = e => { const t = document.getElementById('bo-ctbl'); t.hidden = !t.hidden; e.target.setAttribute('aria-expanded', !t.hidden); e.target.textContent = t.hidden ? 'הצגה כטבלה' : 'הסתרת הטבלה'; };
  body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const g = b.dataset.go, O = BO.orders;
    if (g === 'customers') return boGo('customers');
    if (g === 'couponUse') return boGo('couponUse');
    if (g === 'inventory') { BO.inv = { tab: 'low', q: '' }; return boGo('inventory'); }
    if (g === 'abandoned') return boGo('abandoned');
    Object.assign(O, { q: '', coupon: '', delivery: '', customer: '', page: 0, status: g === 'lost' ? 'failed,cancelled,refunded' : g === 'all' ? 'all' : g });
    boGo('orders');
  });
  body.querySelectorAll('tr[data-coupon]').forEach(tr => tr.onclick = () => boCoupon(tr.dataset.coupon));
  body.querySelectorAll('tr[data-q]').forEach(tr => tr.onclick = () => { Object.assign(BO.orders, { q: tr.dataset.q, status: 'paid', coupon: '', delivery: '', customer: '', page: 0 }); boGo('orders'); });
  boBindOrderRows(body);
}

/* columns chart, one series: revenue / paid orders / all orders per day (weeks or months on long ranges) */
function boChart(series, animate) {
  const host = document.getElementById('bo-chart'); if (!host) return;
  const m = BO.metric, isMoney = m === 'revenue';
  let unit = 'day', pts = series.map(s => ({ key: s.day, label: boFmtDay(s.day), v: Number(s[m]) || 0, revenue: Number(s.revenue), paid: s.paid, orders: s.orders }));
  const bucket = (keyOf, labelOf) => { const map = new Map(); series.forEach(s => { const k = keyOf(s.day); const o = map.get(k) || { key: k, label: labelOf(s.day), v: 0, revenue: 0, paid: 0, orders: 0 }; o.v += Number(s[m]) || 0; o.revenue += Number(s.revenue); o.paid += s.paid; o.orders += s.orders; map.set(k, o); }); return [...map.values()]; };
  if (series.length > 400) { unit = 'month'; pts = bucket(d => d.slice(0, 7), d => d.slice(5, 7) + '/' + d.slice(2, 4)); }
  else if (series.length > 62) {
    unit = 'week';
    const wk = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); };
    pts = bucket(wk, d => 'שבוע ' + boFmtDay(wk(d)));
  }
  const W = Math.max(280, host.clientWidth || 600), H = 220, padT = 12, padB = 26, padS = 46, plotW = W - padS - 8, plotH = H - padT - padB;
  const max = Math.max(...pts.map(p => p.v), 0);
  const nice = v => { if (v <= 0) return isMoney ? 100 : 4; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
  const top = isMoney ? nice(max) : Math.max(4, Math.ceil(max / 4) * 4);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => top * f);
  const slot = plotW / pts.length, bw = Math.max(2, Math.min(24, slot - 4));
  const y = v => padT + plotH - (v / top) * plotH;
  // RTL page, but time runs left→right in the chart like every Hebrew analytics tool; the axis labels sit on the left.
  const x = i => padS + i * slot + (slot - bw) / 2;
  const fmtTick = v => isMoney ? (v >= 10000 ? (v / 1000) + 'K' : v.toLocaleString('he-IL')) : String(Math.round(v));
  const every = Math.ceil(pts.length / Math.max(2, Math.floor(plotW / 64)));
  const bar = (p, i) => {
    if (!p.v) return '';
    const h = Math.max(2, plotH - (y(p.v) - padT)), x0 = x(i), y0 = padT + plotH - h, r = Math.min(4, bw / 2, h);
    return `<path d="M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y0 + h}Z" class="bo-bar" style="--i:${i}"/>`;
  };
  host.innerHTML = `<svg class="${animate ? 'bo-anim' : ''}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${isMoney ? 'הכנסות' : 'הזמנות'} לפי ${unit === 'day' ? 'יום' : unit === 'week' ? 'שבוע' : 'חודש'}">
    ${ticks.map(t => `<line x1="${padS}" x2="${W - 8}" y1="${y(t)}" y2="${y(t)}" class="${t ? 'bo-grid' : 'bo-base'}"/><text x="${padS - 6}" y="${y(t) + 4}" text-anchor="end" class="bo-ax">${fmtTick(t)}</text>`).join('')}
    ${pts.map(bar).join('')}
    ${pts.map((p, i) => i % every === 0 ? `<text x="${x(i) + bw / 2}" y="${H - 8}" text-anchor="middle" class="bo-ax">${esc(unit === 'week' ? boFmtDay(p.key).slice(0, -3) : p.label.replace(/\.\d\d$/, ''))}</text>` : '').join('')}
    <g id="bo-hit">${pts.map((p, i) => `<rect x="${padS + i * slot}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent" data-i="${i}"/>`).join('')}</g>
    <line id="bo-cross" y1="${padT}" y2="${padT + plotH}" class="bo-cross" hidden/></svg><div class="bo-tip" id="bo-tip" hidden></div>`;
  const tip = host.querySelector('#bo-tip'), cross = host.querySelector('#bo-cross');
  const show = i => {
    const p = pts[i]; if (!p) return;
    const cx = padS + i * slot + slot / 2;
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.removeAttribute('hidden');
    tip.innerHTML = `<b>${esc(unit === 'day' ? boFmtDay(p.key) : p.label)}</b><div><span>הכנסות</span>${boMoney(p.revenue)}</div><div><span>שולמו</span>${p.paid}</div><div><span>כל ההזמנות</span>${p.orders}</div>`;
    tip.hidden = false;
    const left = Math.min(Math.max(cx - tip.offsetWidth / 2, 0), W - tip.offsetWidth);
    tip.style.left = left + 'px';
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('hidden', ''); };
  host.querySelectorAll('#bo-hit rect').forEach(r => { r.onmouseenter = () => show(+r.dataset.i); r.ontouchstart = () => show(+r.dataset.i); });
  host.querySelector('svg').onmouseleave = hide;
  const tbl = document.getElementById('bo-ctbl');
  if (tbl) tbl.innerHTML = `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>${unit === 'day' ? 'יום' : unit === 'week' ? 'שבוע' : 'חודש'}</th><th class="num">הכנסות</th><th class="num">הזמנות ששולמו</th><th class="num">כל ההזמנות</th></tr></thead><tbody>${pts.slice().reverse().map(p => `<tr><td>${esc(unit === 'day' ? boFmtDay(p.key) : p.label)}</td><td class="num">${boMoney(p.revenue)}</td><td class="num">${p.paid}</td><td class="num">${p.orders}</td></tr>`).join('')}</tbody></table></div>`;
  host.__w = W; host.__series = series;
  // redraw only when the card really changes width (window resize), never in response to our own redraw
  if (!host.__ro) {
    host.__ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      if (!w || Math.abs(w - (host.__w || 0)) < 8) return;
      clearTimeout(host.__t); host.__t = setTimeout(() => boChart(host.__series), 150);
    });
    host.__ro.observe(host);
  }
}

/* ---------- orders ---------- */
function boOrdersTable(rows, opt = {}) {
  const O = BO.orders;
  const th = (k, label, cls = '') => opt.compact ? `<th class="${cls}">${label}</th>` : `<th class="${cls}"><button class="bo-sort" data-sort="${k}" aria-sort="${O.sort === k ? (O.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}${O.sort === k ? (O.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<div class="sp-tw"><table class="sp-table bo-t bo-orders"><thead><tr>${th('number', 'הזמנה')}<th>סטטוס הזמנה</th>${th('created_at', 'תאריך')}${opt.noCustomer ? '' : th('customer_name', 'לקוח')}<th class="hm">פריטים</th>${th('discount', 'קופון')}<th>תשלום</th>${th('paid_at', 'שולם ב-', 'hm')}${th('total', 'סה"כ', 'num')}</tr></thead><tbody>
    ${rows.map(o => `<tr data-order="${esc(o.id)}" tabindex="0"><td class="bo-num"><span dir="ltr">${esc(o.number)}</span>${boSrc(o)}</td><td class="bo-stc">${boStatusSelect(o)}</td><td class="mute bo-nw">${boWhen(o.created_at)}</td>
      ${opt.noCustomer ? '' : `<td><div class="bo-name">${esc(o.customer_name)}</div><div class="mute" dir="ltr" style="text-align:end">${esc(o.phone)}</div></td>`}
      <td class="hm mute">${(o.thumbs || []).length ? `<span class="bo-thumbs">${o.thumbs.map(t => boImg(t, 'bo-th')).join('')}</span>` : ''}${o.items != null ? o.items + ' יח׳' : ''}${o.delivery === 'pickup' ? '<div>איסוף עצמי</div>' : ''}</td>
      <td>${o.coupon_code ? `<span class="bo-code" dir="ltr">${esc(o.coupon_code)}</span><div class="neg">−${boMoney(o.discount)}</div>` : '<span class="mute">—</span>'}</td>
      <td>${boBadge(o.status)}${o.payment_provider ? `<div class="mute">${esc(o.payment_provider === 'payplus' ? 'PayPlus' : o.payment_provider)}</div>` : ''}</td>
      <td class="hm mute bo-nw">${o.paid_at ? boWhen(o.paid_at) : '—'}</td><td class="num"><b>${boMoney(o.total)}</b></td></tr>`).join('')}
  </tbody></table></div>`;
}
/* one "order status" per order, changeable right in the list: pending → processing → shipped → completed, or cancelled.
   Cancelling also cancels the payment status, which returns the items to stock (and the coupon use, if it was paid). */
const BO_CLOSED = ['cancelled', 'refunded', 'failed'];
const boDenied = (error) => /permission denied|not allowed|row-level security|bad_column|bad op/i.test(String(error && error.message || ''));
/* Cancel an order. If the database does not let the admin change the payment status (the legacy Supabase
   grants allow only fulfillment), an unpaid order is still marked cancelled through its order status. */
async function boCancelOrder(id, pay) {
  let { error } = await sb.from('orders').update({ fulfillment: 'cancelled', status: 'cancelled' }).eq('id', id);
  if (error && boDenied(error) && pay !== 'paid') {
    ({ error } = await sb.from('orders').update({ fulfillment: 'cancelled' }).eq('id', id));
    if (!error) return { partial: true };
  }
  return { error };
}
/* Delete an order that was never paid (abandoned checkout, test order). Paid orders are never deleted. */
async function boDeleteOrder(id, num, pay) {
  if (pay === 'paid' || pay === 'refunded') { toast('הזמנה ששולמה לא נמחקת — אפשר לבטל אותה'); return false; }
  if (!confirm(`למחוק לגמרי את הזמנה ${num}?\nההזמנה לא שולמה. הפעולה לא ניתנת לביטול.`)) return false;
  const { error } = await sb.from('orders').delete().eq('id', id).neq('status', 'paid');
  if (error) {
    toast(boDenied(error) ? 'המחיקה עוד לא מאושרת במסד הנתונים — אפשר לסמן את ההזמנה כמבוטלת בינתיים' : 'המחיקה נכשלה: ' + error.message);
    return false;
  }
  toast(`הזמנה ${num} נמחקה`);
  return true;
}
const boOrderStatus = o => BO_CLOSED.includes(o.status) ? o.status : (o.fulfillment || 'pending');
function boStatusSelect(o) {
  const cur = boOrderStatus(o);
  if (BO_CLOSED.includes(o.status)) return `<span class="badge ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span>`;
  return `<select class="bo-stsel ful-${esc(cur)}" data-st-id="${esc(o.id)}" data-st-num="${esc(o.number)}" data-st-pay="${esc(o.status)}" data-st-cur="${esc(cur)}" aria-label="סטטוס הזמנה ${esc(o.number)}">${Object.entries(FUL).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
}
async function boChangeStatus(sel) {
  const next = sel.value, prev = sel.dataset.stCur, id = sel.dataset.stId, num = sel.dataset.stNum, pay = sel.dataset.stPay;
  if (next === prev) return;
  let values = { fulfillment: next };
  if (next === 'cancelled') {
    if (!confirm(`לבטל את הזמנה ${num}? המוצרים יחזרו למלאי${pay === 'paid' ? '. אם הלקוח שילם, צריך לבצע לו זיכוי בנפרד ב-PayPlus' : ''}.`)) { sel.value = prev; return; }
  }
  sel.disabled = true;
  const r = next === 'cancelled' ? await boCancelOrder(id, pay) : await sb.from('orders').update(values).eq('id', id);
  const error = r.error;
  sel.disabled = false;
  if (error) { sel.value = prev; toast('השמירה נכשלה: ' + error.message); return; }
  toast(`הזמנה ${num}: ${FUL[next]}`);
  if (r.partial) { sel.dataset.stCur = next; sel.className = 'bo-stsel ful-' + next; return; }
  if (next === 'cancelled') { const td = sel.closest('td'); const row = sel.closest('tr'); td.innerHTML = `<span class="badge cancelled">${esc(STATUS.cancelled)}</span>`; const b = row && row.querySelector('.badge.' + pay); if (b) { b.className = 'badge cancelled'; b.textContent = STATUS.cancelled; } return; }
  sel.dataset.stCur = next; sel.className = 'bo-stsel ful-' + next;
}
function boBindOrderRows(root) {
  root.querySelectorAll('tr[data-order]').forEach(tr => {
    tr.onclick = e => { if (e.target.closest('.bo-stc')) return; boOrder(tr.dataset.order); };
    tr.onkeydown = e => { if (e.target.closest('.bo-stc')) return; if (e.key === 'Enter') boOrder(tr.dataset.order); };
  });
  root.querySelectorAll('select.bo-stsel').forEach(s => { s.onchange = () => boChangeStatus(s); });
}

async function boOrders() {
  setBar('orders', 'הזמנות', `<button class="btn" id="bo-csv">${ICO.dl}ייצוא ל-Excel</button>`);
  document.getElementById('panel').classList.add('gray');
  const O = BO.orders;
  const tabs = [['all', 'הכל'], ['paid', 'שולמו'], ['pending', 'ממתינות לתשלום'], ['failed,cancelled,refunded', 'נכשלו / בוטלו']];
  const R = pane();
  R.innerHTML = `<div class="bo-top">${boRangeHtml('bo-r')}</div>
    <div class="sp-card"><div class="sp-tabbar"><div class="tb" role="tablist">${tabs.map(([k, v]) => `<button role="tab" data-st="${k}" aria-selected="${O.status === k}">${v}</button>`).join('')}</div></div>
    <div class="bo-filters"><input type="search" id="bo-q" placeholder="חיפוש: מספר הזמנה, שם, טלפון, מייל, מוצר או קוד קופון" value="${esc(O.q)}" aria-label="חיפוש הזמנות">
      <select id="bo-cp" aria-label="קופון"><option value="">כל ההזמנות</option><option value="any"${O.coupon === 'any' ? ' selected' : ''}>עם קופון</option><option value="none"${O.coupon === 'none' ? ' selected' : ''}>בלי קופון</option>${O.coupon && !['any', 'none'].includes(O.coupon) ? `<option value="${esc(O.coupon)}" selected>קופון ${esc(O.coupon)}</option>` : ''}</select>
      <select id="bo-fl" aria-label="סטטוס משלוח"><option value="">כל סטטוסי המשלוח</option>${Object.entries(FUL).map(([k, v]) => `<option value="${k}"${O.fulfillment === k ? ' selected' : ''}>${v}</option>`).join('')}<option value="none"${O.fulfillment === 'none' ? ' selected' : ''}>ללא סטטוס משלוח</option></select>
      <select id="bo-dl" aria-label="משלוח"><option value="">משלוח ואיסוף</option><option value="shipping"${O.delivery === 'shipping' ? ' selected' : ''}>משלוח בלבד</option><option value="pickup"${O.delivery === 'pickup' ? ' selected' : ''}>איסוף עצמי בלבד</option></select></div>
    ${O.customer ? `<div class="bo-chipbar">מציג הזמנות של לקוח אחד <button class="btn link" id="bo-cx">הצגת כל הלקוחות</button></div>` : ''}
    <div id="bo-list">${'<p class="sp-empty">טוען הזמנות…</p>'}</div></div>`;
  boBindRange('bo-r', () => { O.page = 0; boOrders(); });
  R.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { O.status = b.dataset.st; O.page = 0; boOrders(); });
  let t; const qi = R.querySelector('#bo-q');
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { O.q = qi.value.trim(); O.page = 0; boOrdersLoad(); }, 300); };
  R.querySelector('#bo-cp').onchange = e => { O.coupon = e.target.value; O.page = 0; boOrdersLoad(); };
  R.querySelector('#bo-dl').onchange = e => { O.delivery = e.target.value; O.page = 0; boOrdersLoad(); };
  R.querySelector('#bo-fl').onchange = e => { O.fulfillment = e.target.value; O.page = 0; boOrdersLoad(); };
  const cx = R.querySelector('#bo-cx'); if (cx) cx.onclick = () => { O.customer = ''; O.page = 0; boOrders(); };
  document.getElementById('bo-csv').onclick = () => boExportOrders(boOrderParams());
  boOrdersLoad();
}
function boOrderParams() {
  const O = BO.orders, { from, to } = boRange();
  return { from, to, status: O.status, q: O.q, coupon: O.coupon, delivery: O.delivery, fulfillment: O.fulfillment, customer: O.customer, sort: O.sort, dir: O.dir };
}
async function boOrdersLoad() {
  const O = BO.orders, box = document.getElementById('bo-list'); if (!box) return;
  box.style.opacity = '.55';
  const { data, error } = await boApi('orders', { ...boOrderParams(), page: O.page, size: BO_PAGE });
  const el = document.getElementById('bo-list'); if (!el) return;
  el.style.opacity = '';
  if (error) { el.innerHTML = boError(error); return; }
  const pages = Math.max(1, Math.ceil(data.count / BO_PAGE));
  const s = data.sums;
  el.innerHTML = (data.rows.length ? boOrdersTable(data.rows) : '<p class="sp-empty">לא נמצאו הזמנות שמתאימות לסינון.</p>') +
    `<div class="bo-foot"><span>${data.count.toLocaleString('he-IL')} הזמנות · סה"כ ${boMoney(s.total)} · מתוכן שולמו ${boMoney(s.paid)} · ${s.with_coupon} עם קופון (הנחה ${boMoney(s.discount)})</span>
     ${pages > 1 ? `<span class="bo-pg"><button class="btn" id="bo-prev"${O.page ? '' : ' disabled'}>הקודם</button><span>עמוד ${O.page + 1} מתוך ${pages}</span><button class="btn" id="bo-next"${O.page < pages - 1 ? '' : ' disabled'}>הבא</button></span>` : ''}</div>`;
  boBindOrderRows(el);
  el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; if (O.sort === k) O.dir = O.dir === 'asc' ? 'desc' : 'asc'; else { O.sort = k; O.dir = k === 'customer_name' || k === 'number' ? 'asc' : 'desc'; } O.page = 0; boOrdersLoad(); });
  const pv = el.querySelector('#bo-prev'), nx = el.querySelector('#bo-next');
  if (pv) pv.onclick = () => { O.page--; boOrdersLoad(); document.getElementById('panel').scrollTop = 0; };
  if (nx) nx.onclick = () => { O.page++; boOrdersLoad(); document.getElementById('panel').scrollTop = 0; };
}

/* ---------- one order ---------- */
async function boOrder(id, back) {
  const from = back || boBack();
  setBar('orders', 'הזמנה', `<button class="btn" id="bo-print">${ICO.print}הדפסה</button>`);
  boBackBtn(from);
  document.getElementById('panel').classList.add('gray');
  boHash('order=' + id); boSel('orders');
  pane().innerHTML = boLoading('טוען הזמנה…');
  const { data, error } = await boApi('order', { id });
  if (error) { pane().innerHTML = boError(error); return; }
  const o = data.order;
  if (!o) { pane().innerHTML = boError('ההזמנה לא נמצאה.'); return; }
  document.getElementById('pb-t').textContent = 'הזמנה ' + o.number;
  const c = data.customer, ev = data.events;
  const paidLine = o.status === 'paid' ? `שולמה ${boWhen(o.paid_at)}${o.payment_provider ? ' דרך ' + esc(o.payment_provider === 'payplus' ? 'PayPlus' : o.payment_provider) : ' (סומנה ידנית)'}`
    : o.status === 'pending' ? (o.payment_provider ? 'נוצר דף תשלום, התשלום עוד לא אושר' : 'ממתינה לתשלום (ללא סליקה באתר — תיאום מול הלקוח)') : STATUS[o.status] || o.status;
  pane().innerHTML = `<div class="bo-oh"><span class="bo-num" dir="ltr">${esc(o.number)}</span>${boSrc(o)}${boBadge(o.status)}${boFul(o.fulfillment)}${o.coupon_code ? `<span class="bo-code" dir="ltr">${esc(o.coupon_code)}</span>` : ''}<span class="mute">${boWhen(o.created_at)}</span></div>
  <div class="sp-grid">
    <div>
      <section class="sp-card"><div class="bo-ch"><h2>פריטים</h2><span class="mute">${o.order_items.reduce((s, i) => s + i.qty, 0)} יחידות</span></div>
        <div class="sp-tw"><table class="sp-table bo-t bo-items"><thead><tr><th>מוצר</th><th class="num">מחיר</th><th class="num">כמות</th><th class="num">סה"כ</th></tr></thead><tbody>
        ${o.order_items.map(i => `<tr><td><div class="bo-line">${boImg(i.image)}<div><a class="bo-name" href="/product?id=${encodeURIComponent(i.product_id)}" target="_blank" rel="noopener">${esc(i.title)}</a><div class="mute" dir="ltr" style="text-align:end">${esc(i.product_id)}</div></div></div></td><td class="num">${boMoney(i.unit_price)}</td><td class="num">${i.qty}</td><td class="num">${boMoney(i.line_total)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="bo-sum"><div><span>סכום ביניים</span><b>${boMoney(o.subtotal)}</b></div>
          ${Number(o.discount) || o.coupon_code ? `<div><span>הנחת קופון <button class="bo-code" dir="ltr" data-coupon="${esc(o.coupon_code || '')}">${esc(o.coupon_code || '')}</button></span><b class="neg">−${boMoney(o.discount)}</b></div>` : ''}
          <div><span>${o.delivery === 'pickup' ? 'איסוף עצמי' : 'משלוח'}</span><b>${Number(o.shipping) ? boMoney(o.shipping) : 'חינם'}</b></div>
          <div class="bo-total"><span>סה"כ לתשלום</span><b>${boMoney(o.total)}</b></div></div></section>
      <section class="sp-card sp-pad"><h2>תשלום</h2>
        <div class="bo-kv"><div><span>מצב</span><b>${paidLine}</b></div>
          ${o.payment_provider ? `<div><span>ספק סליקה</span>${esc(o.payment_provider === 'payplus' ? 'PayPlus' : o.payment_provider)}</div>` : ''}
          ${o.payment_ref ? `<div><span>מזהה עסקה</span><code dir="ltr">${esc(o.payment_ref)}</code></div>` : ''}
          ${o.paid_at ? `<div><span>תאריך תשלום</span>${boWhen(o.paid_at)}</div>` : ''}</div>
        ${ev.length ? `<h3 class="bo-h3">אירועי סליקה</h3><ol class="bo-tl">${ev.map(e => `<li><b>${e.status_code === '000' ? 'תשלום אושר' : e.status_code ? 'תשלום נדחה (קוד ' + esc(e.status_code) + ')' : 'התקבלה הודעה מ-' + esc(e.provider)}</b> <span class="mute">${boWhen(e.received_at)}</span>
          <div class="mute">${e.amount ? 'סכום ' + boMoney(e.amount) + ' · ' : ''}${e.card_last4 ? 'כרטיס ••••' + esc(e.card_last4) + ' · ' : ''}${e.payments && +e.payments > 1 ? esc(e.payments) + ' תשלומים · ' : ''}${e.approval ? 'אישור ' + esc(e.approval) + ' · ' : ''}<span dir="ltr">${esc(e.event_id)}</span></div></li>`).join('')}</ol>` : ''}
        <div class="bo-st"><label for="bo-status">שינוי סטטוס</label><select id="bo-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <p class="mute bo-note">סימון "שולמה" ידני מתאים לתשלום בהעברה, בביט או במזומן. ביטול או החזרה מחזירים את הפריטים למלאי.</p>
        ${['paid', 'refunded'].includes(o.status) ? '' : `<button class="btn" id="bo-del" style="margin-top:10px;color:#c62828;border-color:#c62828">🗑 מחיקת ההזמנה (לא שולמה)</button>`}</section>
    </div>
    <div>
      <section class="sp-card sp-pad"><h2>לקוח</h2>
        <button class="bo-cust-l" id="bo-cust">${esc(o.customer_name)}</button>
        <div class="mute">${c.paid} הזמנות ששולמו · ${boMoney(c.spent)}${c.orders > 1 ? ` · לקוח מ-${boDate(c.first)}` : ' · לקוח חדש'}</div>
        <div class="bo-kv bo-kv1"><div><span>טלפון</span><a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a> · <a href="${esc(boWa(o.phone))}" target="_blank" rel="noopener">וואטסאפ</a></div>
          ${o.email ? `<div><span>אימייל</span><a href="mailto:${esc(o.email)}" dir="ltr">${esc(o.email)}</a></div>` : ''}
          <div><span>${o.delivery === 'pickup' ? 'מסירה' : 'כתובת למשלוח'}</span>${o.delivery === 'pickup' ? 'איסוף עצמי מהחנות' : esc(o.address || '—')}</div>
          ${o.notes ? `<div><span>הערות הלקוח</span>${esc(o.notes)}</div>` : ''}</div></section>
      <section class="sp-card sp-pad"><h2>משלוח</h2>
        <div class="bo-kv bo-kv1"><div><span>אופן מסירה</span>${o.delivery === 'pickup' ? 'איסוף עצמי' : esc(o.shipping_method || 'משלוח')}</div></div>
        <label class="fld" style="margin-top:10px"><span>סטטוס משלוח</span><select id="bo-ful"><option value="">—</option>${Object.entries(FUL).map(([k, v]) => `<option value="${k}"${k === o.fulfillment ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="fld"><span>מספר מעקב</span><input type="text" id="bo-trk" dir="ltr" maxlength="80" value="${esc(o.tracking_number || '')}" placeholder="למשל RR123456789IL"></label>
        <button class="btn pri" id="bo-ship-save">שמירה</button></section>
      <section class="sp-card sp-pad"><h2>ציר זמן</h2><ol class="bo-tl">
        <li><b>ההזמנה נוצרה</b> <span class="mute">${boWhen(o.created_at)}</span></li>
        ${ev.map(e => `<li><b>${e.status_code === '000' ? 'אישור תשלום מ-PayPlus' : 'הודעת סליקה'}</b> <span class="mute">${boWhen(e.received_at)}</span></li>`).join('')}
        ${o.paid_at ? `<li><b>סומנה כשולמה</b> <span class="mute">${boWhen(o.paid_at)}</span></li>` : ''}
        ${['failed', 'cancelled', 'refunded'].includes(o.status) ? `<li><b>${esc(STATUS[o.status])}</b></li>` : ''}</ol></section>
    </div>
  </div>`;
  const P = pane();
  document.getElementById('bo-print').onclick = () => window.print();
  P.querySelector('#bo-cust').onclick = () => boCustomer(boPhone(o.phone), o.customer_name, { view: 'order', id: o.id });
  P.querySelectorAll('[data-coupon]').forEach(b => b.onclick = () => b.dataset.coupon && boCoupon(b.dataset.coupon, { view: 'order', id: o.id }));
  P.querySelector('#bo-ship-save').onclick = async e => {
    const fulfillment = P.querySelector('#bo-ful').value || null, tracking_number = P.querySelector('#bo-trk').value.trim() || null;
    e.target.disabled = true;
    const { error } = await sb.from('orders').update({ fulfillment, tracking_number }).eq('id', o.id);
    e.target.disabled = false;
    if (error) { toast('השמירה נכשלה: ' + error.message); return; }
    toast('נשמר'); boOrder(o.id, from);
  };
  const sel = P.querySelector('#bo-status');
  sel.onchange = async () => {
    const next = sel.value, prev = o.status;
    if (['cancelled', 'refunded', 'failed'].includes(next) && !confirm(`לשנות את הזמנה ${o.number} ל"${STATUS[next]}"? הפריטים יחזרו למלאי${prev === 'paid' && o.coupon_code ? ' והשימוש בקופון יבוטל' : ''}.`)) { sel.value = prev; return; }
    sel.disabled = true;
    const { error } = next === 'cancelled' ? await boCancelOrder(o.id, prev) : await sb.from('orders').update({ status: next }).eq('id', o.id);
    sel.disabled = false;
    if (error) { sel.value = prev; toast('השמירה נכשלה: ' + error.message); return; }
    toast('הסטטוס עודכן'); boOrder(o.id, from);
  };
  const del = P.querySelector('#bo-del');
  if (del) del.onclick = async () => { del.disabled = true; if (await boDeleteOrder(o.id, o.number, o.status)) { BO.orders.page = 0; boOrders(); } else del.disabled = false; };
}

/* ---------- customers ---------- */
async function boCustomers() {
  setBar('customers', 'לקוחות', `<button class="btn" id="bo-ccsv">${ICO.dl}ייצוא ל-Excel</button>`);
  document.getElementById('panel').classList.add('gray');
  const C = BO.customers, R = pane();
  R.innerHTML = `<div class="sp-card"><div class="bo-filters"><input type="search" id="bo-cq" placeholder="חיפוש לפי שם, טלפון או אימייל" value="${esc(C.q)}" aria-label="חיפוש לקוחות"></div><div id="bo-clist"><p class="sp-empty">טוען לקוחות…</p></div></div>
    <p class="who">כל מי שביצע הזמנה מופיע כאן כמשתמש. לקוח מזוהה לפי מספר הטלפון; "חשבון פעיל" = נכנס לחשבון שלו באתר. הסכומים כוללים רק הזמנות ששולמו.</p>`;
  let t; const qi = R.querySelector('#bo-cq');
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { C.q = qi.value.trim(); C.page = 0; boCustomersLoad(); }, 300); };
  document.getElementById('bo-ccsv').onclick = boExportCustomers;
  boCustomersLoad();
  boUsersSection(R.querySelector('.sp-card'));
  boNewsSection(R);
}
/* site accounts (customers who signed in at /account), by email */
let boAccP = null;
const boAccounts = () => boAccP || (boAccP = (async () => {
  if (!(window.PSDB && (await PSDB.mode()) === 'sb')) return new Map();
  const { data } = await PSDB.rpc('ps_customer_accounts');
  return new Map(((data && data.accounts) || []).map(a => [a.email, a]));
})().catch(() => new Map()));
const boAccBadge = (acc, email) => { const a = email && acc.get(String(email).toLowerCase()); return a ? `<span class="bo-acc on" title="כניסה אחרונה: ${a.last_sign_in ? boDate(a.last_sign_in) : '—'}">חשבון פעיל</span>` : (email ? '<span class="bo-acc" title="יכול/ה להיכנס לחשבון עם המייל הזה">משתמש</span>' : ''); };
async function boUsersSection(host) {
  const acc = await boAccounts(); if (!host.isConnected) return;
  const rows = [...acc.values()].sort((a, b) => String(b.last_sign_in || b.created_at).localeCompare(String(a.last_sign_in || a.created_at)));
  const sec = document.createElement('div'); sec.className = 'sp-card'; sec.style.marginTop = '16px';
  sec.innerHTML = `<h2 class="bo-h2">משתמשים רשומים באתר <span class="mute">(${rows.length})</span></h2>
    <p class="who" style="margin:0 0 10px">לקוחות שנכנסו לחשבון שלהם באתר (proteinstock.co.il/account). כל מי שהזמין עם מייל יכול להיכנס, והחשבון מציג את כל ההזמנות שלו.</p>
    ${rows.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>מייל</th><th class="num">הזמנות</th><th>נרשם</th><th>כניסה אחרונה</th></tr></thead><tbody>
      ${rows.map(a => `<tr><td dir="ltr" style="text-align:end">${esc(a.email)}</td><td class="num">${a.orders}</td><td class="mute bo-nw">${boDate(a.created_at)}</td><td class="mute bo-nw">${a.last_sign_in ? boDate(a.last_sign_in) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sp-empty">עדיין אין לקוחות שנכנסו לחשבון.</p>'}`;
  host.after(sec);
}
async function boCustomersLoad() {
  const C = BO.customers, el = document.getElementById('bo-clist'); if (!el) return;
  el.style.opacity = '.55';
  const [{ data, error }, acc] = await Promise.all([boApi('customers', { q: C.q, sort: C.sort, dir: C.dir, page: C.page, size: BO_PAGE }), boAccounts()]);
  const box = document.getElementById('bo-clist'); if (!box) return;
  box.style.opacity = '';
  if (error) { box.innerHTML = boError(error); return; }
  const pages = Math.max(1, Math.ceil(data.count / BO_PAGE));
  const th = (k, label, cls = '') => `<th class="${cls}"><button class="bo-sort" data-sort="${k}">${label}${C.sort === k ? (C.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  box.innerHTML = (data.rows.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr>${th('name', 'לקוח')}<th class="hm">אימייל</th>${th('orders', 'הזמנות', 'num')}${th('spent', 'סה"כ קניות', 'num')}<th class="hm num">חסך בקופונים</th><th>קופונים</th>${th('first', 'לקוח מאז', 'hm')}${th('last', 'הזמנה אחרונה')}</tr></thead><tbody>
    ${data.rows.map(c => `<tr data-key="${esc(c.key)}" data-name="${esc(c.name)}" tabindex="0"><td><div class="bo-name">${esc(c.name)} ${boAccBadge(acc, c.email)}</div><div class="mute" dir="ltr" style="text-align:end">${esc(c.phone)}</div></td>
      <td class="hm mute" dir="ltr" style="text-align:end">${esc(c.email || '')}</td><td class="num">${c.paid}${c.orders > c.paid ? `<span class="mute"> / ${c.orders}</span>` : ''}</td><td class="num"><b>${boMoney(c.spent)}</b></td>
      <td class="hm num">${Number(c.saved) ? boMoney(c.saved) : '—'}</td><td>${(c.coupons || []).map(x => `<span class="bo-code" dir="ltr">${esc(x)}</span>`).join(' ') || '<span class="mute">—</span>'}</td>
      <td class="hm mute bo-nw">${boDate(c.first)}</td><td class="mute bo-nw">${boDate(c.last)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="sp-empty">לא נמצאו לקוחות.</p>') +
    `<div class="bo-foot"><span>${data.count.toLocaleString('he-IL')} לקוחות · ${data.repeat} חזרו לקנות שוב · סה"כ ${boMoney(data.spent)}</span>
     ${pages > 1 ? `<span class="bo-pg"><button class="btn" id="bo-cprev"${C.page ? '' : ' disabled'}>הקודם</button><span>עמוד ${C.page + 1} מתוך ${pages}</span><button class="btn" id="bo-cnext"${C.page < pages - 1 ? '' : ' disabled'}>הבא</button></span>` : ''}</div>`;
  box.querySelectorAll('tr[data-key]').forEach(tr => { const go = () => boCustomer(tr.dataset.key, tr.dataset.name, { view: 'customers' }); tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  box.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort; if (C.sort === k) C.dir = C.dir === 'asc' ? 'desc' : 'asc'; else { C.sort = k; C.dir = k === 'name' ? 'asc' : 'desc'; } C.page = 0; boCustomersLoad(); });
  const pv = box.querySelector('#bo-cprev'), nx = box.querySelector('#bo-cnext');
  if (pv) pv.onclick = () => { C.page--; boCustomersLoad(); };
  if (nx) nx.onclick = () => { C.page++; boCustomersLoad(); };
}
async function boCustomer(key, name, back) {
  setBar('customers', name || 'לקוח');
  boBackBtn(back || { view: 'customers' });
  document.getElementById('panel').classList.add('gray');
  boHash('customer=' + key); boSel('customers');
  pane().innerHTML = boLoading();
  const [cs, os] = await Promise.all([boApi('customers', { q: key, size: 5 }), boApi('orders', { customer: key, size: 500, status: 'all' })]);
  if (cs.error || os.error) { pane().innerHTML = boError(cs.error || os.error); return; }
  const c = cs.data.rows.find(r => r.key === key) || cs.data.rows[0];
  if (!c) { pane().innerHTML = boError('הלקוח לא נמצא.'); return; }
  document.getElementById('pb-t').textContent = c.name;
  const avg = c.paid ? c.spent / c.paid : 0;
  pane().innerHTML = `<div class="bo-tiles bo-tiles4">
      <div class="bo-tile"><span class="bo-tl">סה"כ קניות</span><span class="bo-tv">${boMoney(c.spent)}</span><span class="bo-ts">${c.paid} הזמנות ששולמו</span></div>
      <div class="bo-tile"><span class="bo-tl">ממוצע להזמנה</span><span class="bo-tv">${boMoney(avg)}</span><span class="bo-ts"></span></div>
      <div class="bo-tile"><span class="bo-tl">חסך בקופונים</span><span class="bo-tv">${boMoney(c.saved)}</span><span class="bo-ts">${(c.coupons || []).length} קודים</span></div>
      <div class="bo-tile"><span class="bo-tl">לקוח מאז</span><span class="bo-tv">${boDate(c.first)}</span><span class="bo-ts">אחרונה: ${boDate(c.last)}</span></div></div>
    <div class="sp-grid"><section class="sp-card"><div class="bo-ch"><h2>כל ההזמנות (${os.data.count})</h2></div>${boOrdersTable(os.data.rows, { compact: true, noCustomer: true })}</section>
    <section class="sp-card sp-pad"><h2>פרטי קשר</h2><div class="bo-kv bo-kv1"><div><span>טלפון</span><a href="tel:${esc(c.phone)}" dir="ltr">${esc(c.phone)}</a> · <a href="${esc(boWa(c.phone))}" target="_blank" rel="noopener">וואטסאפ</a></div>
      ${c.email ? `<div><span>אימייל</span><a href="mailto:${esc(c.email)}" dir="ltr">${esc(c.email)}</a></div>` : ''}${c.address ? `<div><span>כתובת אחרונה</span>${esc(c.address)}</div>` : ''}
      ${(c.coupons || []).length ? `<div><span>קופונים שהשתמש בהם</span>${c.coupons.map(x => `<button class="bo-code" dir="ltr" data-coupon="${esc(x)}">${esc(x)}</button>`).join(' ')}</div>` : ''}</div></section></div>`;
  boBindOrderRows(pane());
  pane().querySelectorAll('[data-coupon]').forEach(b => b.onclick = () => boCoupon(b.dataset.coupon, { view: 'customer', key, name }));
}

/* ---------- coupon usage report ---------- */
async function boCouponUse() {
  setBar('couponUse', 'שימוש בקופונים', `<button class="btn" id="bo-ucsv">${ICO.dl}ייצוא ל-Excel</button>`);
  document.getElementById('panel').classList.add('gray');
  boHash('');
  const R = pane();
  R.innerHTML = `<div class="bo-top">${boRangeHtml('bo-r')}</div><div id="bo-ubody">${boLoading()}</div>`;
  boBindRange('bo-r', boCouponUse);
  const { from, to } = boRange();
  const { data, error } = await boApi('coupons', { from, to });
  const body = document.getElementById('bo-ubody'); if (!body) return;
  if (error) { body.innerHTML = boError(error); return; }
  const T = data.totals;
  const def = r => r.deleted ? '<span class="mute">נמחק</span>' : r.type === 'fixed' ? boMoney(r.value) : Number(r.value) + '%';
  body.innerHTML = `<div class="bo-tiles bo-tiles4">
      <div class="bo-tile"><span class="bo-tl">שימושים בהזמנות ששולמו</span><span class="bo-tv">${T.uses}</span><span class="bo-ts">${data.rows.length} קודים שונים</span></div>
      <div class="bo-tile"><span class="bo-tl">סה"כ הנחות שניתנו</span><span class="bo-tv">${boMoney(T.discount)}</span><span class="bo-ts"></span></div>
      <div class="bo-tile"><span class="bo-tl">הכנסות מהזמנות עם קופון</span><span class="bo-tv">${boMoney(T.revenue)}</span><span class="bo-ts">${T.revenue ? Math.round((T.discount / (T.revenue + T.discount)) * 100) + '% הנחה בממוצע' : ''}</span></div>
      <div class="bo-tile"><span class="bo-tl">קודים פעילים שלא נוצלו</span><span class="bo-tv">${data.unused}</span><span class="bo-ts">בכל הזמנים</span></div></div>
    <section class="sp-card">${data.rows.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>קוד</th><th>הנחה</th><th class="num">שולמו</th><th class="num hm">ממתינות</th><th class="num hm">לקוחות</th><th class="num">סה"כ הנחה</th><th class="num">הכנסה</th><th class="hm">שימוש אחרון</th></tr></thead><tbody>
      ${data.rows.map(r => `<tr data-coupon="${esc(r.code)}" tabindex="0"><td><span class="bo-code" dir="ltr">${esc(r.code)}</span>${r.description ? `<div class="mute">${esc(r.description)}</div>` : ''}</td><td>${def(r)}</td>
        <td class="num"><b>${r.paid_uses}</b>${r.max_uses ? `<span class="mute"> / ${r.max_uses}</span>` : ''}</td><td class="num hm">${r.pending_uses || '—'}</td><td class="num hm">${r.customers}</td>
        <td class="num neg">${Number(r.discount) ? '−' + boMoney(r.discount) : '—'}</td><td class="num">${boMoney(r.revenue)}</td><td class="hm mute bo-nw">${boWhen(r.last_use)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="sp-empty">אף הזמנה בתקופה הזו לא השתמשה בקופון.</p>'}</section>
    <p class="who">"שולמו" כולל רק הזמנות ששולמו. "ממתינות" הן הזמנות שהקוד הוזן בהן ועדיין לא שולמו.</p>`;
  body.querySelectorAll('tr[data-coupon]').forEach(tr => { const go = () => boCoupon(tr.dataset.coupon, { view: 'couponUse' }); tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  document.getElementById('bo-ucsv').onclick = () => boCsv(`coupons-${from}_${to}.csv`,
    ['קוד', 'סוג', 'ערך', 'שימושים ששולמו', 'ממתינות', 'נכשלו/בוטלו', 'לקוחות', 'סה"כ הנחה', 'הכנסה', 'שימוש ראשון', 'שימוש אחרון', 'תיאור'],
    data.rows.map(r => [r.code, r.deleted ? 'נמחק' : r.type === 'fixed' ? 'סכום' : 'אחוז', r.value ?? '', r.paid_uses, r.pending_uses, r.lost_uses, r.customers, r.discount, r.revenue, boWhen(r.first_use), boWhen(r.last_use), r.description || '']));
}
async function boCoupon(code, back) {
  setBar('couponUse', 'קופון ' + code, `<button class="btn" id="bo-cedit">עריכת הקופון</button>`);
  boBackBtn(back || { view: 'couponUse' });
  document.getElementById('panel').classList.add('gray');
  boHash('coupon=' + code); boSel('couponUse');
  pane().innerHTML = boLoading();
  const [os, cp] = await Promise.all([boApi('orders', { coupon: code, size: 1000, status: 'all', sort: 'created_at', dir: 'desc' }), sb.from('coupons').select('*').eq('code', code)]);
  if (os.error) { pane().innerHTML = boError(os.error); return; }
  const c = (cp.data || [])[0];
  const ed = document.getElementById('bo-cedit');
  if (c && typeof cpEdit === 'function') ed.onclick = () => { boHash(''); document.querySelectorAll('.sh-nav [data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === 'coupons')); document.getElementById('panel').classList.remove('gray'); CP.rows = CP.rows.length ? CP.rows : [c]; cpEdit(CP.rows.find(x => x.code === c.code) || c); };
  else ed.hidden = true;
  const rows = os.data.rows, paid = rows.filter(o => o.status === 'paid');
  const disc = paid.reduce((s, o) => s + Number(o.discount), 0), rev = paid.reduce((s, o) => s + Number(o.total), 0);
  const state = c ? (typeof cpState === 'function' ? cpState(c) : ['on', c.active ? 'פעיל' : 'כבוי']) : ['off', 'נמחק'];
  pane().innerHTML = `<div class="bo-oh"><span class="bo-code bo-code-l" dir="ltr">${esc(code)}</span><span class="cp-st ${state[0]}">${esc(state[1])}</span>
      ${c ? `<span class="mute">${c.type === 'fixed' ? boMoney(c.value) + ' הנחה' : Number(c.value) + '% הנחה'}${c.min_order_amount ? ' · מינימום ' + boMoney(c.min_order_amount) : ''}${c.ends_at ? ' · בתוקף עד ' + boDate(c.ends_at) : ''}</span>` : ''}</div>
    ${c && c.description ? `<p class="mute">${esc(c.description)}</p>` : ''}
    <div class="bo-tiles bo-tiles4">
      <div class="bo-tile"><span class="bo-tl">שימושים ששולמו</span><span class="bo-tv">${paid.length}${c && c.max_uses ? `<small> / ${c.max_uses}</small>` : ''}</span><span class="bo-ts">${rows.length - paid.length ? rows.length - paid.length + ' הזמנות נוספות לא שולמו' : ''}</span></div>
      <div class="bo-tile"><span class="bo-tl">סה"כ הנחה</span><span class="bo-tv">${boMoney(disc)}</span><span class="bo-ts"></span></div>
      <div class="bo-tile"><span class="bo-tl">הכנסה מההזמנות</span><span class="bo-tv">${boMoney(rev)}</span><span class="bo-ts"></span></div>
      <div class="bo-tile"><span class="bo-tl">לקוחות</span><span class="bo-tv">${new Set(paid.map(o => boPhone(o.phone))).size}</span><span class="bo-ts">שילמו עם הקוד</span></div></div>
    <section class="sp-card"><div class="bo-ch"><h2>מי השתמש בקוד</h2><span class="mute">כל ההזמנות שהוזן בהן הקוד, מכל הזמנים</span></div>
      ${rows.length ? boOrdersTable(rows, { compact: true }) : '<p class="sp-empty">עדיין לא נעשה שימוש בקוד הזה.</p>'}</section>`;
  boBindOrderRows(pane());
}

/* ---------- abandoned carts (checkout drafts with phone/email that did not become an order) ---------- */
async function boAbandoned() {
  setBar('abandoned', 'עגלות נטושות');
  document.getElementById('panel').classList.add('gray');
  boHash('');
  const R = pane();
  if (!(window.PSDB && (await PSDB.mode()) === 'sb')) { R.innerHTML = boError('עגלות נטושות זמינות כרגע רק כשהנתונים ב-Supabase.'); return; }
  const show = BO.abShow || 'open';
  R.innerHTML = boLoading();
  const { data, error } = await PSDB.rpc('admin_abandoned', { p: { show } });
  if (error) { R.innerHTML = boError(error.message); return; }
  const rows = data.rows || [];
  const waText = a => `היי ${a.name ? a.name.split(' ')[0] : ''}, ראינו שהתחלת הזמנה בפרוטאין סטוק ולא סיימת 🙂\nהמוצרים מחכים לך בעגלה: ${(a.items || []).map(i => i.name ? i.name.split('|')[0].trim() : i.id).slice(0, 3).join(', ')}\nאפשר להשלים כאן: https://proteinstock.co.il/checkout\nצריך עזרה? אנחנו כאן.`;
  R.innerHTML = `<div class="bo-tiles bo-tiles4">
      <div class="bo-tile"><span class="bo-tl">עגלות פתוחות</span><span class="bo-tv">${data.open}</span><span class="bo-ts">לא הושלמו 30+ דקות</span></div>
      <div class="bo-tile"><span class="bo-tl">שווי העגלות הפתוחות</span><span class="bo-tv">${boMoney(data.open_value)}</span><span class="bo-ts"></span></div>
      <div class="bo-tile"><span class="bo-tl">עגלות שהושלמו להזמנה</span><span class="bo-tv">${data.recovered}</span><span class="bo-ts">הלקוח חזר וקנה</span></div>
      <div class="bo-tile"><span class="bo-tl">הכנסות מעגלות שחזרו</span><span class="bo-tv">${boMoney(data.recovered_value)}</span><span class="bo-ts"></span></div></div>
    <section class="sp-card"><div class="sp-tabbar"><div class="tb" role="tablist"><button role="tab" data-ab="open" aria-selected="${show === 'open'}">פתוחות</button><button role="tab" data-ab="all" aria-selected="${show === 'all'}">הכל</button></div></div>
    ${rows.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>לקוח</th><th>מוצרים בעגלה</th><th class="num">שווי</th><th>עודכן</th><th>מצב</th><th></th></tr></thead><tbody>
      ${rows.map(a => `<tr data-ab-id="${esc(a.id)}"><td><div class="bo-name">${esc(a.name || '—')}</div><div class="mute" dir="ltr" style="text-align:end">${esc(a.phone || '')}${a.phone && a.email ? ' · ' : ''}${esc(a.email || '')}</div></td>
        <td><span class="bo-thumbs">${(a.items || []).slice(0, 4).map(i => { const p = typeof byId === 'function' ? null : null; return `<span class="mute">${esc((i.name || i.id).split('|')[0].trim().slice(0, 40))} ×${i.q}</span>`; }).join('<br>')}</span></td>
        <td class="num"><b>${boMoney(a.total)}</b></td><td class="mute bo-nw">${boWhen(a.updated_at)}</td>
        <td>${a.recovered_order ? `<span class="badge paid">הושלמה · ${esc(a.recovered_order)}</span>` : a.contacted_at ? '<span class="badge pending">נשלחה תזכורת</span>' : '<span class="badge">פתוחה</span>'}</td>
        <td class="bo-nw">${!a.recovered_order && a.phone ? `<a class="btn sm" data-wa="${esc(a.id)}" target="_blank" rel="noopener" href="${esc(boWa(a.phone) + '?text=' + encodeURIComponent(waText(a)))}">תזכורת בוואטסאפ</a>` : ''}${!a.recovered_order && a.email ? ` <a class="btn sm" data-wa="${esc(a.id)}" href="mailto:${esc(a.email)}?subject=${encodeURIComponent('העגלה שלך מחכה לך — פרוטאין סטוק')}&body=${encodeURIComponent(waText(a))}">מייל</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="sp-empty">אין כרגע עגלות נטושות. עגלה נשמרת כשלקוח מזין טלפון או אימייל בקופה ולא מסיים הזמנה תוך 30 דקות.</p>'}</section>
    <p class="who">לקוח שחוזר וקונה עם אותו טלפון או אימייל מסומן אוטומטית כ"הושלמה". אירועי AddToCart ו-InitiateCheckout נשלחים גם לפייסבוק ולגוגל לקהלי רימרקטינג.</p>`;
  R.querySelectorAll('[data-ab]').forEach(b => b.onclick = () => { BO.abShow = b.dataset.ab; boAbandoned(); });
  R.querySelectorAll('[data-wa]').forEach(a => a.addEventListener('click', () => { sb.from('abandoned_checkouts').update({ contacted_at: new Date().toISOString() }).eq('id', a.dataset.wa).then(() => {}); }));
}

/* ---------- inventory (Zappy's per-product "Quantity on hand" + "Alert baseline", all products in one table) ---------- */
async function boInventory() {
  setBar('inventory', 'מלאי', `<button class="btn" id="bo-icsv">${ICO.dl}ייצוא ל-Excel</button>`);
  document.getElementById('panel').classList.add('gray');
  boHash('');
  const R = pane(); R.innerHTML = boLoading('טוען מלאי…');
  const { data, error } = await sb.from('products').select('id,title,image,sku,quantity,low_stock_threshold,out_of_stock,price,status').order('title');
  if (error) { R.innerHTML = boError(error.message); return; }
  const rows = (data || []).filter(p => p.status !== 'archived');
  const I = BO.inv || (BO.inv = { tab: 'all', q: '' });
  const state = p => p.quantity == null ? 'untracked' : p.quantity <= 0 ? 'out' : (p.low_stock_threshold != null && p.quantity <= p.low_stock_threshold) ? 'low' : 'ok';
  const LBL = { ok: ['paid', 'במלאי'], low: ['pending', 'מלאי נמוך'], out: ['cancelled', 'אזל'], untracked: ['', 'ללא מעקב'] };
  const draw = () => {
    const q = I.q.toLowerCase();
    const list = rows.filter(p => (I.tab === 'all' || state(p) === I.tab) && (!q || p.title.toLowerCase().includes(q) || String(p.sku || '').includes(q) || p.id.includes(q)));
    const cnt = k => rows.filter(p => state(p) === k).length;
    const units = rows.reduce((s, p) => s + (p.quantity > 0 ? p.quantity : 0), 0), value = rows.reduce((s, p) => s + (p.quantity > 0 ? p.quantity * Number(p.price) : 0), 0);
    R.innerHTML = `<div class="bo-tiles bo-tiles4">
        <div class="bo-tile"><span class="bo-tl">יחידות במלאי</span><span class="bo-tv">${units.toLocaleString('he-IL')}</span><span class="bo-ts">${rows.length} מוצרים</span></div>
        <div class="bo-tile"><span class="bo-tl">שווי המלאי (במחיר מכירה)</span><span class="bo-tv">${boMoney(value)}</span><span class="bo-ts"></span></div>
        <button class="bo-tile" data-it="low"><span class="bo-tl">מלאי נמוך</span><span class="bo-tv">${cnt('low')}</span><span class="bo-ts">בסף ההתראה או מתחתיו</span></button>
        <button class="bo-tile" data-it="out"><span class="bo-tl">אזלו</span><span class="bo-tv">${cnt('out')}</span><span class="bo-ts"></span></button></div>
      <section class="sp-card"><div class="sp-tabbar"><div class="tb" role="tablist">${[['all', 'הכל'], ['ok', 'במלאי'], ['low', 'מלאי נמוך'], ['out', 'אזלו'], ['untracked', 'ללא מעקב']].map(([k, v]) => `<button role="tab" data-it="${k}" aria-selected="${I.tab === k}">${v} (${k === 'all' ? rows.length : cnt(k)})</button>`).join('')}</div></div>
      <div class="bo-filters"><input type="search" id="bo-iq" placeholder="חיפוש לפי שם, ברקוד או מזהה" value="${esc(I.q)}" aria-label="חיפוש במלאי"></div>
      <div class="sp-tw"><table class="sp-table bo-t bo-inv"><thead><tr><th>מוצר</th><th>ברקוד</th><th class="num">כמות במלאי</th><th class="num">סף התראה</th><th>מצב</th><th class="hm">מעקב מלאי</th></tr></thead><tbody>
      ${list.map(p => { const [cls, lbl] = LBL[state(p)]; const tracked = p.quantity != null; return `<tr data-pid="${esc(p.id)}"><td><div class="bo-line">${boImg(p.image, 'bo-th')}<a class="bo-name" href="/product?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">${esc(p.title.split('|')[0].trim())}</a></div></td>
        <td class="mute" dir="ltr">${esc(p.sku || '—')}</td>
        <td class="num"><input class="bo-qin" type="number" min="0" step="1" inputmode="numeric" data-f="quantity" value="${tracked ? p.quantity : ''}" ${tracked ? '' : 'disabled'} aria-label="כמות במלאי"></td>
        <td class="num"><input class="bo-qin" type="number" min="0" step="1" inputmode="numeric" data-f="low_stock_threshold" value="${p.low_stock_threshold ?? ''}" ${tracked ? '' : 'disabled'} aria-label="סף התראה"></td>
        <td><span class="badge ${cls}">${lbl}</span></td>
        <td class="hm"><label class="chk" style="margin:0"><input type="checkbox" data-f="track"${tracked ? ' checked' : ''}> מעקב</label></td></tr>`; }).join('') || '<tr><td colspan="6" class="sp-empty">אין מוצרים להצגה</td></tr>'}
      </tbody></table></div></section>
      <p class="who">הכמות יורדת אוטומטית בכל הזמנה וחוזרת כשהזמנה מבוטלת. בכמות 0 המוצר מסומן "אזל" ולא ניתן לקנות אותו; כשמוסיפים מלאי הוא חוזר למכירה. השינוי נשמר כשיוצאים מהשדה או לוחצים Enter.</p>`;
    R.querySelectorAll('[data-it]').forEach(b => b.onclick = () => { I.tab = b.dataset.it; draw(); });
    const qi = R.querySelector('#bo-iq'); qi.oninput = () => { I.q = qi.value.trim(); const pos = qi.selectionStart; draw(); const n = R.querySelector('#bo-iq'); n.focus(); n.setSelectionRange(pos, pos); };
    R.querySelectorAll('tr[data-pid]').forEach(tr => {
      const p = rows.find(x => x.id === tr.dataset.pid);
      const save = async patch => {
        const { error } = await sb.from('products').update(patch).eq('id', p.id);
        if (error) { toast('השמירה נכשלה: ' + error.message); return false; }
        Object.assign(p, patch); toast('המלאי עודכן'); draw(); return true;
      };
      tr.querySelectorAll('input.bo-qin').forEach(inp => {
        const commit = () => {
          const v = inp.value.trim() === '' ? null : Math.max(0, parseInt(inp.value, 10) || 0);
          if (inp.dataset.f === 'quantity') { if (v == null || v === p.quantity) { inp.value = p.quantity ?? ''; return; } save({ quantity: v, out_of_stock: v <= 0 }); }
          else if (v !== p.low_stock_threshold) save({ low_stock_threshold: v });
        };
        inp.onchange = commit; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
      });
      const tk = tr.querySelector('input[data-f=track]');
      tk.onchange = () => tk.checked ? save({ quantity: 0, out_of_stock: true }).then(ok => ok && toast('הופעל מעקב מלאי — הזינו כמות')) : save({ quantity: null });
    });
  };
  draw();
  document.getElementById('bo-icsv').onclick = () => boCsv('inventory.csv', ['מזהה', 'מוצר', 'ברקוד', 'כמות במלאי', 'סף התראה', 'מצב', 'מחיר'],
    rows.map(p => [p.id, p.title, p.sku || '', p.quantity ?? '', p.low_stock_threshold ?? '', LBL[state(p)][1], p.price]));
}

/* ---------- navigation helpers ---------- */
let boCur = { view: 'home' };
function boBack() { return boCur; }
function boBackBtn(back) {
  const pb = document.getElementById('pb'); if (!pb) return;
  const b = document.createElement('button'); b.className = 'pb-back'; b.setAttribute('aria-label', 'חזרה'); b.title = 'חזרה'; b.textContent = '→';
  b.onclick = () => boReturn(back);
  pb.insertBefore(b, pb.querySelector('.pb-i'));
}
function boReturn(b) {
  if (!b) return boGo('home');
  if (b.view === 'order') return boOrder(b.id);
  if (b.view === 'customer') return boCustomer(b.key, b.name);
  return boGo(b.view);
}
function boSel(view) { document.querySelectorAll('.sh-nav [data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === view)); }
function boHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { /* ignore */ } }
function boGo(view) {
  const btn = document.querySelector(`.sh-nav [data-t="${view}"]`);
  if (btn) btn.click(); else ({ home: boHome, orders: boOrders, customers: boCustomers, couponUse: boCouponUse }[view] || boHome)();
}
/* tab entry points used by the admin shell */
const home = () => { boCur = { view: 'home' }; boHash(''); boHome(); };
const orders = () => { boCur = { view: 'orders' }; boHash(''); boOrders(); };
const customers = () => { boCur = { view: 'customers' }; boHash(''); boCustomers(); };
const couponUse = () => { boCur = { view: 'couponUse' }; boHash(''); boCouponUse(); };
const dns = () => { boCur = { view: 'dns' }; boHash(''); boDns(); };
const leads = () => { boCur = { view: 'leads' }; boHash(''); boLeads(); };
const abandoned = () => { boCur = { view: 'abandoned' }; boHash(''); boAbandoned(); };
const inventory = () => { boCur = { view: 'inventory' }; boHash(''); boInventory(); };
/* deep links: #order=<id>, #customer=<phone>, #coupon=<code> */
function boDeepLink() {
  if (location.hash === '#api-keys') { document.querySelectorAll('.sh-nav [data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === 'settings')); Promise.resolve(settings()).then(() => { let n = 0; const t = setInterval(() => { const f = document.getElementById('ak-name'); if (f || ++n > 60) { clearInterval(t); if (f) { const el = f.closest('.bo-keys'); setTimeout(() => { el.scrollIntoView({ block: 'start' }); el.style.boxShadow = '0 0 0 3px #1764d6'; f.focus({ preventScroll: true }); }, 400); } } }, 150); }); return true; }
  if (location.hash === '#stock-sync') {   /* settings → connection to the stock system */
    document.querySelectorAll('.sh-nav [data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === 'settings'));
    Promise.resolve(settings()).then(() => { let n = 0; const t = setInterval(() => { const p = document.getElementById('wh-paste'); if (p || ++n > 60) { clearInterval(t); if (p) { const el = p.closest('.bo-wh'); setTimeout(() => { el.scrollIntoView({ block: 'start' }); el.style.boxShadow = '0 0 0 3px #1764d6'; p.focus({ preventScroll: true }); }, 400); } } }, 150); });
    return true;
  }
  const m = location.hash.match(/^#(order|customer|coupon)=(.+)$/); if (!m) return false;
  const v = decodeURIComponent(m[2]);
  const sel = { order: 'orders', customer: 'customers', coupon: 'couponUse' }[m[1]];
  document.querySelectorAll('.sh-nav [data-t]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === sel));
  if (m[1] === 'order') boOrder(v, { view: 'orders' }); else if (m[1] === 'customer') boCustomer(v, '', { view: 'customers' }); else boCoupon(v, { view: 'couponUse' });
  return true;
}

/* ---------- Excel (CSV) export ---------- */
function boCsv(name, head, rows) {
  const cell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const text = '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function boExportOrders(params) {
  toast('מכין קובץ…');
  const { data, error } = await boApi('orders', { ...params, size: 5000, page: 0, items: true });
  if (error) { toast('הייצוא נכשל: ' + error); return; }
  if (data.count > data.rows.length) toast(`יוצאו ${data.rows.length} מתוך ${data.count} הזמנות. צמצמו את הטווח כדי לייצא את כולן.`);
  boCsv(`orders-${params.from || ''}_${params.to || ''}.csv`,
    ['מספר הזמנה', 'מקור', 'תאריך', 'סטטוס', 'סטטוס משלוח', 'מספר מעקב', 'לקוח', 'טלפון', 'אימייל', 'משלוח', 'כתובת', 'פריטים', 'סכום ביניים', 'קופון', 'הנחה', 'דמי משלוח', 'סה"כ', 'ספק סליקה', 'מזהה עסקה', 'תאריך תשלום', 'הערות'],
    data.rows.map(o => [o.number, o.source === 'zappy' ? 'Zappy' : 'האתר', boWhen(o.created_at), STATUS[o.status] || o.status, FUL[o.fulfillment] || '', o.tracking_number || '', o.customer_name, o.phone, o.email || '', o.delivery === 'pickup' ? 'איסוף עצמי' : 'משלוח', o.delivery === 'pickup' ? '' : o.address || '',
      (o.order_items || []).map(i => `${i.title} ×${i.qty}`).join(' | '), o.subtotal, o.coupon_code || '', o.discount, o.shipping, o.total, o.payment_provider || '', o.payment_ref || '', o.paid_at ? boWhen(o.paid_at) : '', o.notes || '']));
}
async function boExportCustomers() {
  toast('מכין קובץ…');
  const { data, error } = await boApi('customers', { q: BO.customers.q, size: 5000, sort: 'spent', dir: 'desc' });
  if (error) { toast('הייצוא נכשל: ' + error); return; }
  boCsv('customers.csv', ['שם', 'טלפון', 'אימייל', 'כתובת אחרונה', 'הזמנות ששולמו', 'כל ההזמנות', 'סה"כ קניות', 'חסך בקופונים', 'קופונים', 'לקוח מאז', 'הזמנה אחרונה'],
    data.rows.map(c => [c.name, c.phone, c.email || '', c.address || '', c.paid, c.orders, c.spent, c.saved, (c.coupons || []).join(' '), boDate(c.first), boDate(c.last)]));
}

/* ---------- mobile: every admin table becomes a list of cards; each cell gets its column name as a label ---------- */
(function () {
  let t = null;
  const label = () => {
    document.querySelectorAll('.sh-panel table.sp-table').forEach(tb => {
      const heads = [...tb.querySelectorAll('thead th')].map(th => th.textContent.replace(/[▲▼]/g, '').trim());
      tb.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-l')) td.setAttribute('data-l', heads[i] || ''); }));
      tb.classList.add('bo-cards');
    });
  };
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(label, 30); }).observe(document.documentElement, { childList: true, subtree: true });
})();

/* ---------- settings: who can enter the admin ---------- */
async function boAdminsCard(host) {
  if (!(window.PSDB && (await PSDB.mode()) === 'sb')) return;
  const sec = document.createElement('div'); sec.className = 'card bo-admins'; sec.style.marginTop = '16px';
  host.appendChild(sec);
  const ERR = { forbidden: 'אין הרשאה.', invalid_email: 'כתובת המייל לא תקינה.', self: 'אי אפשר להסיר את עצמך.', last: 'חייב להישאר לפחות מנהל אחד.' };
  const paint = list => {
    sec.innerHTML = `<h2 style="font-size:1.05rem;margin-bottom:6px">מנהלים</h2>
      <p class="who" style="margin:0 0 10px">מי שמופיע כאן נכנס לניהול עם קוד שנשלח למייל שלו (ואחר כך גם עם Face ID).</p>
      <ul class="pk-list">${list.map(a => `<li><b dir="ltr">${esc(a.email)}${a.me ? ' <span class="mute">(את/ה)</span>' : ''}</b><span>${a.last_sign_in ? 'כניסה אחרונה ' + boDate(a.last_sign_in) : 'עוד לא נכנס/ה'}</span>${a.me ? '' : `<button class="btn sm" data-rm="${esc(a.email)}">הסרה</button>`}</li>`).join('')}</ul>
      <form class="bo-add-admin"><input type="email" id="adm-new" placeholder="מייל של מנהל חדש" dir="ltr" autocomplete="off" aria-label="מייל של מנהל חדש" required><button class="btn pri" type="submit">הוספת מנהל</button></form>
      <p class="who" style="margin:8px 0 0">אחרי ההוספה, שלחו לו את הכתובת proteinstock.co.il/admin. בכניסה הראשונה הוא יקבל קוד למייל.</p>`;
    sec.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      if (!confirm('להסיר את ' + b.dataset.rm + ' מהמנהלים? הוא לא יוכל להיכנס לניהול.')) return;
      const { data, error } = await PSDB.rpc('ps_admin_remove', { p_email: b.dataset.rm });
      if (error || (data && data.error)) return toast(ERR[data && data.error] || 'ההסרה נכשלה');
      paint(data); toast('הוסר');
    });
    sec.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const inp = sec.querySelector('#adm-new'), email = inp.value.trim().toLowerCase();
      if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) return toast(ERR.invalid_email);
      const btn = e.target.querySelector('button'); btn.disabled = true;
      const { data, error } = await PSDB.rpc('ps_admin_add', { p_email: email });
      btn.disabled = false;
      if (error || (data && data.error)) return toast(ERR[data && data.error] || 'ההוספה נכשלה');
      paint(data); toast('נוסף מנהל: ' + email);
    };
  };
  const { data, error } = await PSDB.rpc('ps_admins');
  if (error || !Array.isArray(data)) { sec.innerHTML = '<p class="who">לא ניתן לטעון את רשימת המנהלים כרגע.</p>'; return; }
  paint(data);
}

/* ---------- settings: send every paid order to the store's own system (stock / shipping) ---------- */
async function boWebhookCard(host) {
  if (!(window.PSDB && (await PSDB.mode()) === 'sb')) return;
  const sec = document.createElement('div'); sec.className = 'card bo-wh'; sec.style.marginTop = '16px';
  host.appendChild(sec);
  const ERR = { forbidden: 'אין הרשאה.', bad_url: 'הכתובת חייבת להתחיל ב-https://', bad_secret: 'המפתח לא תקין (לפחות 16 תווים, בלי רווחים).' };
  const paint = d => {
    const c = d.config || {}, log = d.log || [];
    sec.innerHTML = `<h2 style="font-size:1.05rem;margin-bottom:6px">חיבור למערכת המלאי והמשלוחים</h2>
      <p class="who" style="margin:0 0 10px">כל הזמנה ששולמה נשלחת מיד לכתובת הזו עם כל הפרטים: מוצרים (כולל ברקוד), שם, טלפון, מייל, כתובת, ואיסוף עצמי או משלוח. במקום Zappy Events.</p>
      <div class="field" style="max-width:620px"><label for="wh-url">כתובת (Webhook URL)</label><input type="url" id="wh-url" dir="ltr" value="${esc(c.url || '')}" placeholder="https://..."></div>
      <label class="o" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="wh-en"${c.enabled ? ' checked' : ''}> שליחה פעילה</label>
      <div class="field" style="max-width:620px"><label>מפתח חתימה (Signing secret)</label><div class="bo-secret"><code dir="ltr" id="wh-sec">${esc(c.secret || '')}</code><button class="btn sm" id="wh-copy" type="button">העתקה</button><button class="btn sm" id="wh-new" type="button">מפתח חדש</button></div>
        <div class="bo-secret" style="margin-top:8px"><input type="password" id="wh-paste" dir="ltr" autocomplete="off" placeholder="הדביקו כאן מפתח שקיבלתם מהמערכת המקבלת" aria-label="הדבקת מפתח חתימה" style="flex:1 1 240px;min-width:0;height:36px;border:1px solid var(--border,#d9dee5);border-radius:8px;padding:0 10px;font:inherit"><button class="btn sm pri" id="wh-setsec" type="button">שמירת המפתח</button></div>
        <p class="who" style="margin:6px 0 0">כל בקשה נשלחת בפורמט של מערכת המלאי, חתומה בכותרת <span dir="ltr">x-zappy-signature: sha256=…</span> (HMAC-SHA256 של גוף הבקשה עם המפתח).</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="wh-save">שמירה</button><button class="btn" id="wh-test">שליחת בדיקה (ההזמנה האחרונה)</button></div>
      <p class="who" id="wh-res" style="margin:10px 0 0"></p>
      <h3 style="font-size:.95rem;margin:16px 0 8px">שליחות אחרונות</h3>
      ${log.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>הזמנה</th><th>מתי</th><th>תוצאה</th><th class="hm">תשובה</th><th></th></tr></thead><tbody>${log.map(l => `<tr><td dir="ltr" style="text-align:end">${esc(l.order_number || '')}</td><td class="mute bo-nw">${boWhen(l.created_at)}</td><td>${l.ok ? '<span class="bo-acc on">התקבל</span>' : `<span class="bo-acc bad">נכשל ${l.status || ''}</span>`}${/test/.test(l.event) ? ' <span class="mute">בדיקה</span>' : ''}</td><td class="hm mute" dir="ltr" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.response || '')}</td><td>${l.ok ? '' : `<button class="btn sm" data-resend="${esc(l.order_number || '')}">שליחה חוזרת</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="who">עדיין לא נשלחו הזמנות.</p>'}`;
    const res = sec.querySelector('#wh-res');
    sec.querySelector('#wh-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c.secret || ''); toast('המפתח הועתק'); };
    const save = async extra => {
      const { data, error } = await PSDB.rpc('ps_webhook_set', { p: { url: sec.querySelector('#wh-url').value.trim(), enabled: sec.querySelector('#wh-en').checked, ...extra } });
      if (error || (data && data.error)) { toast(ERR[data && data.error] || 'השמירה נכשלה'); return null; }
      paint(data); return data;
    };
    sec.querySelector('#wh-save').onclick = async () => { if (await save({})) toast('נשמר'); };
    sec.querySelector('#wh-setsec').onclick = async () => { const v = sec.querySelector('#wh-paste').value.trim(); if (!v) { toast('הדביקו קודם את המפתח'); return; } if (await save({ secret: v })) toast('המפתח נשמר'); };
    sec.querySelector('#wh-new').onclick = async () => { if (!confirm('ליצור מפתח חתימה חדש? המערכת המקבלת תצטרך את המפתח החדש.')) return; if (await save({ new_secret: true })) toast('נוצר מפתח חדש'); };
    const send = async (action, order_number, btn) => {
      btn.disabled = true; res.textContent = 'שולח…';
      const { data, error } = await sb.functions.invoke('order-webhook', { body: { action, order_number } });
      btn.disabled = false;
      if (error || !data) { res.textContent = 'השליחה נכשלה.'; }
      else if (data.error) res.textContent = data.error === 'no_url' ? 'צריך להזין כתובת.' : data.error === 'not_found' ? 'לא נמצאה הזמנה ששולמה.' : 'השליחה נכשלה: ' + data.error;
      else res.innerHTML = data.ok ? '<b style="color:#1a7f37">המערכת קיבלה את ההזמנה.</b>' : `<b style="color:#b42318">המערכת החזירה ${esc(String(data.status || 'שגיאה'))}</b> <span dir="ltr">${esc(data.response || '')}</span>`;
      const { data: d2 } = await PSDB.rpc('ps_webhook_get'); if (d2 && !d2.error) { const keep = res.innerHTML; paint(d2); sec.querySelector('#wh-res').innerHTML = keep; }
    };
    sec.querySelector('#wh-test').onclick = e => send('test', '', e.target);
    sec.querySelectorAll('[data-resend]').forEach(b => b.onclick = () => send('resend', b.dataset.resend, b));
  };
  const { data, error } = await PSDB.rpc('ps_webhook_get');
  if (error || !data || data.error) { sec.innerHTML = '<p class="who">לא ניתן לטעון את הגדרות החיבור כרגע.</p>'; return; }
  paint(data);
}

/* ---------- newsletter subscribers (home page form) ---------- */
async function boNewsSection(R) {
  if (!(window.PSDB && (await PSDB.mode()) === 'sb')) return;
  const { data, error } = await sb.from('newsletter_subscribers').select('email,source,created_at').order('created_at', { ascending: false }).limit(5000);
  if (error || !R.isConnected) return;
  const sec = document.createElement('div'); sec.className = 'sp-card'; sec.style.marginTop = '16px';
  sec.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 class="bo-h2" style="margin:0">נרשמים לניוזלטר <span class="mute">(${data.length})</span></h2>${data.length ? '<button class="btn sm" id="bo-ncsv">ייצוא ל-Excel</button>' : ''}</div>
    <p class="who" style="margin:6px 0 10px">נרשמו בטופס בעמוד הבית וקיבלו את קוד ההנחה WELCOME30.</p>
    ${data.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>מייל</th><th>נרשם</th></tr></thead><tbody>${data.slice(0, 200).map(r => `<tr><td dir="ltr" style="text-align:end">${esc(r.email)}</td><td class="mute bo-nw">${boWhen(r.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sp-empty">עדיין אין נרשמים.</p>'}`;
  R.appendChild(sec);
  const b = sec.querySelector('#bo-ncsv'); if (b) b.onclick = () => boCsv('newsletter.csv', ['מייל', 'מקור', 'נרשם'], data.map(r => [r.email, r.source || '', boWhen(r.created_at)]));
}

/* ---------- leads: contact, business (wholesale) and cancellation forms ---------- */
const LEAD_SRC = { contact: 'צור קשר', 'business-wholesale': 'לעסקים', 'transaction-cancellation': 'ביטול עסקה' };
async function boLeads() {
  setBar('leads', 'לידים', `<button class="btn" id="bo-lcsv">${ICO.dl}ייצוא ל-Excel</button>`);
  document.getElementById('panel').classList.add('gray');
  const R = pane(); R.innerHTML = boLoading();
  const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) { R.innerHTML = boError(error.message || 'שגיאה'); return; }
  const rows = data || [];
  const paint = () => {
    const nNew = rows.filter(r => r.status === 'new').length;
    R.innerHTML = `<div class="sp-card">${rows.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>תאריך</th><th>מקור</th><th>שם</th><th>טלפון</th><th class="hm">מייל</th><th class="hm">עסק</th><th>הודעה</th><th>סטטוס</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="mute bo-nw">${boWhen(r.created_at)}</td><td>${esc(LEAD_SRC[r.source] || r.source)}</td><td><b>${esc(r.name)}</b></td>
        <td dir="ltr" style="text-align:end">${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '—'}</td><td class="hm" dir="ltr" style="text-align:end">${esc(r.email || '')}</td>
        <td class="hm">${esc([r.business, r.business_type, r.city].filter(Boolean).join(' · '))}</td>
        <td style="max-width:320px;white-space:pre-line">${esc([r.products, r.message].filter(Boolean).join(' · '))}</td>
        <td><button class="btn sm${r.status === 'new' ? ' pri' : ''}" data-l="${r.id}">${r.status === 'new' ? 'חדש · סמן טופל' : 'טופל'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="sp-empty">עדיין אין לידים. פניות מטופס צור קשר, לעסקים וביטול עסקה יופיעו כאן.</p>'}
      <div class="bo-foot"><span>${rows.length} לידים · ${nNew} חדשים</span></div></div>`;
    R.querySelectorAll('[data-l]').forEach(btn => btn.onclick = async () => {
      const r = rows.find(x => String(x.id) === btn.dataset.l); const next = r.status === 'new' ? 'handled' : 'new';
      btn.disabled = true;
      const { error } = await sb.from('leads').update({ status: next }).eq('id', r.id);
      if (error) { btn.disabled = false; toast('העדכון נכשל'); return; }
      r.status = next; paint();
    });
  };
  paint();
  document.getElementById('bo-lcsv').onclick = () => boCsv('leads.csv', ['תאריך', 'מקור', 'שם', 'טלפון', 'מייל', 'עסק', 'סוג עסק', 'עיר', 'מוצרים', 'הודעה', 'סטטוס'],
    rows.map(r => [boWhen(r.created_at), LEAD_SRC[r.source] || r.source, r.name, r.phone || '', r.email || '', r.business || '', r.business_type || '', r.city || '', r.products || '', r.message || '', r.status === 'new' ? 'חדש' : 'טופל']));
}

/* ---------- settings: Store API keys (create with chosen permissions, see once, revoke) ---------- */
const API_SCOPES = [['orders:read', 'קריאת הזמנות'], ['orders:write', 'עדכון מספר משלוח וסטטוס משלוח'], ['products:read', 'קריאת מוצרים ומלאי'], ['stock:write', 'עדכון מלאי']];
async function boApiKeysCard(host) {
  if (!(window.PSDB && (await PSDB.mode()) === 'sb')) return;
  const sec = document.createElement('div'); sec.className = 'card bo-keys'; sec.style.marginTop = '16px';
  host.appendChild(sec);
  const ERR = { forbidden: 'אין הרשאה.', no_scopes: 'בחרו לפחות הרשאה אחת.', no_name: 'תנו שם למפתח (למשל "בוט וואטסאפ").' };
  const paint = (list, fresh) => {
    sec.innerHTML = `<h2 style="font-size:1.05rem;margin-bottom:6px">מפתחות API (Store API)</h2>
      <p class="who" style="margin:0 0 10px">לחיבור מערכות חיצוניות: מערכת מלאי, בוט וואטסאפ, הנהלת חשבונות. לכל מפתח הרשאות משלו, ואפשר לבטל כל אחד בנפרד. תיעוד: <a href="https://github.com/rockitai/proteinstock/blob/main/docs/API.md" target="_blank" rel="noopener">docs/API.md</a></p>
      ${fresh ? `<div class="bo-newkey"><b>המפתח נוצר. העתיקו אותו עכשיו, הוא לא יוצג שוב:</b><div class="bo-secret"><code dir="ltr" id="ak-new">${esc(fresh)}</code><button class="btn sm pri" id="ak-copy" type="button">העתקה</button></div><p class="who" style="margin:6px 0 0">שלחו אותו רק בהודעה פרטית, ולא בקבוצה או במייל משותף.</p></div>` : ''}
      ${list.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>שם</th><th>הרשאות</th><th class="hm">נוצר</th><th class="hm">שימוש אחרון</th><th></th></tr></thead><tbody>${list.map(k => `<tr${k.revoked_at ? ' style="opacity:.5"' : ''}><td><b>${esc(k.name)}</b><div class="mute" dir="ltr" style="text-align:end">${esc(k.prefix || '')}…</div></td><td>${(k.scopes || []).map(s => `<span class="bo-acc">${esc((API_SCOPES.find(x => x[0] === s) || [s, s])[1])}</span>`).join(' ')}</td><td class="hm mute bo-nw">${boDate(k.created_at)}</td><td class="hm mute bo-nw">${k.last_used_at ? boWhen(k.last_used_at) : '—'}</td><td>${k.revoked_at ? '<span class="mute">בוטל</span>' : `<button class="btn sm" data-revoke="${esc(k.id)}">ביטול</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="who">עדיין אין מפתחות.</p>'}
      <form class="bo-keyform"><input type="text" id="ak-name" maxlength="80" placeholder="שם המפתח, למשל: בוט וואטסאפ" aria-label="שם המפתח">
        <div class="bo-scopes">${API_SCOPES.map(([s, l]) => `<label><input type="checkbox" value="${s}"${s === 'orders:read' ? ' checked' : ''}> ${l}</label>`).join('')}</div>
        <button class="btn pri" type="submit">יצירת מפתח</button></form>`;
    const cp = sec.querySelector('#ak-copy'); if (cp) cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(fresh); toast('המפתח הועתק'); };
    sec.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
      if (!confirm('לבטל את המפתח? כל מערכת שמשתמשת בו תפסיק לעבוד מיד.')) return;
      const { data, error } = await PSDB.rpc('ps_api_key_revoke', { p_id: b.dataset.revoke });
      if (error || (data && data.error)) return toast('הביטול נכשל');
      paint(data); toast('המפתח בוטל');
    });
    sec.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const name = sec.querySelector('#ak-name').value.trim(), scopes = [...sec.querySelectorAll('.bo-scopes input:checked')].map(i => i.value);
      const btn = e.target.querySelector('button'); btn.disabled = true;
      const { data, error } = await PSDB.rpc('ps_api_key_create', { p_name: name, p_scopes: scopes });
      btn.disabled = false;
      if (error || !data || data.error) return toast(ERR[data && data.error] || 'היצירה נכשלה');
      paint(data.keys, data.key);
    };
  };
  const { data, error } = await PSDB.rpc('ps_api_keys');
  if (error || !Array.isArray(data)) { sec.innerHTML = '<p class="who">לא ניתן לטעון את מפתחות ה-API כרגע.</p>'; return; }
  paint(data);
}

/* ---------- DNS records of proteinstock.co.il (Cloudflare, through the dns-admin server function) ---------- */
const DNS_ERR = { not_configured: 'החיבור ל-Cloudflare עוד לא הוגדר (חסר מפתח CLOUDFLARE_API_TOKEN בשרת).', token_forbidden: 'מפתח ה-Cloudflare לא מורשה לדומיין. צריך מפתח עם הרשאת DNS Edit ל-proteinstock.co.il.', zone_not_found: 'הדומיין לא נמצא בחשבון ה-Cloudflare של המפתח.', protected: 'הרשומה הזו מוגנת', bad_type: 'סוג רשומה לא נתמך.', bad_name: 'השם לא תקין (אותיות באנגלית, ספרות, מקף ונקודה).', bad_content: 'חסר ערך.', bad_ip: 'כתובת IP לא תקינה.', forbidden: 'אין הרשאה.', unauthorized: 'ההתחברות פגה. התנתקו והתחברו שוב.' };
async function boDns() {
  setBar('dns', 'DNS ודומיין');
  document.getElementById('panel').classList.add('gray');
  const R = pane(); R.innerHTML = boLoading();
  const call = async body => {
    const { data, error } = await sb.functions.invoke('dns-admin', { body });
    if (data && data.error) return { err: data };
    if (error) { let d = null; try { d = await error.context.json(); } catch (x) { /* ignore */ } return { err: d || { error: 'error' } }; }
    return { data };
  };
  const errText = e => (DNS_ERR[e.error] || 'הפעולה נכשלה') + (e.why ? ` (${e.why}).` : '') + (e.detail && !DNS_ERR[e.error] ? ` ${e.detail}` : '');
  let editing = null;
  const paint = (recs, msg) => {
    R.innerHTML = `<div class="sp-card">
      <p class="who" style="margin:0 0 12px">רשומות ה-DNS של <b dir="ltr">proteinstock.co.il</b>. שינוי נכנס לתוקף תוך דקות. רשומות שהאתר והמייל תלויים בהן מסומנות 🔒 ולא ניתנות לשינוי מכאן.</p>
      ${msg ? `<div class="msg ${msg.ok ? 'ok' : 'err'}" style="margin-bottom:10px">${esc(msg.text)}</div>` : ''}
      <div class="sp-tw"><table class="sp-table bo-t"><thead><tr><th>סוג</th><th>שם</th><th>ערך</th><th class="hm">Proxy</th><th></th></tr></thead><tbody>
      ${recs.map(r => `<tr><td><b>${esc(r.type)}</b></td><td dir="ltr" style="text-align:end">${esc(r.name)}</td><td dir="ltr" style="text-align:end;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.content)}">${r.priority != null ? esc(r.priority) + ' ' : ''}${esc(r.content)}</td><td class="hm">${['A', 'AAAA', 'CNAME'].includes(r.type) ? (r.proxied ? '🟠 Proxied' : '⚪ DNS only') : ''}</td>
        <td class="bo-nw">${r.locked ? `<span class="mute" title="${esc(r.locked)}">🔒 ${esc(r.locked)}</span>` : `<button class="btn sm" data-edit="${esc(r.id)}">עריכה</button> <button class="btn sm" data-del="${esc(r.id)}">מחיקה</button>`}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="sp-card" style="margin-top:16px"><h2 class="bo-h2">${editing ? 'עריכת רשומה' : 'הוספת רשומה'}</h2>
      <form class="bo-dnsform"><select id="dn-type" aria-label="סוג">${['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA', 'SRV'].map(t => `<option${editing && editing.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <input id="dn-name" dir="ltr" placeholder="שם, למשל sales" aria-label="שם" value="${esc(editing ? editing.name : '')}">
        <input id="dn-content" dir="ltr" placeholder="ערך, למשל 31.97.156.232" aria-label="ערך" value="${esc(editing ? editing.content : '')}">
        <input id="dn-prio" dir="ltr" type="number" min="0" placeholder="עדיפות (MX)" aria-label="עדיפות" value="${esc(editing && editing.priority != null ? editing.priority : '')}">
        <label class="o"><input type="checkbox" id="dn-proxy"${editing && editing.proxied ? ' checked' : ''}> Proxy (ענן כתום)</label>
        <div style="display:flex;gap:8px"><button class="btn pri" type="submit">${editing ? 'שמירה' : 'הוספה'}</button>${editing ? '<button class="btn" type="button" id="dn-cancel">ביטול</button>' : ''}</div></form>
      <p class="who" style="margin:8px 0 0">לשרת שמתקין בעצמו תעודת אבטחה (כמו stock ו-sales) משאירים את ה-Proxy כבוי.</p></div>`;
    R.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editing = recs.find(r => r.id === b.dataset.edit); paint(recs); R.querySelector('#dn-content').focus(); });
    R.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = recs.find(x => x.id === b.dataset.del);
      if (!confirm(`למחוק את הרשומה ${r.type} ${r.name} → ${r.content}?`)) return;
      b.disabled = true;
      const { data, err } = await call({ action: 'delete', id: r.id });
      if (err) { b.disabled = false; return paint(recs, { text: errText(err) }); }
      paint(data.records, { ok: true, text: 'הרשומה נמחקה.' });
    });
    const cancel = R.querySelector('#dn-cancel'); if (cancel) cancel.onclick = () => { editing = null; paint(recs); };
    R.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const record = { type: R.querySelector('#dn-type').value, name: R.querySelector('#dn-name').value, content: R.querySelector('#dn-content').value, priority: R.querySelector('#dn-prio').value, proxied: R.querySelector('#dn-proxy').checked };
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      const { data, err } = await call(editing ? { action: 'update', id: editing.id, record } : { action: 'create', record });
      btn.disabled = false;
      if (err) return paint(recs, { text: errText(err) });
      editing = null; paint(data.records, { ok: true, text: 'נשמר. השינוי ייכנס לתוקף תוך כמה דקות.' });
    };
  };
  const { data, err } = await call({ action: 'list' });
  if (err) { R.innerHTML = `<div class="sp-card"><div class="msg err">${esc(errText(err))}</div></div>`; return; }
  paint(data.records);
}
