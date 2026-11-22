// Builds one static page per product at p/<id>.html from product.html, with the product's own
// <title>, meta description, canonical URL, Open Graph tags and Product JSON-LD in the HTML
// (so Google, WhatsApp and Facebook see the product name without running JavaScript).
// Also rewrites the product URLs in sitemap.xml.
// Run after changing js/data.js:   node tools/build-product-pages.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://proteinstock.co.il';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('js/data.js') + '\n' + read('js/catalog.js') + '\nthis.PRODUCTS = RAW.map(build); this.catName = catName;', ctx);
const { PRODUCTS, catName } = ctx;

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tpl = read('product.html');
if (!tpl.includes('<title>מוצר — פרוטאין סטוק</title>')) throw new Error('product.html <title> changed; update the generator');

const outDir = path.join(ROOT, 'p');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir);

for (const p of PRODUCTS) {
  const url = `${SITE}/p/${p.id}`;
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
    '<base href="/">',
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
  fs.writeFileSync(path.join(outDir, `${p.id}.html`), html);
}

// sitemap: product?id=X -> p/X
const sm = read('sitemap.xml').replace(/\/product\?id=([A-Za-z0-9_-]+)/g, '/p/$1');
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);

// vercel.json: permanent redirect from old product?id=X URLs to p/X for every static page
const vj = JSON.parse(read('vercel.json'));
vj.redirects = vj.redirects.filter(r => !(r.source === '/product' && r.has));
vj.redirects.unshift({ source: '/product', has: [{ type: 'query', key: 'id', value: `(?<pid>${PRODUCTS.map(p => p.id).join('|')})` }], destination: '/p/:pid', permanent: true });
fs.writeFileSync(path.join(ROOT, 'vercel.json'), JSON.stringify(vj, null, 2) + '\n');

console.log(`built ${PRODUCTS.length} product pages`);
