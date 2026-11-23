// Product catalog feed for Meta Commerce Manager / Google Merchant Center, at the old store's address:
// https://proteinstock.co.il/product-feed.xml (rewritten here in vercel.json). RSS 2.0 with the g: namespace.
// Reads the public product list (same data the storefront shows) and the product page addresses from js/data.js.
const SITE = 'https://proteinstock.co.il';
const SB = { url: 'https://yplzliqpohqehypllxdq.supabase.co', key: 'sb_publishable_Gcr_7r00CovbMZj-tJin8g_Jp8B1JcB' };

const x = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const abs = (p) => (!p ? '' : /^https?:\/\//.test(p) ? p : SITE + '/' + String(p).replace(/^\/+/, ''));
const money = (n) => Number(n).toFixed(2) + ' ILS';

async function slugs() {
  try {
    const t = await (await fetch(SITE + '/js/data.js', { cache: 'no-store' })).text();
    const m = t.match(/const SLUGS = \{([\s\S]*?)\};/);
    const out = {};
    if (m) for (const [, id, s] of m[1].matchAll(/'([a-z0-9]+)':'([^']+)'/g)) out[id] = s;
    return out;
  } catch { return {}; }
}

async function products() {
  const cols = 'id,title,description,price,old_price,out_of_stock,vendor,category,tags,image,sku,images';
  const get = (c) => fetch(`${SB.url}/rest/v1/products?select=${c}&order=id`, { headers: { apikey: SB.key } });
  let r = await get(cols);
  if (!r.ok) r = await get(cols.replace(',images', ''));   // before the gallery column exists
  if (!r.ok) throw new Error('products ' + r.status);
  return r.json();
}

export default async function handler(req, res) {
  try {
    const [list, S] = await Promise.all([products(), slugs()]);
    const items = list.map((p) => {
      const link = SITE + '/' + (S[p.id] ? 'product/' + S[p.id] : 'product?id=' + encodeURIComponent(p.id));
      const sale = Number(p.old_price) > Number(p.price);
      const extra = (Array.isArray(p.images) ? p.images : []).filter((u) => u && u !== p.image).slice(0, 10);
      const gtin = /^\d{8,14}$/.test(String(p.sku || '')) ? p.sku : '';
      return `<item>
<g:id>${x(p.id)}</g:id>
<g:title>${x(String(p.title).slice(0, 150))}</g:title>
<g:description>${x((text(p.description) || p.title).slice(0, 4990))}</g:description>
<g:link>${x(link)}</g:link>
<g:image_link>${x(abs(p.image))}</g:image_link>
${extra.map((u) => `<g:additional_image_link>${x(abs(u))}</g:additional_image_link>`).join('\n')}
<g:availability>${p.out_of_stock ? 'out of stock' : 'in stock'}</g:availability>
<g:condition>new</g:condition>
<g:price>${money(sale ? p.old_price : p.price)}</g:price>
${sale ? `<g:sale_price>${money(p.price)}</g:sale_price>` : ''}
${p.vendor ? `<g:brand>${x(p.vendor)}</g:brand>` : ''}
${gtin ? `<g:gtin>${x(gtin)}</g:gtin>` : `<g:identifier_exists>no</g:identifier_exists>`}
${p.sku ? `<g:mpn>${x(p.sku)}</g:mpn>` : ''}
${p.category ? `<g:product_type>${x(p.category)}</g:product_type>` : ''}
</item>`.replace(/\n{2,}/g, '\n');
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>פרוטאין סטוק - PROTEIN STOCK</title>
<link>${SITE}</link>
<description>Product feed</description>
${items.join('\n')}
</channel>
</rss>`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
    res.end(xml);
  } catch (e) {
    console.error(e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('feed temporarily unavailable');
  }
}
