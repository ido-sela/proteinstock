/* Admin → Products: list, bulk actions, product page, photos, import/export.
   Uses globals from admin.html: sb, pane, esc, money, toast. Catalog helpers come from catalog.js / data.js. */
const SP_COLS = 'id,title,description,price,old_price,out_of_stock,status,vendor,category,tags,image,quantity,sku,created_at,updated_at';
const SP_STATUS = { active: 'פעיל', draft: 'טיוטה', archived: 'בארכיון' };
const SP_STATUS_HINT = { active: 'המוצר מוצג בחנות וניתן להזמין אותו.', draft: 'המוצר מוסתר מהחנות עד שתהפכו אותו לפעיל.', archived: 'המוצר מוסתר מהחנות ונשמר בארכיון.' };
const SP_PAGE = 50;
const SP_LOGO = 'img/protein-stock-sports-nutrition-e-commerce-logo.webp';
const SP = { rows: [], tab: 'all', q: '', sort: 'title', page: 0, sel: new Set() };
const SP_BUILT = {};
try { RAW.map(build).forEach(p => { SP_BUILT[p.id] = p; }); } catch (e) { /* no built-in catalog */ }

/* Rows that were seeded with a shortened title and no photo are shown with their full catalog data;
   saving them (or running the import) writes that data to the database. */
function spNorm(r) {
  const b = SP_BUILT[r.id];
  const row = { ...r, price: Number(r.price), old_price: Number(r.old_price) || 0, tags: r.tags || [], virtual: false };
  if (!r.image && b) Object.assign(row, { title: b.title, vendor: r.vendor || b.brand || null, category: r.category || b.cat, tags: r.tags && r.tags.length ? r.tags : (b.tags || []), image: b.img, virtual: true });
  return row;
}
const spCat = id => (typeof CATS !== 'undefined' && (CATS.find(c => c.id === id) || {}).name) || '';
const spNewId = () => { let id; do { id = Math.random().toString(36).slice(2, 8); } while (SP.rows.some(r => r.id === id)); return id; };

function spAsk(title, text, ok, danger) {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'sp-modal';
    o.innerHTML = `<div class="sp-dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="sp-dlg-f"><button class="btn ${danger ? 'danger' : 'pri'}" data-r="1">${esc(ok)}</button><button class="btn" data-r="0">ביטול</button></div></div>`;
    const done = v => { o.remove(); document.removeEventListener('keydown', key); res(v); };
    const key = e => { if (e.key === 'Escape') done(false); };
    o.onclick = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === o) done(false); };
    document.addEventListener('keydown', key);
    document.body.append(o); o.querySelector('[data-r="0"]').focus();
  });
}

async function products() {
  pane().innerHTML = '<p class="sp-empty">טוען מוצרים…</p>';
  const { data, error } = await sb.from('products').select(SP_COLS).order('title');
  if (error) { pane().innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
  SP.rows = data.map(spNorm); SP.sel = new Set(); SP.page = 0;
  spList();
}

/* ---------- list ---------- */
function spVisible() {
  const q = SP.q.toLowerCase();
  const l = SP.rows.filter(p => (SP.tab === 'all' || p.status === SP.tab) &&
    (!q || [p.title, p.id, p.vendor, p.sku, spCat(p.category), (p.tags || []).join(' ')].some(v => String(v || '').toLowerCase().includes(q))));
  const by = { title: (a, b) => a.title.localeCompare(b.title, 'he'), updated: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price };
  return l.sort(by[SP.sort]);
}
const spInv = p => p.quantity != null
  ? (p.quantity > 0 ? `${p.quantity} במלאי` : '<span class="neg">אזל מהמלאי</span>')
  : (p.out_of_stock ? '<span class="neg">אזל מהמלאי</span>' : '<span class="mute">המלאי לא במעקב</span>');

function spList() {
  const R = pane(); const need = SP.rows.filter(p => p.virtual).length;
  R.innerHTML = `<div class="sp-head"><h1>מוצרים</h1><span class="grow"></span><button class="btn" id="sp-exp">ייצוא</button><button class="btn pri" id="sp-add">הוספת מוצר</button></div>
    ${need ? `<div class="sp-banner"><span>ל-${need} מוצרים עדיין לא נשמרו פרטי הקטלוג המלאים (שם מלא, תמונה, מותג, קטגוריה ותגיות). ייבוא חד-פעמי יאפשר לערוך אותם כאן ויציג אותם נכון בחנות.</span><button class="btn pri" id="sp-imp">ייבוא פרטי הקטלוג</button></div>` : ''}
    <div class="sp-card"><div class="sp-tabbar"><div class="tb" id="sp-tb"></div><div class="tools"><input type="search" id="sp-q" placeholder="חיפוש מוצרים" aria-label="חיפוש מוצרים" value="${esc(SP.q)}">
      <select id="sp-so" aria-label="מיון"><option value="title">מיון: שם</option><option value="updated">עודכן לאחרונה</option><option value="low">מחיר: נמוך לגבוה</option><option value="high">מחיר: גבוה לנמוך</option></select></div></div>
      <div id="sp-sb"></div><div class="sp-tw"><table class="sp-table"><thead><tr><th class="c"><input type="checkbox" id="sp-all" aria-label="בחירת הכול"></th><th>מוצר</th><th>סטטוס</th><th class="hm">מלאי</th><th class="hm">קטגוריה</th><th class="hm">ספק</th><th class="num">מחיר</th></tr></thead><tbody id="sp-tbody"></tbody></table></div><div class="sp-foot" id="sp-ft"></div></div>`;
  R.querySelector('#sp-so').value = SP.sort;
  const draw = () => {
    const all = spVisible(), pages = Math.max(1, Math.ceil(all.length / SP_PAGE)); SP.page = Math.min(SP.page, pages - 1);
    const view = all.slice(SP.page * SP_PAGE, (SP.page + 1) * SP_PAGE);
    const cnt = t => t === 'all' ? SP.rows.length : SP.rows.filter(p => p.status === t).length;
    R.querySelector('#sp-tb').innerHTML = [['all', 'הכול'], ['active', 'פעיל'], ['draft', 'טיוטה'], ['archived', 'בארכיון']].map(([k, v]) => `<button data-tab="${k}" aria-selected="${k === SP.tab}">${v} (${cnt(k)})</button>`).join('');
    R.querySelector('#sp-tbody').innerHTML = view.length ? view.map(p => `<tr data-id="${esc(p.id)}" class="${SP.sel.has(p.id) ? 'sel' : ''}"><td class="c"><input type="checkbox" data-sel aria-label="בחירה"${SP.sel.has(p.id) ? ' checked' : ''}></td>
      <td><div class="pr"><img class="th" src="${esc(p.image || SP_LOGO)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${SP_LOGO}'"><span>${esc(p.title)}</span></div></td>
      <td><span class="sp-b ${esc(p.status)}">${SP_STATUS[p.status] || esc(p.status)}</span></td><td class="hm">${spInv(p)}</td><td class="hm">${esc(spCat(p.category))}</td><td class="hm">${esc(p.vendor || '')}</td><td class="num">${money(p.price)}</td></tr>`).join('')
      : `<tr><td colspan="7" class="sp-empty">${SP.rows.length ? 'לא נמצאו מוצרים שמתאימים לחיפוש.' : 'עדיין אין מוצרים. הוסיפו את המוצר הראשון.'}</td></tr>`;
    const allBox = R.querySelector('#sp-all'); const onPage = view.filter(p => SP.sel.has(p.id)).length;
    allBox.checked = view.length > 0 && onPage === view.length; allBox.indeterminate = onPage > 0 && onPage < view.length;
    const n = SP.sel.size;
    R.querySelector('#sp-sb').innerHTML = n ? `<div class="sp-selbar"><b>${n} נבחרו</b><button class="btn" data-b="active">הגדרה כפעיל</button><button class="btn" data-b="draft">הגדרה כטיוטה</button><button class="btn" data-b="archived">העברה לארכיון</button><button class="btn danger" data-b="delete">מחיקה</button><button class="btn link" data-b="clear">ביטול בחירה</button></div>` : '';
    R.querySelector('#sp-ft').innerHTML = all.length > SP_PAGE ? `<button class="btn sm" id="sp-pv" ${SP.page ? '' : 'disabled'} aria-label="הקודם">›</button><span>${SP.page * SP_PAGE + 1}–${Math.min(all.length, (SP.page + 1) * SP_PAGE)} מתוך ${all.length}</span><button class="btn sm" id="sp-nx" ${SP.page < pages - 1 ? '' : 'disabled'} aria-label="הבא">‹</button>` : `<span>${all.length} מוצרים</span>`;
  };
  draw();
  R.querySelector('#sp-add').onclick = () => spEdit(null);
  R.querySelector('#sp-exp').onclick = spExport;
  const imp = R.querySelector('#sp-imp'); if (imp) imp.onclick = () => spImport(imp);
  R.querySelector('#sp-q').oninput = e => { SP.q = e.target.value.trim(); SP.page = 0; draw(); };
  R.querySelector('#sp-so').onchange = e => { SP.sort = e.target.value; draw(); };
  R.querySelector('#sp-tb').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { SP.tab = b.dataset.tab; SP.page = 0; draw(); } };
  R.querySelector('#sp-ft').onclick = e => { if (e.target.closest('#sp-pv')) { SP.page--; draw(); } if (e.target.closest('#sp-nx')) { SP.page++; draw(); } };
  R.querySelector('#sp-all').onchange = e => {
    const all = spVisible(); const view = all.slice(SP.page * SP_PAGE, (SP.page + 1) * SP_PAGE);
    view.forEach(p => e.target.checked ? SP.sel.add(p.id) : SP.sel.delete(p.id)); draw();
  };
  R.querySelector('#sp-tbody').onclick = e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    if (e.target.matches('[data-sel]')) { e.target.checked ? SP.sel.add(tr.dataset.id) : SP.sel.delete(tr.dataset.id); draw(); return; }
    spEdit(SP.rows.find(p => p.id === tr.dataset.id));
  };
  R.querySelector('#sp-sb').onclick = async e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    const op = b.dataset.b, ids = [...SP.sel];
    if (op === 'clear') { SP.sel.clear(); draw(); return; }
    if (op === 'delete') {
      if (!await spAsk(`למחוק ${ids.length} מוצרים?`, 'המוצרים יימחקו מהחנות ומרשימת המוצרים. אי אפשר לבטל את הפעולה. הזמנות קיימות לא יושפעו.', 'מחיקה', true)) return;
      const { error } = await sb.from('products').delete().in('id', ids);
      if (error) { toast('המחיקה נכשלה: ' + error.message); return; }
      SP.rows = SP.rows.filter(p => !ids.includes(p.id)); SP.sel.clear(); toast('המוצרים נמחקו'); spList(); return;
    }
    const { error } = await sb.from('products').update({ status: op }).in('id', ids);
    if (error) { toast('העדכון נכשל: ' + error.message); return; }
    SP.rows.forEach(p => { if (ids.includes(p.id)) p.status = op; });
    SP.sel.clear(); toast(`עודכנו ${ids.length} מוצרים`); draw();
  };
}

async function spImport(btn) {
  const todo = SP.rows.filter(p => p.virtual); btn.disabled = true; let fail = 0;
  for (let i = 0; i < todo.length; i += 8) {
    const rs = await Promise.all(todo.slice(i, i + 8).map(p => sb.from('products').update({ title: p.title, vendor: p.vendor, category: p.category, tags: p.tags, image: p.image }).eq('id', p.id)));
    rs.forEach((r, j) => { if (r.error) fail++; else todo[i + j].virtual = false; });
    btn.textContent = `מייבא… ${Math.min(i + 8, todo.length)}/${todo.length}`;
  }
  toast(fail ? `הייבוא הסתיים עם ${fail} שגיאות` : `יובאו ${todo.length} מוצרים`); spList();
}

function spExport() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['Handle', 'Title', 'Description', 'Vendor', 'Category', 'Tags', 'Price', 'Compare at price', 'Quantity', 'SKU', 'Status', 'Image'];
  const lines = SP.rows.map(p => [p.id, p.title, p.description, p.vendor, spCat(p.category), (p.tags || []).join(', '), p.price, p.old_price || '', p.quantity ?? '', p.sku, p.status, p.image].map(q).join(','));
  const blob = new Blob(['﻿' + head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'products.csv'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- product page ---------- */
async function spShrink(file) {
  const bmp = await createImageBitmap(file); const s = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/webp', 0.86));
}

function spEdit(row) {
  let isNew = !row; const id = row ? row.id : spNewId();
  const form = r => ({ title: r ? r.title : '', description: r ? r.description || '' : '', price: r ? String(r.price) : '', old_price: r && Number(r.old_price) ? String(r.old_price) : '',
    track: !!r && r.quantity != null, quantity: r && r.quantity != null ? String(r.quantity) : '0', sku: r ? r.sku || '' : '', out_of_stock: !!r && !!r.out_of_stock,
    status: r ? r.status : 'active', category: r ? r.category || '' : '', vendor: r ? r.vendor || '' : '', tags: r ? [...(r.tags || [])] : [], image: r ? r.image || '' : '' });
  const F = form(row); let orig = JSON.stringify(F); if (row && row.virtual) orig = '';   // an unimported product always counts as unsaved
  const R = pane();
  const vendors = [...new Set(SP.rows.map(p => p.vendor).filter(Boolean))];
  R.innerHTML = `<button class="sp-back" id="e-back">→ מוצרים</button>
    <div class="sp-head"><h1 id="e-h">${esc(F.title || 'מוצר חדש')}</h1><span class="sp-b ${esc(F.status)}" id="e-badge">${SP_STATUS[F.status]}</span></div>
    <div class="sp-bar" id="e-bar" hidden><b>שינויים שלא נשמרו</b><button class="btn" id="e-discard">ביטול שינויים</button><button class="btn pri" id="e-save">שמירה</button></div>
    <div class="sp-grid"><div>
      <div class="sp-card sp-pad"><label class="fld"><span>כותרת</span><input type="text" id="e-title" maxlength="300" placeholder="למשל: חטיף חלבון בטעם שוקולד | 12 יחידות"></label>
        <label class="fld"><span>תיאור</span><textarea id="e-desc" maxlength="5000" placeholder="תיאור המוצר שיוצג בעמוד המוצר"></textarea></label></div>
      <div class="sp-card sp-pad"><h2>מדיה</h2><div id="e-media"></div><input type="file" id="e-file" accept="image/*" hidden></div>
      <div class="sp-card sp-pad"><h2>תמחור</h2><div class="row2c"><label class="fld"><span>מחיר</span><div class="pfx"><i>₪</i><input type="number" id="e-price" min="0" step="0.01" dir="ltr" placeholder="0.00"></div></label>
        <label class="fld"><span>מחיר לפני הנחה</span><div class="pfx"><i>₪</i><input type="number" id="e-old" min="0" step="0.01" dir="ltr" placeholder="0.00"></div><small id="e-disc"></small></label></div></div>
      <div class="sp-card sp-pad"><h2>מלאי</h2><label class="chk"><input type="checkbox" id="e-track"> מעקב אחר כמות מלאי</label><div id="e-qtyrow"></div>
        <label class="fld"><span>מק"ט (SKU)</span><input type="text" id="e-sku" maxlength="60"></label></div>
    </div><div>
      <div class="sp-card sp-pad"><h2>סטטוס</h2><select id="e-status" aria-label="סטטוס">${Object.entries(SP_STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><small class="who" id="e-sh" style="display:block;margin-top:6px"></small></div>
      <div class="sp-card sp-pad"><h2>ארגון מוצר</h2><label class="fld"><span>קטגוריה</span><select id="e-cat"><option value="">בחרו קטגוריה</option>${(typeof CATS !== 'undefined' ? CATS : []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>ספק / מותג</span><input type="text" id="e-vendor" list="e-vl" maxlength="80"><datalist id="e-vl">${vendors.map(v => `<option value="${esc(v)}">`).join('')}</datalist></label>
        <label class="fld"><span>תגיות</span><input type="text" id="e-tag" maxlength="40" placeholder="הקלידו ולחצו Enter"></label><div class="tagbox" id="e-tags"></div></div>
    </div></div>${isNew ? '' : '<div class="sp-del"><button class="btn danger" id="e-del">מחיקת מוצר</button></div>'}`;
  const $ = s => R.querySelector(s);
  const bind = (sel, key, num) => { const el = $(sel); el.value = F[key]; el.oninput = () => { F[key] = el.value; touch(); }; };
  const touch = () => {
    $('#e-h').textContent = F.title.trim() || 'מוצר חדש';
    const b = $('#e-badge'); b.className = 'sp-b ' + F.status; b.textContent = SP_STATUS[F.status];
    $('#e-sh').textContent = SP_STATUS_HINT[F.status];
    const p = parseFloat(F.price), o = parseFloat(F.old_price);
    $('#e-disc').textContent = o > 0 && p >= 0 ? (o > p ? `הנחה של ${Math.round((1 - p / o) * 100)}%` : 'המחיר לפני הנחה צריך להיות גבוה מהמחיר כדי שתוצג הנחה') : '';
    $('#e-bar').hidden = !isNew && JSON.stringify(F) === orig;
  };
  bind('#e-title', 'title'); bind('#e-desc', 'description'); bind('#e-price', 'price'); bind('#e-old', 'old_price'); bind('#e-sku', 'sku'); bind('#e-vendor', 'vendor');
  $('#e-status').value = F.status; $('#e-status').onchange = e => { F.status = e.target.value; touch(); };
  $('#e-cat').value = F.category; $('#e-cat').onchange = e => { F.category = e.target.value; touch(); };
  const qty = () => {
    $('#e-qtyrow').innerHTML = F.track
      ? `<label class="fld"><span>כמות במלאי</span><input type="number" id="e-qty" min="0" step="1" dir="ltr" value="${esc(F.quantity)}" style="max-width:160px"><small>הכמות יורדת אוטומטית בכל הזמנה ומוחזרת כשהזמנה מבוטלת. כשהיא מגיעה ל-0 המוצר מסומן כאזל.</small></label>`
      : `<label class="chk"><input type="checkbox" id="e-oos"${F.out_of_stock ? ' checked' : ''}> סימון כאזל מהמלאי</label>`;
    const q = $('#e-qty'); if (q) q.oninput = () => { F.quantity = q.value; touch(); };
    const o = $('#e-oos'); if (o) o.onchange = () => { F.out_of_stock = o.checked; touch(); };
  };
  $('#e-track').checked = F.track; $('#e-track').onchange = e => { F.track = e.target.checked; qty(); touch(); }; qty();
  const tags = () => {
    $('#e-tags').innerHTML = F.tags.map((t, i) => `<span class="t">${esc(t)}<button type="button" data-i="${i}" aria-label="הסרת תגית">×</button></span>`).join('');
  };
  tags();
  $('#e-tags').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { F.tags.splice(+b.dataset.i, 1); tags(); touch(); } };
  $('#e-tag').onkeydown = e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = e.target.value.trim().replace(/,$/, ''); if (v && !F.tags.includes(v) && F.tags.length < 30) { F.tags.push(v); tags(); touch(); } e.target.value = ''; }
  };

  const media = () => {
    const m = $('#e-media');
    m.innerHTML = F.image
      ? `<div class="sp-img"><img src="${esc(F.image)}" alt="" onerror="this.onerror=null;this.src='${SP_LOGO}'"><button type="button" class="x" id="m-x" aria-label="הסרת תמונה">✕</button><div class="act"><button type="button" class="btn sm" id="m-rep">החלפת תמונה</button></div></div>`
      : `<div class="sp-drop" id="m-drop"><button type="button" class="btn" id="m-up">העלאת תמונה</button><span>או גררו קובץ לכאן</span><button type="button" class="btn link" id="m-url">הוספה מכתובת</button></div>`;
    const pick = () => $('#e-file').click();
    const up = $('#m-up') || $('#m-rep'); if (up) up.onclick = pick;
    const x = $('#m-x'); if (x) x.onclick = () => { F.image = ''; media(); touch(); };
    const u = $('#m-url'); if (u) u.onclick = () => {
      m.insertAdjacentHTML('beforeend', '<div class="sp-url"><input type="url" id="m-link" placeholder="https://…" dir="ltr"><button type="button" class="btn pri" id="m-ok">הוספה</button></div>');
      u.remove(); $('#m-link').focus();
      $('#m-ok').onclick = () => { const v = $('#m-link').value.trim(); if (!/^https:\/\//i.test(v)) { toast('נדרשת כתובת שמתחילה ב-https://'); return; } F.image = v; media(); touch(); };
    };
    const d = $('#m-drop'); if (d) {
      d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
      d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); upload(e.dataTransfer.files[0]); };
    }
  };
  const upload = async file => {
    if (!file || !/^image\//.test(file.type)) { toast('יש לבחור קובץ תמונה'); return; }
    toast('מעלה תמונה…');
    try {
      const blob = await spShrink(file); const path = `p/${id}-${Date.now()}.webp`;
      const { error } = await sb.storage.from('product-media').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' });
      if (error) throw error;
      F.image = sb.storage.from('product-media').getPublicUrl(path).data.publicUrl; media(); touch(); toast('התמונה הועלתה');
    } catch (e) { toast('ההעלאה נכשלה: ' + (e.message || e)); }
  };
  $('#e-file').onchange = e => { upload(e.target.files[0]); e.target.value = ''; };
  media(); touch();

  const leave = async () => { if (!$('#e-bar').hidden && !(await spAsk('לצאת בלי לשמור?', 'השינויים שלא נשמרו יאבדו.', 'יציאה', true))) return; spList(); };
  $('#e-back').onclick = leave;
  $('#e-discard').onclick = () => { if (isNew) spList(); else spEdit(SP.rows.find(p => p.id === id)); };
  $('#e-save').onclick = async e => {
    const btn = e.target;
    if (!F.title.trim()) { toast('נא להזין כותרת'); $('#e-title').focus(); return; }
    const price = parseFloat(F.price); if (!(price >= 0)) { toast('נא להזין מחיר תקין'); $('#e-price').focus(); return; }
    const old = parseFloat(F.old_price) || 0, q = F.track ? Math.max(0, parseInt(F.quantity, 10) || 0) : null;
    const patch = { title: F.title.trim(), description: F.description.trim(), price: Math.round(price * 100) / 100, old_price: Math.round(old * 100) / 100,
      out_of_stock: F.track ? q <= 0 : F.out_of_stock, status: F.status, vendor: F.vendor.trim() || null, category: F.category || null, tags: F.tags,
      image: F.image || null, quantity: q, sku: F.sku.trim() || null };
    btn.disabled = true;
    const res = isNew ? await sb.from('products').insert({ id, ...patch }).select(SP_COLS).single() : await sb.from('products').update(patch).eq('id', id).select(SP_COLS).single();
    btn.disabled = false;
    if (res.error) { toast('השמירה נכשלה: ' + res.error.message); return; }
    const saved = spNorm(res.data); const i = SP.rows.findIndex(p => p.id === id);
    if (i >= 0) SP.rows[i] = saved; else SP.rows.push(saved);
    isNew = false; orig = JSON.stringify(F); touch(); toast('המוצר נשמר');
    if (!R.querySelector('#e-del')) R.insertAdjacentHTML('beforeend', '<div class="sp-del"><button class="btn danger" id="e-del">מחיקת מוצר</button></div>');
    wireDel();
  };
  const wireDel = () => {
    const d = $('#e-del'); if (!d) return;
    d.onclick = async () => {
      if (!await spAsk('למחוק את המוצר?', `"${F.title.trim() || id}" יימחק מהחנות. אי אפשר לבטל את הפעולה. אם אתם רק רוצים להסתיר אותו, העבירו אותו לטיוטה או לארכיון.`, 'מחיקה', true)) return;
      const { error } = await sb.from('products').delete().eq('id', id);
      if (error) { toast('המחיקה נכשלה: ' + error.message); return; }
      SP.rows = SP.rows.filter(p => p.id !== id); toast('המוצר נמחק'); spList();
    };
  };
  wireDel();
}
