/* Newsletter popup (as on the old site): shown once per visitor, a few seconds after arriving, never on checkout/account/thank-you
   pages and never on top of the cookie banner. Sign-ups are saved (admin → לקוחות) and the welcome code is shown right away. */
(function () {
  if (window.PSNews || /\/(admin|checkout|account|order-success|cart)/.test(location.pathname)) return;
  const SEEN = 'ps_news_seen';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return '1'; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  if (get(SEEN)) return;
  const DELAY = 9000;
  const css = `
  .np-back{position:fixed;inset:0;z-index:9995;background:rgba(10,25,41,.55);display:grid;place-items:center;padding:16px;animation:npIn .25s ease}
  @keyframes npIn{from{opacity:0}to{opacity:1}}
  .np{position:relative;width:min(420px,100%);background:#fff;color:#0a1929;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center}
  .np-top{background:linear-gradient(135deg,#0a1929,#1764d6);color:#fff;padding:26px 22px 20px}
  .np-top b{display:block;font-size:2.6rem;line-height:1;font-weight:800;letter-spacing:-.02em}
  .np-top span{display:block;font-size:1.05rem;margin-top:6px;opacity:.95}
  .np-body{padding:18px 22px 20px}
  .np-body p{margin:0 0 12px;color:#5b6b7f;font-size:.95rem;line-height:1.5}
  .np form{display:flex;flex-direction:column;gap:8px}
  .np input{height:48px;border:1px solid #d9dee5;border-radius:12px;padding:0 14px;font:inherit;font-size:1rem;text-align:center}
  .np input:focus{outline:2px solid #1764d6;outline-offset:1px}
  .np .btn{height:48px;width:100%}
  .np-x{position:absolute;top:8px;inset-inline-end:8px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:1.05rem;cursor:pointer}
  .np-no{background:none;border:0;color:#8a97a8;text-decoration:underline;cursor:pointer;font:inherit;font-size:.85rem;margin-top:8px}
  .np-code{display:inline-block;font-size:1.6rem;font-weight:800;letter-spacing:.08em;background:#f2f7fd;border:2px dashed #1764d6;border-radius:12px;padding:8px 18px;margin:6px 0 12px;direction:ltr}
  .np-err{color:#b42318;font-size:.85rem;min-height:1.2em}`;
  const show = () => {
    if (document.querySelector('.np-back')) return;
    if (document.getElementById('ps-cc')) { setTimeout(show, 4000); return; }   // wait for the cookie choice
    set(SEEN, String(Date.now()));
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const back = document.createElement('div'); back.className = 'np-back';
    back.innerHTML = `<div class="np" role="dialog" aria-modal="true" aria-labelledby="np-t">
      <button type="button" class="np-x" aria-label="סגירה">✕</button>
      <div class="np-top"><b>30% הנחה</b><span id="np-t">על כל החנות, בהרשמה לניוזלטר</span></div>
      <div class="np-body"><p>מבצעים, מוצרים חדשים והטבות לחברי המועדון בלבד. הקוד מופיע מיד אחרי ההרשמה.</p>
        <form novalidate><input type="email" required autocomplete="email" inputmode="email" placeholder="האימייל שלך" aria-label="אימייל" dir="ltr"><button class="btn btn-primary" type="submit">קבלו את הקוד</button><div class="np-err" role="status"></div></form>
        <button type="button" class="np-no">לא תודה</button></div></div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.querySelector('.np-x').onclick = close;
    back.querySelector('.np-no').onclick = close;
    back.onclick = e => { if (e.target === back) close(); };
    const f = back.querySelector('form'), inp = f.querySelector('input'), err = f.querySelector('.np-err');
    setTimeout(() => inp.focus(), 50);
    f.onsubmit = async e => {
      e.preventDefault();
      const email = inp.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'כתובת המייל לא תקינה'; return; }
      const b = f.querySelector('button'); b.disabled = true; err.textContent = '';
      let j = {};
      try {
        const sb = window.LEGACY_SB || (typeof LEGACY_SB !== 'undefined' ? LEGACY_SB : null);
        const r = await fetch(sb.url + '/rest/v1/rpc/ps_subscribe', { method: 'POST', headers: { apikey: sb.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_email: email, p_source: 'popup' }) });
        j = await r.json();
      } catch (x) { j = { error: 'net' }; }
      b.disabled = false;
      if (j.error) { err.textContent = j.error === 'invalid_email' ? 'כתובת המייל לא תקינה' : 'משהו השתבש, נסו שוב'; return; }
      if (window.PSTrack) PSTrack.lead('newsletter');
      set(SEEN, 'subscribed');
      const code = j.coupon || '';
      back.querySelector('.np-body').innerHTML = `<p style="color:#0a1929;font-weight:700;font-size:1.05rem;margin-bottom:4px">תודה שנרשמת! 🎉</p>${code ? `<p>קוד ההנחה שלך:</p><div class="np-code">${code}</div><button type="button" class="btn btn-primary" id="np-go">לקנייה עם הקוד</button>` : '<button type="button" class="btn btn-primary" id="np-go">להמשך גלישה</button>'}`;
      back.querySelector('#np-go').onclick = () => { if (code) { try { sessionStorage.setItem('ps_coupon', code); } catch (x) { /* ignore */ } } close(); };
    };
  };
  const start = () => setTimeout(show, DELAY);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.PSNews = { show };
})();
