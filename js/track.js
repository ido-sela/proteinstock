/* Protein Stock — marketing & analytics tags (same IDs and events as the old Zappy store).
   Meta Pixel 1120769657458456 · Google Analytics 4 G-R26YTRKNR6 · Cloudflare Web Analytics.
   Store events (Meta / GA4): PageView/page_view · ViewContent/view_item · AddToCart/add_to_cart ·
   InitiateCheckout/begin_checkout · Purchase/purchase. Clicks: WhatsApp, phone, contact & lead forms.
   Cart abandonment: the checkout draft (phone or email + cart) is saved to the store database as the shopper types.
   Loaded by js/app.js on every storefront page (never on /admin). */
(function () {
  if (window.PSTrack || /\/admin/.test(location.pathname)) return;
  const FB = '1120769657458456', GA = 'G-R26YTRKNR6', CF = 'ba4da9700791400bb1fed45649c4c1b7';
  const CUR = 'ILS';
  const add = (src, attrs) => { const s = document.createElement('script'); s.async = true; s.src = src; Object.entries(attrs || {}).forEach(([k, v]) => s.setAttribute(k, v)); document.head.appendChild(s); };

  /* ---- Google Analytics 4 ---- */
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA);
  add('https://www.googletagmanager.com/gtag/js?id=' + GA);

  /* ---- Meta Pixel ---- */
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  fbq('init', FB);
  fbq('track', 'PageView');

  /* ---- Cloudflare Web Analytics (same token as the old site) ---- */
  add('https://static.cloudflareinsights.com/beacon.min.js', { 'data-cf-beacon': JSON.stringify({ token: CF, spa: false }), defer: '' });

  /* ---- helpers ---- */
  const prod = id => (typeof byId === 'function' ? byId(id) : null);
  const item = (p, q, v) => ({ item_id: p.id, item_name: p.name, item_brand: p.brand || undefined, item_category: p.cat || undefined, price: Number(p.price) || 0, quantity: q || 1, item_variant: v || undefined });
  const once = key => { try { const k = 'ps_tr_' + key; if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); return true; } catch (e) { return true; } };
  const eid = (name, k) => name + '.' + k;   // event_id, so the browser and any server-side copy can be de-duplicated
  const log = (...a) => { (window.__psTrackLog = window.__psTrackLog || []).push(a); };

  const T = {
    viewItem(p) {
      if (!p) return;
      gtag('event', 'view_item', { currency: CUR, value: Number(p.price) || 0, items: [item(p, 1)] });
      fbq('track', 'ViewContent', { content_ids: [p.id], content_type: 'product', content_name: p.name, value: Number(p.price) || 0, currency: CUR });
      log('view_item', p.id);
    },
    addToCart(p, q, v) {
      if (!p) return; q = q || 1;
      gtag('event', 'add_to_cart', { currency: CUR, value: (Number(p.price) || 0) * q, items: [item(p, q, v)] });
      fbq('track', 'AddToCart', { content_ids: [p.id], content_type: 'product', content_name: p.name, contents: [{ id: p.id, quantity: q }], value: (Number(p.price) || 0) * q, currency: CUR });
      log('add_to_cart', p.id, q);
    },
    beginCheckout(lines, total) {
      const items = lines.map(l => { const p = prod(l.id); return p ? item(p, l.q, l.v) : null; }).filter(Boolean);
      if (!items.length) return;
      gtag('event', 'begin_checkout', { currency: CUR, value: total, items });
      fbq('track', 'InitiateCheckout', { content_ids: items.map(i => i.item_id), contents: items.map(i => ({ id: i.item_id, quantity: i.quantity })), content_type: 'product', num_items: items.reduce((s, i) => s + i.quantity, 0), value: total, currency: CUR });
      log('begin_checkout', items.length, total);
    },
    purchase(order) {
      if (!order || !order.number || !once('purchase_' + order.number)) return;
      const lines = Array.isArray(order.items) ? order.items : [];
      const items = lines.map(l => { const p = prod(l.id); return p ? item(p, l.q) : { item_id: l.id, quantity: l.q }; });
      const value = Number(order.total) || 0;
      gtag('event', 'purchase', { transaction_id: order.number, currency: CUR, value, coupon: order.coupon || undefined, shipping: order.shipping || undefined, items });
      fbq('track', 'Purchase', { content_ids: items.map(i => i.item_id), contents: items.map(i => ({ id: i.item_id, quantity: i.quantity })), content_type: 'product', num_items: items.reduce((s, i) => s + (i.quantity || 1), 0), value, currency: CUR }, { eventID: eid('purchase', order.number) });
      log('purchase', order.number, value);
    },
    contact(kind) {   // kind: whatsapp | phone | email | form
      gtag('event', kind === 'whatsapp' ? 'whatsapp_click' : kind === 'phone' ? 'phone_click' : kind === 'email' ? 'email_click' : 'generate_lead', { method: kind, page_path: location.pathname });
      fbq('track', 'Contact', { content_name: kind });
      log('contact', kind);
    },
    lead(kind) {      // newsletter / wholesale quote
      gtag('event', kind === 'newsletter' ? 'sign_up' : 'generate_lead', { method: kind });
      fbq('track', kind === 'newsletter' ? 'CompleteRegistration' : 'Lead', { content_name: kind });
      log('lead', kind);
    },
    /* cart abandonment: save the checkout draft (debounced) */
    draft: (function () {
      let t = null;
      return function (d) {
        clearTimeout(t);
        t = setTimeout(() => {
          try {
            let key = localStorage.getItem('ps_ck_key');
            if (!key) { key = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)); localStorage.setItem('ps_ck_key', key); }
            const sb = window.LEGACY_SB || (typeof LEGACY_SB !== 'undefined' ? LEGACY_SB : null); if (!sb) return;
            fetch(sb.url + '/rest/v1/rpc/ps_save_checkout', { method: 'POST', keepalive: true, headers: { apikey: sb.key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ p: { key, name: d.name, phone: d.phone, email: d.email, items: d.items, total: d.total, step: d.step } }) })
              .then(r => log('draft_saved', r.status)).catch(() => {});
          } catch (e) { /* ignore */ }
        }, 1200);
      };
    })(),
  };
  window.PSTrack = T;

  /* ---- automatic: product page view, checkout start, purchase, clicks, forms ---- */
  const whenProduct = (id, fn, tries = 0) => { const p = prod(id); if (p) return fn(p); if (tries < 40) setTimeout(() => whenProduct(id, fn, tries + 1), 150); };
  const onReady = fn => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());
  onReady(() => {
    const path = location.pathname.replace(/\/+$/, ''), qs = new URLSearchParams(location.search);
    const pid = window.PS_PID || (/\/product(\.html)?$/.test(path) ? (qs.get('id') || '') : '') || ((path.match(/\/product\/[^/]*-([a-z0-9]{6})$/) || [])[1] || '');
    if (pid) whenProduct(pid, p => T.viewItem(p));
    if (/\/checkout(\.html)?$/.test(path)) {
      const fire = (tries = 0) => {
        if (typeof Cart === 'undefined') return;
        const lines = Cart.items.filter(i => prod(i.id));
        if (!lines.length) { if (tries < 40) setTimeout(() => fire(tries + 1), 150); return; }
        T.beginCheckout(lines, Math.round(lines.reduce((s, i) => s + prod(i.id).price * i.q, 0) * 100) / 100);
      };
      fire();
    }
    if (/\/order-success(\.html)?$/.test(path) && qs.get('status') === 'success' && window.__psLastOrder) T.purchase(window.__psLastOrder);
  });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const h = a.getAttribute('href') || '';
    if (/wa\.me|api\.whatsapp\.com|whatsapp:/i.test(h)) T.contact('whatsapp');
    else if (/^tel:/i.test(h)) T.contact('phone');
    else if (/^mailto:/i.test(h)) T.contact('email');
  }, true);
  document.addEventListener('submit', e => {
    const f = e.target; if (!f || !f.id) return;
    if (f.id === 'news') T.lead('newsletter');
    else if (f.id === 'f' && /\/contact/.test(location.pathname)) T.contact('form');
    else if (/\/business-wholesale/.test(location.pathname)) T.lead('wholesale');
  }, true);
})();
