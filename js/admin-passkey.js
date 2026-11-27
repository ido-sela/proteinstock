/* Face ID / Touch ID / fingerprint sign-in for the admin (WebAuthn passkeys, checked by the `passkey` server function).
   First sign-in on a device is with the emailed code; then the admin turns this on, and later signs in with a glance. */
(function () {
  const FN = 'https://yplzliqpohqehypllxdq.supabase.co/functions/v1/passkey';
  const KEY = 'sb_publishable_Gcr_7r00CovbMZj-tJin8g_Jp8B1JcB';
  const LIB = 'https://unpkg.com/@simplewebauthn/browser@10.0.0/dist/bundle/index.umd.min.js';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  let libP = null;
  const lib = () => libP || (libP = new Promise((ok, bad) => { if (window.SimpleWebAuthnBrowser) return ok(window.SimpleWebAuthnBrowser); const s = document.createElement('script'); s.src = LIB; s.crossOrigin = 'anonymous'; s.onload = () => ok(window.SimpleWebAuthnBrowser); s.onerror = () => bad(new Error('lib')); document.head.appendChild(s); }));
  // our own server (/api/passkey, session cookie) once the new database is live; the old Supabase function until then
  const api = async () => !!(window.PSDB && (await PSDB.mode()) === 'api');
  const call = async (action, body, jwt) => {
    const mine = await api();
    const r = await fetch(mine ? '/api/passkey' : FN, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(mine ? {} : { apikey: KEY, ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) }) }, body: JSON.stringify({ action, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error(j.error || 'http_' + r.status); e.code = j.error; throw e; }
    return j;
  };
  const jwt = async () => { if (await api()) return null; const { data } = await sb.auth.getSession(); return data && data.session && data.session.access_token; };
  const deviceName = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'מכשיר'; };
  const label = () => /iPhone|iPad|Mac/.test(navigator.userAgent) ? 'Face ID / Touch ID' : 'טביעת אצבע / זיהוי פנים';
  const MSG = { NotAllowedError: 'הפעולה בוטלה.', unknown_device: 'המכשיר הזה עוד לא הוגדר. היכנסו פעם אחת עם קוד במייל והפעילו ' + 'Face ID' + '.', challenge_expired: 'עבר יותר מדי זמן. נסו שוב.', not_admin: 'המשתמש אינו מנהל.', InvalidStateError: 'המכשיר הזה כבר מוגדר.' };
  const msg = e => MSG[e && (e.code || e.name)] || 'לא הצלחנו. נסו שוב או היכנסו עם קוד במייל.';

  const PK = {
    label,
    async supported() {
      try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) && location.hostname.endsWith('proteinstock.co.il'); } catch (e) { return false; }
    },
    enabledHere: () => ls.get('ps_pk_on') === '1',
    async login() {
      const W = await lib();
      const { options, challengeId } = await call('login-options', {});
      const response = await W.startAuthentication(options);
      const { token_hash } = await call('login-verify', { challengeId, response });
      ls.set('ps_pk_on', '1');
      if (await api()) { location.reload(); return; }   // the server already set the session cookie
      const { error } = await sb.auth.verifyOtp({ token_hash, type: 'magiclink' });
      if (error) throw error;
    },
    async register() {
      const W = await lib(), t = await jwt();
      const { options, challengeId } = await call('register-options', {}, t);
      const response = await W.startRegistration(options);
      await call('register-verify', { challengeId, response, deviceName: deviceName() }, t);
      ls.set('ps_pk_on', '1');
    },
    async devices() { return (await call('list', {}, await jwt())).devices; },
    async remove(id) { return (await call('remove', { id }, await jwt())).devices; },
    msg,
    /* login screen: a big button above the email form */
    async mountLogin(root, note) {
      if (!(await this.supported())) return;
      const box = document.createElement('div'); box.className = 'pk-login';
      box.innerHTML = `<button type="button" class="btn pri pk-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1 3.6 1 5 0"/></svg>כניסה עם ${label()}</button><div class="pk-or"><span>או עם קוד במייל</span></div>`;
      root.prepend(box);
      box.querySelector('button').onclick = async e => {
        e.target.disabled = true; note('');
        try { await PK.login(); } catch (err) { note(msg(err)); }
        e.target.disabled = false;
      };
    },
    /* after sign-in: offer to turn it on for this device */
    async offer(host) {
      if (this.enabledHere() || ls.get('ps_pk_skip') === '1' || !(await this.supported())) return;
      const card = document.createElement('div'); card.className = 'pk-offer';
      card.innerHTML = `<div class="pk-ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1 3.6 1 5 0"/></svg></div>
        <div class="pk-tx"><b>כניסה מהירה עם ${label()}</b><span>בפעם הבאה תיכנסו לניהול במבט אחד, בלי קוד במייל.</span></div>
        <div class="pk-ac"><button class="btn pri" data-pk="on">הפעלה</button><button class="btn link" data-pk="skip">לא עכשיו</button></div>`;
      host.prepend(card);
      card.querySelector('[data-pk=skip]').onclick = () => { ls.set('ps_pk_skip', '1'); card.remove(); };
      card.querySelector('[data-pk=on]').onclick = async e => {
        e.target.disabled = true;
        try { await PK.register(); card.innerHTML = `<div class="pk-tx"><b>✓ הופעל</b><span>מעכשיו אפשר להיכנס מהמכשיר הזה עם ${label()}.</span></div>`; setTimeout(() => card.remove(), 4000); }
        catch (err) { e.target.disabled = false; if (typeof toast === 'function') toast(msg(err)); }
      };
    },
    /* settings: this admin's devices */
    async settingsCard(host) {
      const sec = document.createElement('div'); sec.className = 'card pk-set'; sec.style.marginTop = '16px';
      const paint = list => {
        sec.innerHTML = `<h2 style="font-size:1.05rem;margin-bottom:6px">כניסה עם ${label()}</h2>
          <p class="who" style="margin:0 0 10px">מכשירים שיכולים להיכנס לניהול בלי קוד במייל.</p>
          ${list.length ? `<ul class="pk-list">${list.map(d => `<li><b>${esc(d.device_name || 'מכשיר')}</b><span>נוסף ${new Date(d.created_at).toLocaleDateString('he-IL')}${d.last_used_at ? ' · שימוש אחרון ' + new Date(d.last_used_at).toLocaleDateString('he-IL') : ''}</span><button class="btn sm" data-rm="${esc(d.id)}">הסרה</button></li>`).join('')}</ul>` : '<p class="who">עדיין לא הוגדר אף מכשיר.</p>'}
          <button class="btn pri" id="pk-add" style="margin-top:10px">הוספת המכשיר הזה</button>`;
        sec.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('להסיר את המכשיר? הוא יצטרך קוד במייל בכניסה הבאה.')) return; paint(await PK.remove(b.dataset.rm)); try { localStorage.removeItem('ps_pk_on'); } catch (e) { /* ignore */ } });
        sec.querySelector('#pk-add').onclick = async e => { e.target.disabled = true; try { await PK.register(); paint(await PK.devices()); toast('המכשיר נוסף'); } catch (err) { e.target.disabled = false; toast(msg(err)); } };
      };
      host.appendChild(sec);
      try { paint(await PK.devices()); } catch (e) { sec.innerHTML = '<p class="who">לא ניתן לטעון את רשימת המכשירים כרגע.</p>'; }
    },
  };
  window.PK = PK;
})();
