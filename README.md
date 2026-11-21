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
