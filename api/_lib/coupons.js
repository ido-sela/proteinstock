// Coupon pricing, shared by checkout (quote) and order creation.
// The same logic runs in the legacy Supabase function (coupons.ts there); keep the two in step.

// Store categories are derived from the product title, exactly like js/catalog.js does in the browser.
export function categoriesOf(p) {
  const t = String(p.title || '');
  let cat = 'protein-snacks';
  if (/monster/i.test(t)) cat = 'energy-drinks';
  else if (/^משקה חלבון/.test(t)) cat = 'protein-beverages';
  else if (/^עוגיית/.test(t)) cat = 'protein-cookies';
  else if (/^דייסת/.test(t)) cat = 'protein-fortified-oatmeal';
  else if (/קריאטין/.test(t)) cat = 'creatine-and-nutritional-supplements';
  else if (/^אבקת/.test(t)) cat = 'protein-powders';
  else if (/profusion/i.test(t)) cat = 'protein-health-snacks';
  const out = [p.category || cat];
  if (/warrior raw/i.test(t)) out.push('protein-health-snacks');
  return out;
}

// c: row returned by coupon_check(); lines: [{ product_id, title, category, cents }]; subtotalC in agorot.
// Returns { discountC, perLine: Map(product_id -> agorot) } or { error }.
// Store rule: a coupon never takes more than 40% off, whatever its type or value: a percentage above 40, or a fixed
// amount worth more than 40% of the eligible items, is cut down to 40% of those items.
export const MAX_COUPON_PCT = 40;

export function priceCoupon(c, lines, subtotalC) {
  if (c.min_order_amount != null && subtotalC < Math.round(Number(c.min_order_amount) * 100)) {
    return { error: 'coupon_min_order', min: Number(c.min_order_amount) };
  }
  const cats = c.category_ids || [], prods = c.product_ids || [];
  const eligible = lines.filter((l) =>
    c.applies_to === 'all' ||
    (c.applies_to === 'categories' && categoriesOf(l).some((x) => cats.includes(x))) ||
    (c.applies_to === 'products' && prods.includes(l.product_id)));
  if (!eligible.length) return { error: 'coupon_not_applicable' };

  const perLine = new Map();
  const value = Number(c.value);
  if (c.type === 'fixed') {
    const pool = eligible.reduce((s, l) => s + l.cents, 0);
    const cap = Math.min(Math.round(value * 100), pool);
    let left = cap;
    eligible.forEach((l, i) => {
      const d = i === eligible.length - 1 ? left : Math.min(left, Math.round((cap * l.cents) / pool));
      perLine.set(l.product_id, d); left -= d;
    });
  } else {
    const pct = Math.min(Math.max(value, 0), 100);
    eligible.forEach((l) => perLine.set(l.product_id, Math.round((l.cents * pct) / 100)));
  }
  let discountC = [...perLine.values()].reduce((s, d) => s + d, 0);
  const poolC = eligible.reduce((s, l) => s + l.cents, 0);
  const capC = Math.floor((poolC * MAX_COUPON_PCT) / 100);
  if (discountC > capC) {
    // scale every line down to the cap; the last line takes the rounding
    const keys = [...perLine.keys()];
    let left = capC;
    keys.forEach((k, i) => { const d = i === keys.length - 1 ? left : Math.floor((perLine.get(k) * capC) / discountC); perLine.set(k, d); left -= d; });
    discountC = capC;
  }
  return { discountC, perLine };
}

export const normCode = (v) => (typeof v === 'string' ? v.trim().toUpperCase().slice(0, 40) : '');
