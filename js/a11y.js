/* Accessibility menu (as the old store had): text size, contrast, grayscale, link highlighting, readable font,
   stop animations, big cursor. The choice is remembered on this device. Loaded by js/app.js on storefront pages. */
(function () {
  if (window.PSA11y || /\/admin/.test(location.pathname)) return;
  const KEY = 'ps_a11y';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  let st = read();
  const OPTS = [
    ['contrast', 'ניגודיות גבוהה', '◐'],
    ['gray', 'גווני אפור', '◑'],
    ['links', 'הדגשת קישורים', '🔗'],
    ['font', 'גופן קריא', 'Aa'],
    ['still', 'עצירת אנימציות', '⏸'],
    ['cursor', 'סמן גדול', '➤'],
  ];
  const apply = () => {
    const h = document.documentElement;
    h.style.fontSize = st.size ? (100 + st.size * 10) + '%' : '';
    OPTS.forEach(([k]) => h.classList.toggle('a11y-' + k, !!st[k]));
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
  };
  const css = `
  .a11y-btn{position:fixed;z-index:9990;inset-inline-start:0;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:0 10px 10px 0;background:#1764d6;color:#fff;cursor:pointer;display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.2)}
  [dir=rtl] .a11y-btn{border-radius:10px 0 0 10px}
  .a11y-btn svg{width:26px;height:26px}
  .a11y-btn:focus-visible{outline:3px solid #ffbf00;outline-offset:2px}
  .a11y-pan{position:fixed;z-index:9991;inset-inline-start:52px;top:50%;transform:translateY(-50%);width:min(300px,calc(100vw - 70px));background:#fff;color:#0a1929;border:1px solid #d9dee5;border-radius:14px;box-shadow:0 14px 40px rgba(10,25,41,.22);padding:14px;font-size:15px;line-height:1.4}
  .a11y-pan h2{font-size:16px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center}
  .a11y-pan h2 button{border:0;background:none;font-size:18px;cursor:pointer;width:30px;height:30px}
  .a11y-size{display:flex;gap:6px;align-items:center;margin-bottom:10px}
  .a11y-size span{flex:1}
  .a11y-size button{width:38px;height:34px;border:1px solid #d9dee5;border-radius:8px;background:#f5f7fa;cursor:pointer;font-weight:700}
  .a11y-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .a11y-grid button{border:1px solid #d9dee5;border-radius:10px;background:#f5f7fa;padding:9px 6px;cursor:pointer;font:inherit;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:3px}
  .a11y-grid button[aria-pressed=true]{background:#1764d6;border-color:#1764d6;color:#fff}
  .a11y-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:13px}
  .a11y-foot button{border:0;background:none;text-decoration:underline;cursor:pointer;font:inherit;color:#b42318}
  .a11y-foot a{text-decoration:underline}
  html.a11y-contrast body{filter:contrast(1.35)}
  html.a11y-contrast body *{text-shadow:none!important}
  html.a11y-gray body{filter:grayscale(1)}
  html.a11y-contrast.a11y-gray body{filter:grayscale(1) contrast(1.35)}
  html.a11y-links a{text-decoration:underline!important;outline:2px solid #ffbf00;outline-offset:1px}
  html.a11y-font body,html.a11y-font body *{font-family:Arial,Helvetica,sans-serif!important;letter-spacing:.02em}
  html.a11y-still *,html.a11y-still *::before,html.a11y-still *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
  html.a11y-cursor,html.a11y-cursor *{cursor:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M4 2l28 16-12 3-6 13z' fill='black' stroke='white' stroke-width='2'/%3E%3C/svg%3E") 4 2,auto!important}
  @media(max-width:640px){.a11y-btn{top:auto;bottom:90px;transform:none;width:40px;height:40px}.a11y-pan{top:auto;bottom:90px;transform:none}}`;
  const icon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="M19 8.5l-5 .9V13l2.6 7.1-1.9.7L12 14.6l-2.7 6.2-1.9-.7L10 13V9.4l-5-.9.3-1.9 6.7 1.1 6.7-1.1z"/></svg>';
  let pan = null;
  const close = () => { if (pan) { pan.remove(); pan = null; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } };
  const open = () => {
    if (pan) return close();
    pan = document.createElement('div'); pan.className = 'a11y-pan'; pan.setAttribute('role', 'dialog'); pan.setAttribute('aria-label', 'תפריט נגישות');
    const paint = () => {
      pan.innerHTML = `<h2>נגישות <button type="button" data-a="x" aria-label="סגירת תפריט הנגישות">✕</button></h2>
        <div class="a11y-size"><span>גודל טקסט${st.size ? ' (' + (100 + st.size * 10) + '%)' : ''}</span><button type="button" data-a="minus" aria-label="הקטנת טקסט">א-</button><button type="button" data-a="plus" aria-label="הגדלת טקסט">א+</button></div>
        <div class="a11y-grid">${OPTS.map(([k, l, i]) => `<button type="button" data-k="${k}" aria-pressed="${!!st[k]}"><span aria-hidden="true">${i}</span>${l}</button>`).join('')}</div>
        <div class="a11y-foot"><a href="accessibility">הצהרת נגישות</a><button type="button" data-a="reset">איפוס</button></div>`;
    };
    paint();
    pan.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'x') return close();
      if (b.dataset.a === 'plus') st.size = Math.min(5, (st.size || 0) + 1);
      else if (b.dataset.a === 'minus') st.size = Math.max(-2, (st.size || 0) - 1);
      else if (b.dataset.a === 'reset') st = {};
      else if (b.dataset.k) st[b.dataset.k] = !st[b.dataset.k];
      apply(); paint();
      const again = pan.querySelector(b.dataset.k ? `[data-k="${b.dataset.k}"]` : `[data-a="${b.dataset.a}"]`); if (again) again.focus();
    };
    pan.onkeydown = e => { if (e.key === 'Escape') close(); };
    document.body.appendChild(pan); btn.setAttribute('aria-expanded', 'true');
    pan.querySelector('button').focus();
  };
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'a11y-btn'; btn.setAttribute('aria-label', 'תפריט נגישות'); btn.setAttribute('aria-expanded', 'false'); btn.innerHTML = icon;
  btn.onclick = open;
  const mount = () => { document.body.appendChild(btn); apply(); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.PSA11y = { open, reset: () => { st = {}; apply(); } };
})();
