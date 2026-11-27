# Database: PostgreSQL (moving off Supabase)

Everything runs on Vercel once the steps below are done. Until `DB_LIVE=1` is set (and `/api/health` answers `"db": true`), the site keeps using the old
Supabase project automatically (storefront, checkout, forms, admin, store API), so nothing breaks during the move.

| What | Before (Supabase) | Now |
|---|---|---|
| Data | Supabase Postgres + REST | Any PostgreSQL (Neon via Vercel) + `api/db.js` |
| Database functions (reports, leads, abandoned carts, API keys, admins…) | `/rest/v1/rpc/*` | same SQL functions, called through `/api/rpc/<name>` (`api/ops.js`) |
| Checkout | Edge function `create-order` | `api/create-order.js` |
| PayPlus callback | Edge function `payment-webhook` | `api/payment-webhook.js` |
| PayPlus admin test | Edge function `payment-admin` | `api/payment-admin.js` |
| AI assistant | Edge function `admin-assistant` | `api/admin-assistant.js` |
| Paid orders → stock system | Edge function `order-webhook` + pg_net | `api/_lib/order-webhook.js` (queue table, sent right after payment) |
| Store API for external systems | Edge function `store-api` | `/api/v1/*` → `api/ops.js` |
| Face ID / Touch ID admin sign-in | Edge function `passkey` | `/api/passkey` → `api/ops.js` (same registered devices) |
| DNS screen | Edge function `dns-admin` | `/api/dns-admin` → `api/ops.js` |
| Admin login | Supabase Auth (email code) | `api/auth.js` (email code via Resend, HttpOnly cookie) |
| Customer accounts (/account) | Supabase Auth | `api/auth.js` with `scope: "customer"` (own cookie); accounts copied to `auth.users` |
| Gallery photos | Supabase Storage | shipped with the site (`img/p/g/`), links rewritten during the copy |
| New photo uploads | Supabase Storage | Vercel Blob (`api/upload.js`) |

`db/schema.sql` was generated from the live Supabase project (all tables, functions and triggers), plus a small `auth` shim
(`auth.jwt()`, `auth.users`) so the same SQL functions work: the API sets the signed-in email per request.

## One-time setup (Vercel project of proteinstock)

1. **Storage → Create Database → Neon (Postgres)**, connect it to the project (Production + Preview). This adds `DATABASE_URL`.
2. **Storage → Create → Blob**, connect it (adds `BLOB_READ_WRITE_TOKEN`) — for uploading product photos.
3. **Settings → Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | a long random string (40+ characters) |
   | `SETUP_TOKEN` | another random string (20+), used once for step 5 |
   | `SITE_URL` | `https://proteinstock.co.il` |
   | `BREVO_API_KEY` | from Brevo → SMTP & API → API Keys (sends the login codes for admins and customers; `RESEND_API_KEY` also works) |
   | `MAIL_FROM` | e.g. `פרוטאין סטוק <admin@proteinstock.co.il>` (sender or domain verified in Brevo) |
   | `PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY` | from the PayPlus dashboard (Supabase does not show saved secrets again) |
   | `ANTHROPIC_API_KEY` | from console.anthropic.com |
   | `CLOUDFLARE_API_TOKEN` | Cloudflare token limited to Zone → DNS → Edit for proteinstock.co.il (for the DNS screen) |
   | `SUPABASE_URL` | `https://yplzliqpohqehypllxdq.supabase.co` (only for the copy in step 5) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret key (only for step 5) |

4. Redeploy.
5. Create the tables and copy all data (15 tables + customer accounts) — no token needed before go-live:

   ```
   curl -X POST https://proteinstock.co.il/api/setup
   ```

   The answer lists how many rows were copied per table. Each run replaces the new database's data with Supabase's current data
   (at most once every 2 minutes), so run it once more right before going live.
6. Go live: set `DB_LIVE` = `1` (Production) and redeploy. From then on the site uses the new database and /api/setup is refused.
   Check `https://proteinstock.co.il/api/health` → `"db": true`.
7. Remove `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SETUP_TOKEN`, then redeploy.
8. Test: admin login (code by email, then Face ID), reports, a lead from /contact, /account login, a small order paid with PayPlus
   (turns "שולמה" and reaches the stock system), the store API with an existing key, and the DNS screen.
9. Only then pause the Supabase project (keep it a few weeks before deleting), and remove `LEGACY_SB` from `js/app.js`,
   the fallbacks in `checkout.html`, `cart.html`, `account.html`, `js/db-client.js`, `js/admin-passkey.js`, and the pass-through in `api/ops.js`.

`db/schema.sql` is plain PostgreSQL and also works on any other host (RDS, Railway, self-hosted): just set `DATABASE_URL`.
