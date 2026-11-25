/* Newsletter popup: the store's ActiveTrail popup (form 7547), exactly as on the old Zappy site.
   Its automation sends the subscriber the WELCOME30 code by email and SMS.
   Not on admin / checkout / thank-you pages. The mobile fix keeps the popup above the sticky header with its X visible.
   Shown only on the first page of a visit (the page the visitor entered the site on), and never to a browser that
   completed a paid order (order-success sets ps_buyer). ActiveTrail itself also hides it from existing subscribers. */
(function () {
  if (window._atpopq && window._atpopq.loaded) return;
  try { if (window.self !== window.top) return; } catch (e) { return; }   // not inside the admin's live preview
  try {
    if (localStorage.getItem('ps_buyer')) return;                 // already bought on this browser
    if (sessionStorage.getItem('ps_np_entry')) return;            // not the entry page of this visit
    sessionStorage.setItem('ps_np_entry', '1');
  } catch (e) { /* storage blocked: fall back to the page rules below */ }
  if (/^\/(admin|checkout|order-success|thank-you|account|cart)/.test(location.pathname)) return;
  const css = document.createElement('style');
  css.id = 'ps-at-popup-fix';
  css.textContent =
    '.ui-dialog:has(#_atPopupSU){z-index:2147483000!important}' +
    '@media (max-width:900px){.ui-dialog:has(#_atPopupSU){top:2vh!important;max-height:96vh;overflow:auto;width:94vw!important;left:3vw!important}' +
    '.ui-dialog:has(#_atPopupSU) .p-close-btn{position:fixed!important;top:8px!important;right:8px!important;z-index:2147483001}}';
  document.head.appendChild(css);
  /* official ActiveTrail embed code */
  var _atpopq = window._atpopq || (window._atpopq = []);
  window._atpopobj = {};
  if (!_atpopq.loaded) {
    var v = Math.floor((Math.random() * 1000000) + 1);
    var atpopjs = document.createElement('script');
    atpopjs.type = 'text/javascript';
    atpopjs.async = true;
    atpopjs.src = '//cdn-media.web-view.net/popups/lib/v1/loader.min.js?v=' + v;
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(atpopjs, s);
    _atpopq.loaded = true;
  }
  _atpopq.push(['UserId', 'x3dfxjsap2s8']);
  _atpopq.push(['PopupId', 'dfedp2wp']);
  _atpopq.push(['IsraelCode', '104']);
  _atpopq.push(['CountryCode', '104']);
})();
