/* Admin: discount coupons (list, create, edit, delete, generate a series of one-time codes).
   Uses the admin globals: sb, esc, money, toast, setBar, pane, ICO, CATS. The checkout prices coupons on the server. */
const CP = { rows: [], tab: 'all', q: '', page: 0, products: null };
const CP_PAGE = 50;
const CP_APPLY = { all: 'כל החנות', categories: 'קטגוריות', products: 'מוצרים' };
const cpCode = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const cpDate = d => d ? new Date(d).toLocaleDateString('he-IL') : '';
const cpLocal = d => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
function cpState(c) {
  const now = Date.now();
  if (!c.active) return ['off', 'כבוי'];
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return ['exp', 'פג תוקף'];
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return ['soon', 'עוד לא התחיל'];
  if (c.max_uses != null && c.uses_count >= c.max_uses) return ['used', 'נוצל'];
  return ['on', 'פעיל'];
}
const cpValue = c => c.type === 'fixed' ? money(c.value) : Number(c.value) + '%';
const cpScope = c => c.applies_to === 'categories' ? (c.category_ids || []).map(id => (CATS.find(x => x.id === id) || {}).name || id).join(', ')
  : c.applies_to === 'products' ? (c.product_ids || []).length + ' מוצרים' : CP_APPLY.all;
const cpSeries = code => { const m = String(code).match(/^(.+)-[A-Z0-9]{4,6}$/); return m ? m[1] : ''; };

async function coupons() {
  setBar('coupons', 'קופונים', '<button class="btn" id="cp-gen">יצירת סדרת קודים</button><button class="btn pri" id="cp-new">קופון חדש</button>');
  document.getElementById('cp-new').onclick = () => cpEdit(null);
  document.getElementById('cp-gen').onclick = () => cpGenerate();
  pane().innerHTML = '<p class="empty">טוען קופונים…</p>';
  const { data, error } = await sb.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) { pane().innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
  CP.rows = data || [];
  cpList();
}

function cpList() {
  const R = pane();
  const tabs = [['all', 'הכל'], ['on', 'פעילים'], ['used', 'נוצלו'], ['exp', 'פג תוקף'], ['off', 'כבויים']];
  const q = CP.q.toLowerCase();
  const rows = CP.rows.filter(c => (CP.tab === 'all' || cpState(c)[0] === CP.tab) && (!q || c.code.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / CP_PAGE)); CP.page = Math.min(CP.page, pages - 1);
  const shown = rows.slice(CP.page * CP_PAGE, (CP.page + 1) * CP_PAGE);
  const series = {}; CP.rows.forEach(c => { const s = cpSeries(c.code); if (s) series[s] = (series[s] || 0) + 1; });
  const usedTotal = CP.rows.reduce((s, c) => s + (c.uses_count || 0), 0);
  R.innerHTML = `<div class="sp-card"><div class="sp-tabbar"><div class="tb" role="tablist">${tabs.map(([k, v]) => `<button role="tab" data-tab="${k}" aria-selected="${CP.tab === k}">${v} (${k === 'all' ? CP.rows.length : CP.rows.filter(c => cpState(c)[0] === k).length})</button>`).join('')}</div></div>
    <div class="sp-search"><input type="search" id="cp-q" placeholder="חיפוש לפי קוד או תיאור" value="${esc(CP.q)}" aria-label="חיפוש קופונים"></div>
    <div class="sp-tw"><table class="sp-table cp-table"><thead><tr><th>קוד</th><th>הנחה</th><th>חל על</th><th>שימושים</th><th>תוקף</th><th>סטטוס</th><th>תיאור</th></tr></thead><tbody>
    ${shown.map(c => { const [k, v] = cpState(c); return `<tr data-code="${esc(c.code)}"><td dir="ltr" class="cp-code">${esc(c.code)}</td><td>${cpValue(c)}</td><td>${esc(cpScope(c))}</td><td>${c.uses_count || 0}${c.max_uses != null ? ' / ' + c.max_uses : ''}</td><td class="cp-dates">${c.starts_at || c.ends_at ? `${cpDate(c.starts_at) || '—'} – ${cpDate(c.ends_at) || '—'}` : 'ללא הגבלה'}</td><td><span class="cp-st ${k}">${v}</span></td><td class="cp-desc">${esc(c.description || '')}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">אין קופונים להצגה</td></tr>'}
    </tbody></table></div>
    ${pages > 1 ? `<div class="cp-pg"><button class="btn" id="cp-prev"${CP.page ? '' : ' disabled'}>הקודם</button><span>עמוד ${CP.page + 1} מתוך ${pages} · ${rows.length} קופונים</span><button class="btn" id="cp-next"${CP.page < pages - 1 ? '' : ' disabled'}>הבא</button></div>` : ''}
  </div>
  <p class="who">סה"כ ${CP.rows.length} קופונים${Object.keys(series).length ? ' · סדרות: ' + Object.entries(series).map(([s, n]) => `${esc(s)} (${n})`).join(', ') : ''} · שימושים בהזמנות ששולמו: ${usedTotal}. הזמנה שממתינה לתשלום שומרת את הקוד לשעתיים, כדי שקוד חד-פעמי לא ינוצל פעמיים.</p>`;
  R.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { CP.tab = b.dataset.tab; CP.page = 0; cpList(); });
  const qi = R.querySelector('#cp-q'); qi.oninput = () => { CP.q = qi.value.trim(); CP.page = 0; const pos = qi.selectionStart; cpList(); const n = pane().querySelector('#cp-q'); n.focus(); n.setSelectionRange(pos, pos); };
  R.querySelectorAll('tr[data-code]').forEach(tr => tr.onclick = () => cpEdit(CP.rows.find(c => c.code === tr.dataset.code)));
  const pv = R.querySelector('#cp-prev'), nx = R.querySelector('#cp-next');
  if (pv) pv.onclick = () => { CP.page--; cpList(); };
  if (nx) nx.onclick = () => { CP.page++; cpList(); };
}

async function cpProducts() {
  if (CP.products) return CP.products;
  const { data } = await sb.from('products').select('id,title').order('title');
  CP.products = data || []; return CP.products;
}

/* the form shared by "edit" and "generate a series" */
function cpFormHtml(c, series) {
  return `<div class="sp-card sp-pad cp-form">
    ${series ? `<div class="row2c"><label class="fld"><span>תחילית לקודים</span><input type="text" id="c-prefix" maxlength="20" dir="ltr" placeholder="למשל OPEN30"></label>
      <label class="fld"><span>כמה קודים ליצור</span><input type="number" id="c-count" min="1" max="500" step="1" value="50" dir="ltr"></label></div>
      <p class="who">כל קוד נוצר בצורה PREFIX-XXXXX, וכברירת מחדל כל קוד הוא לשימוש אחד.</p>`
      : `<label class="fld"><span>קוד הקופון</span><input type="text" id="c-code" maxlength="40" dir="ltr" value="${esc(c ? c.code : '')}"${c ? ' readonly' : ''} placeholder="למשל SUMMER20"></label>${c ? '<p class="who">אי אפשר לשנות קוד קיים. כדי לשנות, צרו קופון חדש.</p>' : ''}`}
    <div class="row2c"><label class="fld"><span>סוג הנחה</span><select id="c-type"><option value="percentage">אחוז מהמחיר</option><option value="fixed">סכום קבוע (₪)</option></select></label>
      <label class="fld"><span>ערך ההנחה</span><input type="number" id="c-value" min="0.01" max="40" step="0.01" dir="ltr" value="${c ? Number(c.value) : ''}"></label></div>
    <label class="fld"><span>חל על</span><select id="c-apply">${Object.entries(CP_APPLY).map(([k, v]) => `<option value="${k}">${v === CP_APPLY.all ? v : 'רק ' + v + ' מסוימים'}</option>`).join('')}</select></label>
    <div id="c-cats" class="cp-picks">${CATS.map(x => `<label class="chk"><input type="checkbox" value="${esc(x.id)}"${c && (c.category_ids || []).includes(x.id) ? ' checked' : ''}> ${esc(x.name)}</label>`).join('')}</div>
    <div id="c-prods" class="cp-picks"><input type="search" id="c-psearch" placeholder="סינון מוצרים" aria-label="סינון מוצרים"><div id="c-plist" class="cp-plist"><p class="who">טוען מוצרים…</p></div></div>
    <div class="row2c"><label class="fld"><span>מינימום הזמנה (₪, לא חובה)</span><input type="number" id="c-min" min="0" step="1" dir="ltr" value="${c && c.min_order_amount != null ? Number(c.min_order_amount) : ''}"></label>
      <label class="fld"><span>מספר שימושים מקסימלי (ריק = ללא הגבלה)</span><input type="number" id="c-max" min="1" step="1" dir="ltr" value="${series ? 1 : c && c.max_uses != null ? c.max_uses : ''}"></label></div>
    <div class="row2c"><label class="fld"><span>תחילת תוקף (לא חובה)</span><input type="date" id="c-start" value="${cpLocal(c && c.starts_at)}"></label>
      <label class="fld"><span>סוף תוקף (כולל היום הזה, לא חובה)</span><input type="date" id="c-end" value="${cpLocal(c && c.ends_at)}"></label></div>
    <label class="fld"><span>תיאור פנימי (לא מוצג ללקוחות)</span><input type="text" id="c-desc" maxlength="300" value="${esc(c ? c.description || '' : '')}"></label>
    <label class="chk"><input type="checkbox" id="c-active"${!c || c.active ? ' checked' : ''}> פעיל</label>
    ${c ? `<p class="who">שימושים עד היום: ${c.uses_count || 0}${c.max_uses != null ? ' מתוך ' + c.max_uses : ''}</p>` : ''}
    <p class="msg err" id="c-err" hidden></p>
  </div>`;
}

function cpBindForm(c) {
  const $ = s => pane().querySelector(s);
  $('#c-type').value = c ? c.type : 'percentage';
  $('#c-apply').value = c ? c.applies_to : 'all';
  const picked = new Set(c ? c.product_ids || [] : []);
  const showScope = () => { $('#c-cats').hidden = $('#c-apply').value !== 'categories'; $('#c-prods').hidden = $('#c-apply').value !== 'products'; };
  $('#c-apply').onchange = showScope; showScope();
  const drawProds = async () => {
    const list = await cpProducts(), q = $('#c-psearch').value.trim().toLowerCase();
    $('#c-plist').innerHTML = list.filter(p => !q || p.title.toLowerCase().includes(q) || picked.has(p.id)).map(p => `<label class="chk"><input type="checkbox" value="${esc(p.id)}"${picked.has(p.id) ? ' checked' : ''}> ${esc(p.title)}</label>`).join('') || '<p class="who">לא נמצאו מוצרים</p>';
    $('#c-plist').querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? picked.add(i.value) : picked.delete(i.value); });
  };
  $('#c-psearch').oninput = drawProds; drawProds();
  return () => {   // read + validate; returns { values } or { error }
    const type = $('#c-type').value, value = parseFloat($('#c-value').value), applies_to = $('#c-apply').value;
    if (!(value > 0)) return { error: 'נא להזין ערך הנחה' };
    // store rule: a coupon never gives more than 40% off (MAX_COUPON_PCT in api/_lib/coupons.js)
    if (type === 'percentage' && value > 40) return { error: 'אחוז ההנחה לא יכול לעלות על 40' };
    const category_ids = applies_to === 'categories' ? [...$('#c-cats').querySelectorAll('input:checked')].map(i => i.value) : [];
    const product_ids = applies_to === 'products' ? [...picked] : [];
    if (applies_to === 'categories' && !category_ids.length) return { error: 'נא לבחור לפחות קטגוריה אחת' };
    if (applies_to === 'products' && !product_ids.length) return { error: 'נא לבחור לפחות מוצר אחד' };
    const min = $('#c-min').value.trim(), max = $('#c-max').value.trim(), s = $('#c-start').value, e = $('#c-end').value;
    if (max && !(parseInt(max, 10) >= 1)) return { error: 'מספר השימושים חייב להיות 1 או יותר' };
    const starts_at = s ? new Date(s + 'T00:00:00').toISOString() : null, ends_at = e ? new Date(e + 'T23:59:59').toISOString() : null;
    if (starts_at && ends_at && ends_at < starts_at) return { error: 'סוף התוקף לפני ההתחלה' };
    return { values: { type, value, applies_to, category_ids, product_ids, min_order_amount: min ? parseFloat(min) : null, max_uses: max ? parseInt(max, 10) : null,
      starts_at, ends_at, description: $('#c-desc').value.trim(), active: $('#c-active').checked } };
  };
}

function cpHeader(title, onSave, del) {
  setBar('coupons', title, `<button class="btn" id="c-back">חזרה לקופונים</button>${del ? '<button class="btn danger" id="c-del">מחיקה</button>' : ''}<button class="btn pri" id="c-save">שמירה</button>`);
  document.getElementById('c-back').onclick = () => cpList2();
  document.getElementById('c-save').onclick = onSave;
}
const cpList2 = () => { setBar('coupons', 'קופונים', '<button class="btn" id="cp-gen">יצירת סדרת קודים</button><button class="btn pri" id="cp-new">קופון חדש</button>'); document.getElementById('cp-new').onclick = () => cpEdit(null); document.getElementById('cp-gen').onclick = () => cpGenerate(); cpList(); };
const cpErr = m => { const e = pane().querySelector('#c-err'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

function cpEdit(c) {
  pane().innerHTML = cpFormHtml(c, false);
  const read = cpBindForm(c);
  cpHeader(c ? 'קופון ' + c.code : 'קופון חדש', async e => {
    const r = read(); if (r.error) { cpErr(r.error); return; }
    const code = c ? c.code : cpCode(pane().querySelector('#c-code').value);
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) { cpErr('קוד הקופון יכול להכיל אותיות באנגלית, ספרות, מקף וקו תחתון (2–40 תווים)'); return; }
    e.target.disabled = true;
    const { data, error } = c
      ? await sb.from('coupons').update(r.values).eq('code', code).select('*')
      : await sb.from('coupons').insert({ code, ...r.values }).select('*');
    e.target.disabled = false;
    if (error) { cpErr(/duplicate|23505|unique/i.test(error.message) ? 'כבר קיים קופון עם הקוד הזה' : 'השמירה נכשלה: ' + error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (c) Object.assign(c, row || r.values); else CP.rows.unshift(row || { code, uses_count: 0, ...r.values });
    toast('הקופון נשמר'); cpList2();
  }, !!c);
  const del = document.getElementById('c-del');
  if (del) del.onclick = async () => {
    if (!confirm(`למחוק את הקופון ${c.code}? הזמנות קודמות שהשתמשו בו לא ישתנו.`)) return;
    del.disabled = true;
    const { error } = await sb.from('coupons').delete().eq('code', c.code);
    del.disabled = false;
    if (error) { toast('המחיקה נכשלה: ' + error.message); return; }
    CP.rows = CP.rows.filter(x => x.code !== c.code); toast('הקופון נמחק'); cpList2();
  };
}

function cpGenerate() {
  pane().innerHTML = cpFormHtml(null, true);
  const read = cpBindForm(null);
  cpHeader('יצירת סדרת קודים', async e => {
    const r = read(); if (r.error) { cpErr(r.error); return; }
    const prefix = cpCode(pane().querySelector('#c-prefix').value), n = parseInt(pane().querySelector('#c-count').value, 10);
    if (!/^[A-Z0-9_]{2,20}$/.test(prefix)) { cpErr('התחילית יכולה להכיל אותיות באנגלית, ספרות וקו תחתון (2–20 תווים)'); return; }
    if (!(n >= 1 && n <= 500)) { cpErr('אפשר ליצור בין 1 ל-500 קודים בכל פעם'); return; }
    const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', have = new Set(CP.rows.map(c => c.code)), codes = new Set();
    while (codes.size < n) { const b = crypto.getRandomValues(new Uint8Array(5)); const k = prefix + '-' + Array.from(b, x => AB[x % AB.length]).join(''); if (!have.has(k)) codes.add(k); }
    e.target.disabled = true;
    const rows = [...codes].map(code => ({ code, ...r.values })), made = [];
    for (let i = 0; i < rows.length; i += 200) {   // the server takes up to 200 rows per request
      const { data, error } = await sb.from('coupons').insert(rows.slice(i, i + 200)).select('*');
      if (error) { e.target.disabled = false; CP.rows = [...made, ...CP.rows]; cpErr(`היצירה נעצרה אחרי ${made.length} קודים: ` + error.message); return; }
      made.push(...(data || []));
    }
    e.target.disabled = false;
    CP.rows = [...made, ...CP.rows];
    toast(`נוצרו ${codes.size} קודים`); CP.q = prefix + '-'; CP.tab = 'all'; CP.page = 0; cpList2();
  }, false);
}
