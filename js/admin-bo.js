/* Back office: dashboard, orders, order page, customers and coupon usage.
   Reads from /api/reports (admin only). Uses the admin globals: sb, esc, money, when, STATUS, toast, setBar, pane, ICO.
   Days are Israel days; "revenue" counts paid orders only. */
const BO = {
  range: { preset: '30d', from: '', to: '' },
  orders: { q: '', status: 'all', coupon: '', delivery: '', sort: 'created_at', dir: 'desc', page: 0, customer: '' },
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
const boBadge = s => `<span class="badge ${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const BO_PRESETS = [['today', 'היום'], ['yesterday', 'אתמול'], ['7d', '7 הימים האחרונים'], ['30d', '30 הימים האחרונים'], ['90d', '90 הימים האחרונים'], ['month', 'החודש הנוכחי'], ['lastmonth', 'החודש הקודם'], ['year', 'השנה הנוכחית'], ['all', 'כל הזמנים'], ['custom', 'טווח מותאם…']];
const BO_ICO = {
  home: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16.5V9l6.5-5.5L16.5 9v7.5h-4.5v-4.5h-4v4.5z"/></svg>',
  customers: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M13 4.2a3 3 0 0 1 0 5.6M15 12.3c1.3.6 2.2 2 2.5 4.2"/></svg>',
  couponUse: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16.5h13"/><path d="M5.5 13.5v-4M10 13.5v-8M14.5 13.5v-6"/></svg>',
  print: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 7.5v-4h9v4M5.5 13.5h-2v-6h13v6h-2"/><path d="M5.5 11.5h9v5h-9z"/></svg>',
  dl: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 15.5h12"/></svg>',
};

/* ---------- data ---------- */
async function boApi(action, params) {
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
async function boHome() {
  setBar('home', 'לוח בקרה', `<button class="btn" id="bo-csv-h">${ICO.dl}ייצוא הזמנות</button>`);
  document.getElementById('bo-csv-h').onclick = () => { const { from, to } = boRange(); boExportOrders({ from, to }); };
  document.getElementById('panel').classList.add('gray');
  const R = pane();
  R.innerHTML = `<div class="bo-top">${boRangeHtml('bo-r')}</div><div id="bo-body">${boLoading('טוען נתונים…')}</div>`;
  boBindRange('bo-r', boHome);
  const { from, to } = boRange();
  const { data, error } = await boApi('summary', { from, to });
  const body = document.getElementById('bo-body'); if (!body) return;
  if (error) { body.innerHTML = boError(error); return; }
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
  const tile = (label, value, d, sub, go) => `<button class="bo-tile" ${go ? `data-go="${esc(go)}"` : 'disabled'}><span class="bo-tl">${label}</span><span class="bo-tv">${value}</span><span class="bo-ts">${d || ''}${sub ? `<span>${sub}</span>` : ''}</span></button>`;
  const maxP = Math.max(1, ...data.products.map(x => Number(x.revenue)));
  const maxC = Math.max(1, ...data.coupons.map(x => x.uses));
  const st = Object.fromEntries(data.statuses.map(s => [s.status, s]));
  const allN = data.statuses.reduce((s, x) => s + x.n, 0);
  body.innerHTML = `
    <section class="bo-hero sp-card sp-pad"><div class="bo-hl">הכנסות מהזמנות ששולמו · ${esc(boRangeLabel())}</div>
      <div class="bo-hv">${boMoney(k.revenue)}</div><div class="bo-hs">${delta(k.revenue, p.revenue)}<span>תקופה קודמת: ${boMoney(p.revenue)}</span></div>
      <div class="bo-chart-h"><div class="tb" role="tablist" aria-label="מה להציג בגרף"><button role="tab" data-m="revenue" aria-selected="${BO.metric === 'revenue'}">הכנסות</button><button role="tab" data-m="paid" aria-selected="${BO.metric === 'paid'}">הזמנות ששולמו</button><button role="tab" data-m="orders" aria-selected="${BO.metric === 'orders'}">כל ההזמנות</button></div>
        <button class="btn link" id="bo-tbl" aria-expanded="false">הצגה כטבלה</button></div>
      <div class="bo-chart" id="bo-chart"></div><div id="bo-ctbl" hidden></div></section>
    <div class="bo-tiles">
      ${tile('הזמנות ששולמו', k.paid_orders.toLocaleString('he-IL'), delta(k.paid_orders, p.paid_orders), `מתוך ${k.all_orders} הזמנות`, 'paid')}
      ${tile('ממוצע להזמנה', boMoney(aov), delta(aov, paov), '', 'paid')}
      ${tile('לקוחות שקנו', k.customers.toLocaleString('he-IL'), delta(k.customers, p.customers), `${k.new_customers} לקוחות חדשים`, 'customers')}
      ${tile('הנחות בקופונים', boMoney(k.discounts), delta(k.discounts, p.discounts, false), `${k.coupon_orders} הזמנות עם קופון`, 'couponUse')}
      ${tile('ממתינות לתשלום', k.pending_orders.toLocaleString('he-IL'), '', `בשווי ${boMoney(k.pending_value)}`, 'pending')}
      ${tile('נכשלו / בוטלו / הוחזרו', k.lost_orders.toLocaleString('he-IL'), '', '', 'lost')}
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
  boChart(data.series);
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { BO.metric = b.dataset.m; body.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-selected', x === b)); boChart(data.series); });
  document.getElementById('bo-tbl').onclick = e => { const t = document.getElementById('bo-ctbl'); t.hidden = !t.hidden; e.target.setAttribute('aria-expanded', !t.hidden); e.target.textContent = t.hidden ? 'הצגה כטבלה' : 'הסתרת הטבלה'; };
  body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const g = b.dataset.go, O = BO.orders;
    if (g === 'customers') return boGo('customers');
    if (g === 'couponUse') return boGo('couponUse');
    Object.assign(O, { q: '', coupon: '', delivery: '', customer: '', page: 0, status: g === 'lost' ? 'failed,cancelled,refunded' : g === 'all' ? 'all' : g });
    boGo('orders');
  });
  body.querySelectorAll('tr[data-coupon]').forEach(tr => tr.onclick = () => boCoupon(tr.dataset.coupon));
  body.querySelectorAll('tr[data-q]').forEach(tr => tr.onclick = () => { Object.assign(BO.orders, { q: tr.dataset.q, status: 'paid', coupon: '', delivery: '', customer: '', page: 0 }); boGo('orders'); });
  boBindOrderRows(body);
}

/* columns chart, one series: revenue / paid orders / all orders per day (weeks or months on long ranges) */
function boChart(series) {
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
    return `<path d="M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y0 + h}Z" class="bo-bar"/>`;
  };
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${isMoney ? 'הכנסות' : 'הזמנות'} לפי ${unit === 'day' ? 'יום' : unit === 'week' ? 'שבוע' : 'חודש'}">
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
  if (!host.__ro) { host.__ro = new ResizeObserver(() => { clearTimeout(host.__t); host.__t = setTimeout(() => boChart(series), 120); }); host.__ro.observe(host); host.__w = W; }
  else if (Math.abs((host.__w || 0) - W) < 2) return;
  host.__w = W;
}

/* ---------- orders ---------- */
function boOrdersTable(rows, opt = {}) {
  const O = BO.orders;
  const th = (k, label, cls = '') => opt.compact ? `<th class="${cls}">${label}</th>` : `<th class="${cls}"><button class="bo-sort" data-sort="${k}" aria-sort="${O.sort === k ? (O.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}${O.sort === k ? (O.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<div class="sp-tw"><table class="sp-table bo-t bo-orders"><thead><tr>${th('number', 'הזמנה')}${th('created_at', 'תאריך')}${opt.noCustomer ? '' : th('customer_name', 'לקוח')}<th class="hm">פריטים</th>${th('discount', 'קופון')}<th>תשלום</th>${th('paid_at', 'שולם ב-', 'hm')}${th('total', 'סה"כ', 'num')}</tr></thead><tbody>
    ${rows.map(o => `<tr data-order="${esc(o.id)}" tabindex="0"><td class="bo-num" dir="ltr">${esc(o.number)}</td><td class="mute bo-nw">${boWhen(o.created_at)}</td>
      ${opt.noCustomer ? '' : `<td><div class="bo-name">${esc(o.customer_name)}</div><div class="mute" dir="ltr" style="text-align:end">${esc(o.phone)}</div></td>`}
      <td class="hm mute">${o.items != null ? o.items + ' יח׳' : ''}${o.delivery === 'pickup' ? '<div>איסוף עצמי</div>' : ''}</td>
      <td>${o.coupon_code ? `<span class="bo-code" dir="ltr">${esc(o.coupon_code)}</span><div class="neg">−${boMoney(o.discount)}</div>` : '<span class="mute">—</span>'}</td>
      <td>${boBadge(o.status)}${o.payment_provider ? `<div class="mute">${esc(o.payment_provider === 'payplus' ? 'PayPlus' : o.payment_provider)}</div>` : ''}</td>
      <td class="hm mute bo-nw">${o.paid_at ? boWhen(o.paid_at) : '—'}</td><td class="num"><b>${boMoney(o.total)}</b></td></tr>`).join('')}
  </tbody></table></div>`;
}
function boBindOrderRows(root) {
  root.querySelectorAll('tr[data-order]').forEach(tr => {
    tr.onclick = () => boOrder(tr.dataset.order);
    tr.onkeydown = e => { if (e.key === 'Enter') boOrder(tr.dataset.order); };
  });
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
      <select id="bo-dl" aria-label="משלוח"><option value="">משלוח ואיסוף</option><option value="shipping"${O.delivery === 'shipping' ? ' selected' : ''}>משלוח בלבד</option><option value="pickup"${O.delivery === 'pickup' ? ' selected' : ''}>איסוף עצמי בלבד</option></select></div>
    ${O.customer ? `<div class="bo-chipbar">מציג הזמנות של לקוח אחד <button class="btn link" id="bo-cx">הצגת כל הלקוחות</button></div>` : ''}
    <div id="bo-list">${'<p class="sp-empty">טוען הזמנות…</p>'}</div></div>`;
  boBindRange('bo-r', () => { O.page = 0; boOrders(); });
  R.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { O.status = b.dataset.st; O.page = 0; boOrders(); });
  let t; const qi = R.querySelector('#bo-q');
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { O.q = qi.value.trim(); O.page = 0; boOrdersLoad(); }, 300); };
  R.querySelector('#bo-cp').onchange = e => { O.coupon = e.target.value; O.page = 0; boOrdersLoad(); };
  R.querySelector('#bo-dl').onchange = e => { O.delivery = e.target.value; O.page = 0; boOrdersLoad(); };
  const cx = R.querySelector('#bo-cx'); if (cx) cx.onclick = () => { O.customer = ''; O.page = 0; boOrders(); };
  document.getElementById('bo-csv').onclick = () => boExportOrders(boOrderParams());
  boOrdersLoad();
}
function boOrderParams() {
  const O = BO.orders, { from, to } = boRange();
  return { from, to, status: O.status, q: O.q, coupon: O.coupon, delivery: O.delivery, customer: O.customer, sort: O.sort, dir: O.dir };
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
  pane().innerHTML = `<div class="bo-oh"><span class="bo-num" dir="ltr">${esc(o.number)}</span>${boBadge(o.status)}${o.coupon_code ? `<span class="bo-code" dir="ltr">${esc(o.coupon_code)}</span>` : ''}<span class="mute">${boWhen(o.created_at)}</span></div>
  <div class="sp-grid">
    <div>
      <section class="sp-card"><div class="bo-ch"><h2>פריטים</h2><span class="mute">${o.order_items.reduce((s, i) => s + i.qty, 0)} יחידות</span></div>
        <div class="sp-tw"><table class="sp-table bo-t bo-items"><thead><tr><th>מוצר</th><th class="num">מחיר</th><th class="num">כמות</th><th class="num">סה"כ</th></tr></thead><tbody>
        ${o.order_items.map(i => `<tr><td><a class="bo-name" href="/product?id=${encodeURIComponent(i.product_id)}" target="_blank" rel="noopener">${esc(i.title)}</a><div class="mute" dir="ltr" style="text-align:end">${esc(i.product_id)}</div></td><td class="num">${boMoney(i.unit_price)}</td><td class="num">${i.qty}</td><td class="num">${boMoney(i.line_total)}</td></tr>`).join('')}
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
        <p class="mute bo-note">סימון "שולמה" ידני מתאים לתשלום בהעברה, בביט או במזומן. ביטול או החזרה מחזירים את הפריטים למלאי.</p></section>
    </div>
    <div>
      <section class="sp-card sp-pad"><h2>לקוח</h2>
        <button class="bo-cust-l" id="bo-cust">${esc(o.customer_name)}</button>
        <div class="mute">${c.paid} הזמנות ששולמו · ${boMoney(c.spent)}${c.orders > 1 ? ` · לקוח מ-${boDate(c.first)}` : ' · לקוח חדש'}</div>
        <div class="bo-kv bo-kv1"><div><span>טלפון</span><a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a> · <a href="${esc(boWa(o.phone))}" target="_blank" rel="noopener">וואטסאפ</a></div>
          ${o.email ? `<div><span>אימייל</span><a href="mailto:${esc(o.email)}" dir="ltr">${esc(o.email)}</a></div>` : ''}
          <div><span>${o.delivery === 'pickup' ? 'מסירה' : 'כתובת למשלוח'}</span>${o.delivery === 'pickup' ? 'איסוף עצמי מהחנות' : esc(o.address || '—')}</div>
          ${o.notes ? `<div><span>הערות הלקוח</span>${esc(o.notes)}</div>` : ''}</div></section>
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
  const sel = P.querySelector('#bo-status');
  sel.onchange = async () => {
    const next = sel.value, prev = o.status;
    if (['cancelled', 'refunded', 'failed'].includes(next) && !confirm(`לשנות את הזמנה ${o.number} ל"${STATUS[next]}"? הפריטים יחזרו למלאי${prev === 'paid' && o.coupon_code ? ' והשימוש בקופון יבוטל' : ''}.`)) { sel.value = prev; return; }
    sel.disabled = true;
    const { error } = await sb.from('orders').update({ status: next }).eq('id', o.id);
    sel.disabled = false;
    if (error) { sel.value = prev; toast('השמירה נכשלה: ' + error.message); return; }
    toast('הסטטוס עודכן'); boOrder(o.id, from);
  };
}

/* ---------- customers ---------- */
async function boCustomers() {
  setBar('customers', 'לקוחות', `<button class="btn" id="bo-ccsv">${ICO.dl}ייצוא ל-Excel</button>`);
  document.getElementById('panel').classList.add('gray');
  const C = BO.customers, R = pane();
  R.innerHTML = `<div class="sp-card"><div class="bo-filters"><input type="search" id="bo-cq" placeholder="חיפוש לפי שם, טלפון או אימייל" value="${esc(C.q)}" aria-label="חיפוש לקוחות"></div><div id="bo-clist"><p class="sp-empty">טוען לקוחות…</p></div></div>
    <p class="who">לקוח מזוהה לפי מספר הטלפון. הסכומים כוללים רק הזמנות ששולמו.</p>`;
  let t; const qi = R.querySelector('#bo-cq');
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { C.q = qi.value.trim(); C.page = 0; boCustomersLoad(); }, 300); };
  document.getElementById('bo-ccsv').onclick = boExportCustomers;
  boCustomersLoad();
}
async function boCustomersLoad() {
  const C = BO.customers, el = document.getElementById('bo-clist'); if (!el) return;
  el.style.opacity = '.55';
  const { data, error } = await boApi('customers', { q: C.q, sort: C.sort, dir: C.dir, page: C.page, size: BO_PAGE });
  const box = document.getElementById('bo-clist'); if (!box) return;
  box.style.opacity = '';
  if (error) { box.innerHTML = boError(error); return; }
  const pages = Math.max(1, Math.ceil(data.count / BO_PAGE));
  const th = (k, label, cls = '') => `<th class="${cls}"><button class="bo-sort" data-sort="${k}">${label}${C.sort === k ? (C.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  box.innerHTML = (data.rows.length ? `<div class="sp-tw"><table class="sp-table bo-t"><thead><tr>${th('name', 'לקוח')}<th class="hm">אימייל</th>${th('orders', 'הזמנות', 'num')}${th('spent', 'סה"כ קניות', 'num')}<th class="hm num">חסך בקופונים</th><th>קופונים</th>${th('first', 'לקוח מאז', 'hm')}${th('last', 'הזמנה אחרונה')}</tr></thead><tbody>
    ${data.rows.map(c => `<tr data-key="${esc(c.key)}" data-name="${esc(c.name)}" tabindex="0"><td><div class="bo-name">${esc(c.name)}</div><div class="mute" dir="ltr" style="text-align:end">${esc(c.phone)}</div></td>
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
/* deep links: #order=<id>, #customer=<phone>, #coupon=<code> */
function boDeepLink() {
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
    ['מספר הזמנה', 'תאריך', 'סטטוס', 'לקוח', 'טלפון', 'אימייל', 'משלוח', 'כתובת', 'פריטים', 'סכום ביניים', 'קופון', 'הנחה', 'דמי משלוח', 'סה"כ', 'ספק סליקה', 'מזהה עסקה', 'תאריך תשלום', 'הערות'],
    data.rows.map(o => [o.number, boWhen(o.created_at), STATUS[o.status] || o.status, o.customer_name, o.phone, o.email || '', o.delivery === 'pickup' ? 'איסוף עצמי' : 'משלוח', o.delivery === 'pickup' ? '' : o.address || '',
      (o.order_items || []).map(i => `${i.title} ×${i.qty}`).join(' | '), o.subtotal, o.coupon_code || '', o.discount, o.shipping, o.total, o.payment_provider || '', o.payment_ref || '', o.paid_at ? boWhen(o.paid_at) : '', o.notes || '']));
}
async function boExportCustomers() {
  toast('מכין קובץ…');
  const { data, error } = await boApi('customers', { q: BO.customers.q, size: 5000, sort: 'spent', dir: 'desc' });
  if (error) { toast('הייצוא נכשל: ' + error); return; }
  boCsv('customers.csv', ['שם', 'טלפון', 'אימייל', 'כתובת אחרונה', 'הזמנות ששולמו', 'כל ההזמנות', 'סה"כ קניות', 'חסך בקופונים', 'קופונים', 'לקוח מאז', 'הזמנה אחרונה'],
    data.rows.map(c => [c.name, c.phone, c.email || '', c.address || '', c.paid, c.orders, c.spent, c.saved, (c.coupons || []).join(' '), boDate(c.first), boDate(c.last)]));
}
