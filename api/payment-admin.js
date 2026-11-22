// Admin-only: PayPlus key status and a test payment page.
import { one } from './_lib/db.js';
import { json, readJson, handler, origin } from './_lib/http.js';
import { adminEmail } from './_lib/auth.js';
import { getProvider, paymentKeysPresent, webhookUrl } from './_lib/payplus.js';

export default handler(['POST'], async (req, res) => {
  if (!(await adminEmail(req))) return json(res, { error: 'unauthorized' }, 401);
  const body = await readJson(req, 5000);
  const base = process.env.SITE_URL || origin(req);
  const webhook = webhookUrl(base);

  if (body.action === 'status') return json(res, { keys: paymentKeysPresent(), webhook_url: webhook });

  if (body.action === 'test') {
    const settings = (await one(`select value from site_settings where key = 'payment'`))?.value ?? {};
    const provider = getProvider(settings.provider);
    if (!provider) return json(res, { ok: false, error: 'no_provider' });
    try {
      const r = await provider.createPayment(
        { number: 'TEST', total: 1, currency: 'ILS', customer_name: 'בדיקת חיבור', phone: '0500000000', email: null,
          items: [{ title: 'בדיקת חיבור (לא מחויב)', qty: 1, unit_price: 1 }] },
        { returnUrl: req.headers.origin || base, webhookUrl: webhook, settings },
      );
      return json(res, { ok: true, url: r.url });
    } catch (e) {
      const m = String(e?.message ?? e);
      return json(res, { ok: false, error: m.startsWith('payplus_keys_missing') ? 'keys_missing' : m.startsWith('payplus_page_uid_missing') ? 'page_uid_missing' : 'provider_rejected', detail: m.slice(0, 300) });
    }
  }
  return json(res, { error: 'bad_action' }, 400);
});
