# Protein Stock

Static site (no build step). Deploy the repository root as-is on Vercel (Framework preset: Other, no build command, output directory: `.`).

## Backend (Supabase project `yplzliqpohqehypllxdq`)

- Tables: `products`, `orders`, `order_items`, `payment_events`, `site_settings` (RLS on; only `products` is publicly readable).
- Edge Functions: `create-order` (prices and totals are computed on the server from `products`), `payment-webhook` (confirms payment through `mark_order_paid`).
- `js/app.js` holds the public Supabase URL and publishable key (`PS_CONFIG`). Never put a `service_role` key or provider secrets in this repo.

## Changing prices

The server uses the `products` table, not `js/data.js`. Change a price in both places (or update the table in the Supabase dashboard), otherwise the shown price and the charged price differ.

## Connecting a payment provider (later)

1. Add an adapter to `providers` in both edge functions (`providers.ts`): `createPayment` and `parseWebhook` (must verify the provider's signature).
2. Store provider secrets with `supabase secrets set`.
3. Set `site_settings` key `payment` to `{"provider":"<key>","enabled":true}`.
4. Give the provider this webhook URL: `https://yplzliqpohqehypllxdq.supabase.co/functions/v1/payment-webhook?provider=<key>`.

Until then, orders are saved as `pending` and the customer gets the order number plus a WhatsApp link.

## Product pages

Product pages keep the old store's addresses: every product in `js/data.js` has a static page at `product/<slug>.html` (served as `/product/<slug>`; the slugs are in `SLUGS` at the end of `js/data.js` and end with the product id) with its own `<title>`, meta description, canonical URL, Open Graph tags and Product JSON-LD. The addresses this site used for a few days (`/p/<id>`, `/product?id=<id>`) redirect there (`vercel.json`). Any other `/product/<something>-<id>` address still opens the right product (`product.html` reads the id at the end). Products added in the admin use `product?id=`.

Categories live at `/category/<id>` (also the old store's addresses), served by `products.html`.

After changing `js/data.js` or `product.html`, rebuild: `node tools/build-product-pages.mjs` (also updates `sitemap.xml` and the redirects in `vercel.json`). A new product needs a slug in `SLUGS` first.
