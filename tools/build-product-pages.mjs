// Builds one static page per product at product/<slug>.html (the old store's address, kept for Google and
// old links; the slugs are in js/data.js → SLUGS) from product.html, with the product's own
// <title>, meta description, canonical URL, Open Graph tags and Product JSON-LD in the HTML
// (so Google, WhatsApp and Facebook see the product name without running JavaScript).
// Also rewrites the product URLs in sitemap.xml and the redirects in vercel.json (/p/<id> and /product?id=<id>).
// Run after changing js/data.js:   node tools/build-product-pages.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://proteinstock.co.il';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('js/data.js') + '\n' + read('js/catalog.js') + '\nthis.PRODUCTS = RAW.map(build); this.catName = catName; this.SLUGS = SLUGS;', ctx);
const { PRODUCTS, catName, SLUGS } = ctx;
const missing = PRODUCTS.filter(p => !SLUGS[p.id] || !SLUGS[p.id].endsWith('-' + p.id));
if (missing.length) throw new Error('add a slug (ending with -<id>) to SLUGS in js/data.js for: ' + missing.map(p => p.id).join(', '));

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tpl = read('product.html');
if (!tpl.includes('<title>מוצר — פרוטאין סטוק</title>')) throw new Error('product.html <title> changed; update the generator');

const outDir = path.join(ROOT, 'product');
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'p'), { recursive: true, force: true });   // pages used to live at p/<id>.html
fs.mkdirSync(outDir);

for (const p of PRODUCTS) {
  const url = `${SITE}/product/${SLUGS[p.id]}`;
  const title = `${p.name} — פרוטאין סטוק`;
  const details = p.rest.join(' · ');
  const desc = `${p.name}${details ? ' · ' + details : ''}${p.brand ? ' · ' + p.brand : ''}. ${catName(p.cat)} במחיר ₪${p.price} כולל מע"מ, משלוח לכל הארץ — פרוטאין סטוק.`;
  const img = `${SITE}/${p.img}`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, description: desc, image: [img], sku: p.id,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    category: catName(p.cat),
    offers: { '@type': 'Offer', url, priceCurrency: 'ILS', price: String(p.price),
      availability: p.out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'פרוטאין סטוק' } }
  };
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="product">',
    '<meta property="og:site_name" content="פרוטאין סטוק">',
    '<meta property="og:locale" content="he_IL">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    `<script>window.PS_PID=${JSON.stringify(p.id)};</script>`
  ].join('\n');
  const html = tpl.replace('<title>מוצר — פרוטאין סטוק</title>', head);
  fs.writeFileSync(path.join(outDir, `${SLUGS[p.id]}.html`), html);
}

// sitemap: every product address -> /product/<slug>
const sm = read('sitemap.xml')
  .replace(/\/product\?id=([A-Za-z0-9_-]+)/g, (m, id) => SLUGS[id] ? '/product/' + SLUGS[id] : m)
  .replace(/\/p\/([A-Za-z0-9_-]+)/g, (m, id) => SLUGS[id] ? '/product/' + SLUGS[id] : m);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);

// vercel.json: permanent redirects from the addresses this site used before (/p/<id>, /product?id=<id>) to /product/<slug>
const vj = JSON.parse(read('vercel.json'));
vj.redirects = vj.redirects.filter(r => !(r.source.startsWith('/p/') || (r.source === '/product' && r.has)));   // ours, rebuilt below
const ours = [];
for (const p of PRODUCTS) {
  ours.push({ source: `/p/${p.id}`, destination: `/product/${SLUGS[p.id]}`, permanent: true });
  ours.push({ source: '/product', has: [{ type: 'query', key: 'id', value: p.id }], destination: `/product/${SLUGS[p.id]}`, permanent: true });
}
vj.redirects = [...ours, ...vj.redirects];
fs.writeFileSync(path.join(ROOT, 'vercel.json'), JSON.stringify(vj, null, 2) + '\n');

console.log(`built ${PRODUCTS.length} product pages`);
