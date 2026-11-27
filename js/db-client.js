/* Protein Stock — browser client for our own API (/api/*), replacing supabase-js.
   It keeps the small part of the supabase-js interface the admin uses (from/select/eq/in/order/limit/insert/update/delete,
   auth with an emailed code, functions.invoke, storage upload), so the admin code stays the same.
   All access rules are enforced on the server; this file only shapes requests. */
(function () {
  const post = async (url, body, raw) => {
    let r;
    try {
      r = await fetch(url, raw
        ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': raw.type }, body: raw.body }
        : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { return { status: 0, data: null, error: { message: 'אין חיבור לשרת' } }; }
    let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
    return { status: r.status, json: j };
  };
  const errOf = (j, status) => {
    const e = j && j.error;
    if (!e) return { message: 'שגיאת שרת (' + status + ')', status };
    if (typeof e === 'string') return { message: e, code: e, status };
    return { message: e.message || e.code || 'שגיאה', code: e.code, status: e.status || status };
  };

  class Query {
    constructor(table) { this.b = { table, op: 'select', filters: [] }; this.one = null; }
    select(cols) { if (this.b.op === 'select') this.b.select = cols || '*'; else this.b.returning = cols || '*'; return this; }
    insert(values) { this.b.op = 'insert'; this.b.values = values; return this; }
    upsert(values) { this.b.op = 'upsert'; this.b.values = values; return this; }
    update(values) { this.b.op = 'update'; this.b.values = values; return this; }
    delete() { this.b.op = 'delete'; return this; }
    eq(c, v) { this.b.filters.push(['eq', c, v]); return this; }
    neq(c, v) { this.b.filters.push(['neq', c, v]); return this; }
    gte(c, v) { this.b.filters.push(['gte', c, v]); return this; }
    lte(c, v) { this.b.filters.push(['lte', c, v]); return this; }
    ilike(c, v) { this.b.filters.push(['ilike', c, v]); return this; }
    in(c, v) { this.b.filters.push(['in', c, v]); return this; }
    order(c, o) { this.b.order = [c, !(o && o.ascending === false)]; return this; }
    limit(n) { this.b.limit = n; return this; }
    single() { this.one = 'single'; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    async run() {
      const r = await post('/api/db', this.b);
      if (r.error) return { data: null, error: r.error };
      if (r.status >= 400) return { data: null, error: errOf(r.json, r.status) };
      let data = r.json.data;
      if (this.one) {
        const rows = Array.isArray(data) ? data : [];
        if (this.one === 'single' && rows.length !== 1) return { data: null, error: { message: rows.length ? 'more than one row' : 'not found' } };
        data = rows[0] || null;
      }
      return { data, error: null };
    }
    then(ok, bad) { return this.run().then(ok, bad); }
  }

  /* ---- auth (admin login by a 6-digit code sent by email; the session is an HttpOnly cookie) ---- */
  const listeners = [];
  let session;   // undefined = not loaded yet
  const emit = (ev, s) => listeners.forEach(cb => { try { cb(ev, s); } catch (e) { console.error(e); } });
  const loadSession = async () => {
    try { const r = await fetch('/api/auth', { credentials: 'same-origin' }); const j = await r.json(); session = (j && j.session) || null; }
    catch (e) { session = null; }
    return session;
  };
  const auth = {
    async getSession() { if (session === undefined) await loadSession(); return { data: { session }, error: null }; },
    onAuthStateChange(cb) {
      listeners.push(cb);
      (session === undefined ? loadSession() : Promise.resolve(session)).then(s => cb('INITIAL_SESSION', s));
      return { data: { subscription: { unsubscribe() { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } } } };
    },
    async signInWithOtp({ email }) {
      const r = await post('/api/auth', { action: 'send', email });
      if (r.error) return { error: r.error };
      return r.status >= 400 ? { error: errOf(r.json, r.status) } : { error: null };
    },
    async verifyOtp({ email, token }) {
      const r = await post('/api/auth', { action: 'verify', email, token });
      if (r.error) return { data: null, error: r.error };
      if (r.status >= 400) return { data: null, error: errOf(r.json, r.status) };
      session = r.json.session; emit('SIGNED_IN', session);
      return { data: { session }, error: null };
    },
    async signOut() { await post('/api/auth', { action: 'logout' }); session = null; emit('SIGNED_OUT', null); return { error: null }; },
  };

  /* ---- server functions: /api/<name> ---- */
  const functions = {
    async invoke(name, opts) {
      const r = await post('/api/' + encodeURIComponent(name), (opts && opts.body) || {});
      if (r.error) return { data: null, error: r.error };
      if (r.status >= 400) { const j = r.json; return { data: null, error: { message: 'HTTP ' + r.status, status: r.status, context: { json: async () => j } } }; }
      return { data: r.json, error: null };
    },
  };

  /* ---- image storage (Vercel Blob through /api/upload) ---- */
  const urls = {};
  const storage = {
    from() {
      return {
        async upload(path, blob, opts) {
          const r = await post('/api/upload?path=' + encodeURIComponent(path), null, { type: (opts && opts.contentType) || blob.type || 'application/octet-stream', body: blob });
          if (r.error) return { data: null, error: r.error };
          if (r.status >= 400) return { data: null, error: errOf(r.json, r.status) };
          urls[path] = r.json.data.url; return { data: r.json.data, error: null };
        },
        getPublicUrl(path) { return { data: { publicUrl: urls[path] || '' } }; },
      };
    },
  };

  const api = { from: t => new Query(t), auth, functions, storage };

  /* ---- Until the server has its own database (/api/health ok), talk to the store's Supabase project directly,
     like the old admin did: Supabase Auth login code + row level security (admins only) + admin_report() for reports.
     Only the public (publishable) key is used here. Once DATABASE_URL is set on Vercel, everything goes through /api. */
  const SB = { url: 'https://yplzliqpohqehypllxdq.supabase.co', key: 'sb_publishable_Gcr_7r00CovbMZj-tJin8g_Jp8B1JcB' };
  const SB_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  let sbc = null, modeP = null;
  const ours = { createClient: () => client };
  const loadSb = () => new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = SB_JS; s.crossOrigin = 'anonymous';
    s.onload = () => { const real = window.supabase; window.supabase = ours; sbc = real.createClient(SB.url, SB.key); ok(); };
    s.onerror = () => { window.supabase = ours; bad(new Error('supabase-js failed to load')); };
    document.head.appendChild(s);
  });
  const mode = () => modeP || (modeP = fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => (r.ok ? 'api' : 'sb'), () => 'sb')
    .then(m => (m === 'sb' ? loadSb().then(() => 'sb') : m)));

  // Records a query chain and replays it on whichever backend is in use.
  const OPS = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'ilike', 'in', 'order', 'limit', 'single', 'maybeSingle'];
  class Lazy {
    constructor(make) { this.make = make; this.ops = []; }
    then(ok, bad) {
      return mode().then(m => { let q = this.make(m); for (const [n, a] of this.ops) q = q[n](...a); return q; })
        .then(r => r, e => ({ data: null, error: { message: e.message || String(e) } })).then(ok, bad);
    }
  }
  OPS.forEach(n => { Lazy.prototype[n] = function (...a) { this.ops.push([n, a]); return this; }; });

  const via = (fn) => (...a) => mode().then(m => fn(m, ...a));
  const client = {
    from: t => new Lazy(m => (m === 'api' ? api.from(t) : sbc.from(t))),
    rpc: via(async (m, name, args) => {
      if (m === 'sb') return sbc.rpc(name, args);
      const r = await post('/api/rpc/' + encodeURIComponent(name), args || {});
      if (r.error) return { data: null, error: r.error };
      if (r.status >= 400) return { data: null, error: { message: (r.json && r.json.message) || 'שגיאת שרת (' + r.status + ')', code: r.json && r.json.code, status: r.status } };
      return { data: r.json, error: null };
    }),
    mode,
    auth: {
      getSession: via(m => (m === 'api' ? auth : sbc.auth).getSession()),
      onAuthStateChange(cb) { let sub = null; mode().then(m => { sub = (m === 'api' ? auth : sbc.auth).onAuthStateChange(cb); }); return { data: { subscription: { unsubscribe() { const s = sub && sub.data && sub.data.subscription; if (s) s.unsubscribe(); } } } }; },
      signInWithOtp: via((m, o) => (m === 'api' ? auth.signInWithOtp(o) : sbc.auth.signInWithOtp({ email: o.email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + '/admin' } }))),
      verifyOtp: via((m, o) => (m === 'api' ? auth : sbc.auth).verifyOtp({ type: 'email', ...o })),
      signOut: via(m => (m === 'api' ? auth : sbc.auth).signOut()),
    },
    functions: { invoke: via((m, name, opts) => (m === 'api' ? functions : sbc.functions).invoke(name, opts)) },
    storage: {
      from: b => ({
        upload: via((m, ...a) => (m === 'api' ? storage.from(b) : sbc.storage.from(b)).upload(...a)),
        getPublicUrl: p => (sbc ? sbc.storage.from(b) : storage.from(b)).getPublicUrl(p),
      }),
    },
  };
  window.PSDB = client;
  window.supabase = ours;
})();
