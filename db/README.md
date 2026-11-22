# Database: PostgreSQL (moved off Supabase)

The site no longer needs Supabase. Everything runs on Vercel:

| What | Before (Supabase) | Now |
|---|---|---|
| Data | Supabase Postgres + REST | Any PostgreSQL (Neon via Vercel) + `api/db.js` |
| Checkout | Edge function `create-order` | `api/create-order.js` |
| PayPlus callback | Edge function `payment-webhook` | `api/payment-webhook.js` |
| PayPlus admin test | Edge function `payment-admin` | `api/payment-admin.js` |
| AI assistant | Edge function `admin-assistant` | `api/admin-assistant.js` |
| Admin login | Supabase Auth (email code) | `api/auth.js` (email code via Resend, HttpOnly cookie) |
| Product photos | Supabase Storage | Vercel Blob (`api/upload.js`) |

The browser never talks to the database directly. `api/db.js` checks every request against a whitelist:
the public can only read visible products and the `content`/`shipping` settings; everything else needs an admin session.

## One-time setup (in the Vercel project of proteinstock)

1. **Storage → Create → Neon (Postgres)** and connect it to the project. This adds `DATABASE_URL`.
2. **Storage → Create → Blob** and connect it (adds `BLOB_READ_WRITE_TOKEN`) — needed only for uploading product photos.
3. **Settings → Environment Variables** (Production):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | a long random string (40+ characters) |
   | `SETUP_TOKEN` | another random string, used once for step 5 |
   | `SITE_URL` | `https://proteinstock.co.il` |
   | `RESEND_API_KEY` | from resend.com (sends the admin login code) |
   | `MAIL_FROM` | e.g. `פרוטאין סטוק <admin@proteinstock.co.il>` (domain verified in Resend) |
   | `PAYPLUS_API_KEY`, `PAYPLUS_SECRET_KEY` | copy from Supabase → Edge Functions → Secrets |
   | `ANTHROPIC_API_KEY` | copy from Supabase → Edge Functions → Secrets |
   | `SUPABASE_URL` | `https://yplzliqpohqehypllxdq.supabase.co` (only for the copy in step 5) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys → service_role (only for step 5) |

4. Redeploy.
5. Create the tables and copy all data (products, settings, orders, admins, payment log):

   ```
   curl -X POST https://proteinstock.co.il/api/setup -H "x-setup-token: <SETUP_TOKEN>"
   ```

   The answer lists how many rows were copied per table. Running it again is safe (nothing is duplicated).
6. Check `https://proteinstock.co.il/api/health` → `"db": true`.
7. Remove `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SETUP_TOKEN`, then redeploy.
8. Test: log in to `/admin`, place a small order, and (if PayPlus is on) pay it and check it turns "שולמה".
9. Only then pause/delete the Supabase project, and remove `LEGACY_SB` from `js/app.js` and the fallback in `checkout.html`.

Until step 6 passes, the storefront and checkout automatically fall back to the old Supabase project, so the shop keeps working during the move.

`db/schema.sql` is plain PostgreSQL and also works on any other host (RDS, Railway, self-hosted): just set `DATABASE_URL`.
