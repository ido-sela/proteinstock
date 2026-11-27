-- Protein Stock — PostgreSQL schema (moved off Supabase). Generated from the live Supabase project on 27.11.2026
-- (tables, functions and triggers as they run there), plus a small "auth" shim so the same SQL functions work here.
-- Works on any PostgreSQL 14+ (Neon, Vercel Postgres, RDS, self-hosted).
-- Access control lives in the API (/api/*): the database is never exposed to the browser.
-- Safe to run more than once.

create extension if not exists pgcrypto;   -- gen_random_bytes(), digest()
create schema if not exists extensions;    -- some functions list it in their search_path (as on Supabase)

-- ---------- auth shim ----------
-- On Supabase, auth.jwt() is the signed-in user's token. Here the API sets it per request:
--   select set_config('request.jwt.claims', '{"email":"..."}', true)   (see api/_lib/rpc.js)
-- auth.users keeps the store's customer accounts (email login on /account) and admins' last sign-in.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

-- ---------- tables ----------
create table if not exists public."abandoned_checkouts" (
  "id" uuid default gen_random_uuid() not null,
  "client_key" text not null,
  "name" text,
  "phone" text,
  "email" text,
  "items" jsonb default '[]'::jsonb not null,
  "total" numeric default 0 not null,
  "step" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "recovered_order" text,
  "recovered_at" timestamp with time zone,
  "contacted_at" timestamp with time zone,
  constraint "abandoned_checkouts_client_key_key" UNIQUE (client_key),
  constraint "abandoned_checkouts_pkey" PRIMARY KEY (id),
  constraint "abandoned_checkouts_client_key_check" CHECK (((length(client_key) >= 8) AND (length(client_key) <= 64)))
);

create table if not exists public."admin_log" (
  "id" bigint generated always as identity not null,
  "at" timestamp with time zone default now() not null,
  "admin_email" text not null,
  "kind" text not null,
  "detail" jsonb default '{}'::jsonb not null,
  constraint "admin_log_pkey" PRIMARY KEY (id),
  constraint "admin_log_kind_check" CHECK ((kind = ANY (ARRAY['prompt'::text, 'change'::text, 'dev_request'::text])))
);

create table if not exists public."admin_otps" (
  "id" bigint generated always as identity not null,
  "email" text not null,
  "code_hash" text not null,
  "attempts" integer default 0 not null,
  "used" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone not null,
  constraint "admin_otps_pkey" PRIMARY KEY (id)
);

create table if not exists public."admin_passkeys" (
  "id" uuid default gen_random_uuid() not null,
  "email" text not null,
  "credential_id" text not null,
  "public_key" text not null,
  "counter" bigint default 0 not null,
  "transports" text[] default '{}'::text[] not null,
  "device_name" text,
  "created_at" timestamp with time zone default now() not null,
  "last_used_at" timestamp with time zone,
  constraint "admin_passkeys_credential_id_key" UNIQUE (credential_id),
  constraint "admin_passkeys_pkey" PRIMARY KEY (id)
);

create table if not exists public."admins" (
  "email" text not null,
  "added_at" timestamp with time zone default now() not null,
  constraint "admins_pkey" PRIMARY KEY (email),
  constraint "admins_email_check" CHECK ((email = lower(email)))
);

create table if not exists public."api_keys" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "prefix" text not null,
  "key_hash" text not null,
  "scopes" text[] default '{orders:read,products:read,stock:write}'::text[] not null,
  "created_at" timestamp with time zone default now() not null,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  constraint "api_keys_key_hash_key" UNIQUE (key_hash),
  constraint "api_keys_pkey" PRIMARY KEY (id)
);

create table if not exists public."coupons" (
  "code" text not null,
  "type" text default 'percentage'::text not null,
  "value" numeric not null,
  "applies_to" text default 'all'::text not null,
  "category_ids" text[] default '{}'::text[] not null,
  "product_ids" text[] default '{}'::text[] not null,
  "min_order_amount" numeric,
  "max_uses" integer,
  "uses_count" integer default 0 not null,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "active" boolean default true not null,
  "description" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "coupons_pkey" PRIMARY KEY (code),
  constraint "coupons_applies_to_check" CHECK ((applies_to = ANY (ARRAY['all'::text, 'categories'::text, 'products'::text]))),
  constraint "coupons_check" CHECK (((type <> 'percentage'::text) OR (value <= (100)::numeric))),
  constraint "coupons_code_check" CHECK (((code = upper(code)) AND ((length(code) >= 2) AND (length(code) <= 40)))),
  constraint "coupons_max_uses_check" CHECK (((max_uses IS NULL) OR (max_uses > 0))),
  constraint "coupons_min_order_amount_check" CHECK (((min_order_amount IS NULL) OR (min_order_amount >= (0)::numeric))),
  constraint "coupons_type_check" CHECK ((type = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
  constraint "coupons_uses_count_check" CHECK ((uses_count >= 0)),
  constraint "coupons_value_check" CHECK ((value > (0)::numeric))
);

create table if not exists public."integrations" (
  "key" text not null,
  "value" jsonb default '{}'::jsonb not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "integrations_pkey" PRIMARY KEY (key)
);

create table if not exists public."leads" (
  "id" bigint generated always as identity not null,
  "created_at" timestamp with time zone default now() not null,
  "source" text not null,
  "name" text not null,
  "phone" text,
  "email" text,
  "business" text,
  "business_type" text,
  "city" text,
  "products" text,
  "message" text,
  "page" text,
  "status" text default 'new'::text not null,
  constraint "leads_pkey" PRIMARY KEY (id),
  constraint "leads_source_check" CHECK ((source = ANY (ARRAY['contact'::text, 'business-wholesale'::text, 'transaction-cancellation'::text]))),
  constraint "leads_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'handled'::text])))
);

create table if not exists public."newsletter_subscribers" (
  "id" bigint generated by default as identity not null,
  "email" text not null,
  "source" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "newsletter_subscribers_email_key" UNIQUE (email),
  constraint "newsletter_subscribers_pkey" PRIMARY KEY (id)
);

create table if not exists public."orders" (
  "id" uuid default gen_random_uuid() not null,
  "number" text not null,
  "status" text default 'pending'::text not null,
  "customer_name" text not null,
  "phone" text not null,
  "email" text,
  "address" text,
  "notes" text,
  "subtotal" numeric(10,2) not null,
  "shipping" numeric(10,2) default 0 not null,
  "total" numeric(10,2) not null,
  "currency" text default 'ILS'::text not null,
  "payment_provider" text,
  "payment_ref" text,
  "paid_at" timestamp with time zone,
  "ip_hash" text,
  "created_at" timestamp with time zone default now() not null,
  "delivery" text default 'shipping'::text not null,
  "discount" numeric default 0 not null,
  "coupon_code" text,
  "fulfillment" text,
  "tracking_number" text,
  "source" text default 'site'::text not null,
  "shipping_method" text,
  "phone9" text generated always as ("right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), 9)) stored,
  constraint "orders_number_key" UNIQUE (number),
  constraint "orders_pkey" PRIMARY KEY (id),
  constraint "orders_delivery_check" CHECK ((delivery = ANY (ARRAY['shipping'::text, 'pickup'::text]))),
  constraint "orders_discount_check" CHECK ((discount >= (0)::numeric)),
  constraint "orders_fulfillment_check" CHECK (((fulfillment IS NULL) OR (fulfillment = ANY (ARRAY['pending'::text, 'processing'::text, 'shipped'::text, 'completed'::text, 'cancelled'::text])))),
  constraint "orders_shipping_check" CHECK ((shipping >= (0)::numeric)),
  constraint "orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text]))),
  constraint "orders_subtotal_check" CHECK ((subtotal >= (0)::numeric)),
  constraint "orders_total_check" CHECK ((total >= (0)::numeric))
);

create table if not exists public."order_items" (
  "id" bigint generated always as identity not null,
  "order_id" uuid not null,
  "product_id" text not null,
  "title" text not null,
  "unit_price" numeric(10,2) not null,
  "qty" integer not null,
  "line_total" numeric(10,2) not null,
  constraint "order_items_pkey" PRIMARY KEY (id),
  constraint "order_items_qty_check" CHECK (((qty > 0) AND (qty <= 50)))
);

create table if not exists public."order_webhook_log" (
  "id" bigint generated by default as identity not null,
  "order_number" text,
  "event" text,
  "url" text,
  "ok" boolean,
  "status" integer,
  "ms" integer,
  "response" text,
  "attempt" integer default 1,
  "created_at" timestamp with time zone default now() not null,
  constraint "order_webhook_log_pkey" PRIMARY KEY (id)
);

-- Paid orders waiting to be sent to the stock system's webhook (on Supabase this was pg_net; here the API sends them).
create table if not exists public."order_webhook_queue" (
  "order_id" uuid not null,
  "queued_at" timestamp with time zone default now() not null,
  constraint "order_webhook_queue_pkey" PRIMARY KEY (order_id)
);

create table if not exists public."payment_events" (
  "id" bigint generated always as identity not null,
  "provider" text not null,
  "event_id" text not null,
  "order_number" text,
  "payload" jsonb,
  "received_at" timestamp with time zone default now() not null,
  constraint "payment_events_provider_event_id_key" UNIQUE (provider, event_id),
  constraint "payment_events_pkey" PRIMARY KEY (id)
);

create table if not exists public."products" (
  "id" text not null,
  "title" text not null,
  "price" numeric(10,2) not null,
  "old_price" numeric(10,2) default 0 not null,
  "out_of_stock" boolean default false not null,
  "hidden" boolean default false not null,
  "updated_at" timestamp with time zone default now() not null,
  "description" text default ''::text not null,
  "vendor" text,
  "category" text,
  "tags" text[] default '{}'::text[] not null,
  "image" text,
  "quantity" integer,
  "sku" text,
  "status" text default 'active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "images" text[] default '{}'::text[] not null,
  "low_stock_threshold" integer,
  "zappy_id" text,
  "zappy_title" text,
  "cats" text[],
  constraint "products_pkey" PRIMARY KEY (id),
  constraint "products_low_stock_threshold_check" CHECK (((low_stock_threshold IS NULL) OR (low_stock_threshold >= 0))),
  constraint "products_old_price_check" CHECK ((old_price >= (0)::numeric)),
  constraint "products_price_check" CHECK ((price >= (0)::numeric)),
  constraint "products_quantity_check" CHECK (((quantity IS NULL) OR (quantity >= 0))),
  constraint "products_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'draft'::text, 'archived'::text])))
);

create table if not exists public."site_settings" (
  "key" text not null,
  "value" jsonb not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "site_settings_pkey" PRIMARY KEY (key)
);

create table if not exists public."webauthn_challenges" (
  "id" uuid default gen_random_uuid() not null,
  "challenge" text not null,
  "kind" text not null,
  "email" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "webauthn_challenges_pkey" PRIMARY KEY (id),
  constraint "webauthn_challenges_kind_check" CHECK ((kind = ANY (ARRAY['register'::text, 'login'::text])))
);

do $$ begin alter table public."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE; exception when duplicate_object or duplicate_table then null; end $$;

-- Store rule: a percentage coupon is never above 40%. NOT VALID: checked on new and edited coupons, older rows are left as they are.
do $$ begin alter table coupons add constraint coupons_max_40 check (type <> 'percentage' or value <= 40) not valid; exception when duplicate_object or duplicate_table then null; end $$;

create index if not exists abandoned_checkouts_updated_idx ON public.abandoned_checkouts USING btree (updated_at DESC);
create index if not exists admin_log_at_idx ON public.admin_log USING btree (at DESC);
create index if not exists admin_log_email_idx ON public.admin_log USING btree (admin_email, kind, at DESC);
create index if not exists admin_otps_email_idx ON public.admin_otps USING btree (email, created_at DESC);
create index if not exists admin_passkeys_email_idx ON public.admin_passkeys USING btree (email);
create index if not exists leads_created ON public.leads USING btree (created_at DESC);
create index if not exists order_items_order_idx ON public.order_items USING btree (order_id);
create index if not exists order_webhook_log_created ON public.order_webhook_log USING btree (created_at DESC);
create index if not exists orders_coupon_idx ON public.orders USING btree (coupon_code) WHERE (coupon_code IS NOT NULL);
create index if not exists orders_created_idx ON public.orders USING btree (created_at DESC);
create index if not exists orders_ip_idx ON public.orders USING btree (ip_hash, created_at DESC);
create index if not exists orders_phone9 ON public.orders USING btree (phone9);
create index if not exists orders_status_idx ON public.orders USING btree (status);

-- ---------- functions (same as on Supabase) ----------
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$function$;

CREATE OR REPLACE FUNCTION public.ps_phone_key(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '^972', '0')
$function$;

CREATE OR REPLACE FUNCTION public.admin_abandoned(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then raise exception 'unauthorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(a) - 'client_key' order by a.updated_at desc) from (
        select * from abandoned_checkouts where (coalesce(p->>'show', 'open') = 'all' or (recovered_at is null and updated_at < now() - interval '30 minutes'))
        order by updated_at desc limit 500) a), '[]'),
    'open', (select count(*) from abandoned_checkouts where recovered_at is null and updated_at < now() - interval '30 minutes'),
    'open_value', (select coalesce(sum(total), 0) from abandoned_checkouts where recovered_at is null and updated_at < now() - interval '30 minutes'),
    'recovered', (select count(*) from abandoned_checkouts where recovered_at is not null),
    'recovered_value', (select coalesce(sum(o.total), 0) from abandoned_checkouts a join orders o on o.number = a.recovered_order));
end $function$;

CREATE OR REPLACE FUNCTION public.coupon_check(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare c coupons%rowtype; held int;
begin
  select * into c from coupons where code = upper(trim(p_code));
  if not found or not c.active then return jsonb_build_object('error', 'coupon_invalid'); end if;
  if c.starts_at is not null and now() < c.starts_at then return jsonb_build_object('error', 'coupon_not_started'); end if;
  if c.ends_at is not null and now() > c.ends_at then return jsonb_build_object('error', 'coupon_expired'); end if;
  if c.max_uses is not null then
    select count(*) into held from orders where coupon_code = c.code and status = 'pending' and created_at > now() - interval '2 hours';
    if c.uses_count + held >= c.max_uses then return jsonb_build_object('error', 'coupon_used_up'); end if;
  end if;
  return jsonb_build_object('code', c.code, 'type', c.type, 'value', c.value, 'applies_to', c.applies_to,
    'category_ids', to_jsonb(c.category_ids), 'product_ids', to_jsonb(c.product_ids), 'min_order_amount', c.min_order_amount);
end; $function$;

CREATE OR REPLACE FUNCTION public.coupon_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.coupon_code is null then return new; end if;
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update coupons set uses_count = uses_count + 1 where code = new.coupon_code;
  elsif old.status = 'paid' and new.status in ('cancelled','refunded') then
    update coupons set uses_count = greatest(uses_count - 1, 0) where code = new.coupon_code;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_number text, p_provider text, p_event_id text, p_ref text, p_amount numeric, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders%rowtype;
  inserted int;
begin
  insert into public.payment_events (provider, event_id, order_number, payload)
  values (p_provider, p_event_id, p_number, p_payload)
  on conflict (provider, event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  select * into o from public.orders where number = p_number for update;
  if not found then return 'order_not_found'; end if;
  if o.status = 'paid' then return 'already_paid'; end if;
  if o.status <> 'pending' then return 'not_payable'; end if;
  if p_amount is null or round(p_amount, 2) <> o.total then return 'amount_mismatch'; end if;

  update public.orders
     set status = 'paid', paid_at = now(), payment_provider = p_provider, payment_ref = p_ref
   where id = o.id;
  return 'paid';
end;
$function$;

CREATE OR REPLACE FUNCTION public.products_sync_cats()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.cats is not distinct from old.cats and new.category is distinct from old.category and new.cats is not null then
    new.cats := array_remove(array_remove(new.cats, old.category), new.category);
    if new.category is not null then new.cats := array_prepend(new.category, new.cats); end if;
  elsif new.cats is distinct from old.cats and new.cats is not null and array_length(new.cats, 1) > 0 then
    new.category := new.cats[1];
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ps_admins()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', a.email, 'added_at', a.added_at, 'last_sign_in', u.last_sign_in_at,
            'me', a.email = lower(auth.jwt() ->> 'email')) order by a.added_at nulls first)
          from admins a left join auth.users u on lower(u.email) = a.email), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.ps_admin_add(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 120 then return jsonb_build_object('error', 'invalid_email'); end if;
  insert into admins(email, added_at) values (e, now()) on conflict (email) do nothing;
  return ps_admins();
end $function$;

CREATE OR REPLACE FUNCTION public.ps_admin_remove(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  if e = lower(auth.jwt() ->> 'email') then return jsonb_build_object('error', 'self'); end if;
  if (select count(*) from admins) <= 1 then return jsonb_build_object('error', 'last'); end if;
  delete from admins where email = e;
  delete from admin_passkeys where lower(email) = e;
  return ps_admins();
end $function$;

CREATE OR REPLACE FUNCTION public.ps_api_keys()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'prefix', prefix, 'scopes', scopes, 'created_at', created_at,
    'last_used_at', last_used_at, 'revoked_at', revoked_at) order by revoked_at nulls first, created_at desc) from api_keys), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.ps_api_key_create(p_name text, p_scopes text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k text; sc text[];
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  sc := array(select distinct s from unnest(coalesce(p_scopes, '{}')) s where s in ('orders:read','orders:write','products:read','stock:write'));
  if array_length(sc, 1) is null then return jsonb_build_object('error', 'no_scopes'); end if;
  if length(trim(coalesce(p_name,''))) < 2 then return jsonb_build_object('error', 'no_name'); end if;
  k := 'ps_live_' || encode(gen_random_bytes(24), 'hex');
  insert into api_keys(name, prefix, key_hash, scopes) values (left(trim(p_name), 80), left(k, 12), encode(digest(k, 'sha256'), 'hex'), sc);
  insert into admin_log(admin_email, kind, detail) values (lower(auth.jwt() ->> 'email'), 'change', jsonb_build_object('tool', 'api_key_create', 'name', p_name, 'scopes', sc));
  return jsonb_build_object('key', k, 'keys', ps_api_keys());
end $function$;

CREATE OR REPLACE FUNCTION public.ps_api_key_revoke(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  update api_keys set revoked_at = now() where id = p_id and revoked_at is null;
  insert into admin_log(admin_email, kind, detail) values (lower(auth.jwt() ->> 'email'), 'change', jsonb_build_object('tool', 'api_key_revoke', 'id', p_id));
  return ps_api_keys();
end $function$;

CREATE OR REPLACE FUNCTION public.ps_customer_accounts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  return jsonb_build_object('accounts', coalesce((select jsonb_agg(jsonb_build_object('email', lower(u.email), 'created_at', u.created_at, 'last_sign_in', u.last_sign_in_at,
      'orders', (select count(*) from orders o where lower(o.email) = lower(u.email))))
    from auth.users u where u.email is not null and lower(u.email) not in (select email from admins)), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.ps_filter_orders(p jsonb)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from date := nullif(p->>'from', '')::date;
  v_to date := nullif(p->>'to', '')::date;
  v_status text[] := case when coalesce(p->>'status', 'all') in ('all', '') then null else string_to_array(p->>'status', ',') end;
  v_coupon text := nullif(p->>'coupon', '');
  v_delivery text := nullif(p->>'delivery', '');
  v_customer text := nullif(ps_phone_key(p->>'customer'), '');
  v_q text := nullif(trim(coalesce(p->>'q', '')), '');
  v_like text; v_digits text;
begin
  if v_q is not null then
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := ps_phone_key(v_q);
    if length(v_digits) < 3 then v_digits := null; end if;
  end if;
  return query select o.* from orders o where
    (v_from is null or (o.created_at at time zone 'Asia/Jerusalem')::date >= v_from)
    and (v_to is null or (o.created_at at time zone 'Asia/Jerusalem')::date <= v_to)
    and (v_status is null or o.status = any(v_status))
    and (v_coupon is null or (v_coupon = 'any' and o.coupon_code is not null) or (v_coupon = 'none' and o.coupon_code is null)
         or (v_coupon not in ('any', 'none') and o.coupon_code = upper(v_coupon)))
    and (v_delivery is null or o.delivery = v_delivery)
    and (nullif(p->>'fulfillment', '') is null or (p->>'fulfillment' = 'none' and o.fulfillment is null) or o.fulfillment = p->>'fulfillment')
    and (v_customer is null or ps_phone_key(o.phone) = v_customer)
    and (v_q is null or o.number ilike v_like or o.customer_name ilike v_like or coalesce(o.email, '') ilike v_like
         or coalesce(o.coupon_code, '') ilike v_like or coalesce(o.payment_ref, '') ilike v_like
         or (v_digits is not null and ps_phone_key(o.phone) like '%' || v_digits || '%')
         or exists (select 1 from order_items i where i.order_id = o.id and i.title ilike v_like));
end $function$;

CREATE OR REPLACE FUNCTION public.ps_kpi(f date, t date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'revenue', coalesce(sum(o.total) filter (where o.status = 'paid'), 0),
    'paid_orders', count(*) filter (where o.status = 'paid'),
    'all_orders', count(*),
    'pending_orders', count(*) filter (where o.status = 'pending'),
    'pending_value', coalesce(sum(o.total) filter (where o.status = 'pending'), 0),
    'lost_orders', count(*) filter (where o.status in ('failed', 'cancelled', 'refunded')),
    'discounts', coalesce(sum(o.discount) filter (where o.status = 'paid'), 0),
    'coupon_orders', count(*) filter (where o.status = 'paid' and o.coupon_code is not null),
    'shipping', coalesce(sum(o.shipping) filter (where o.status = 'paid'), 0),
    'customers', count(distinct ps_phone_key(o.phone)) filter (where o.status = 'paid'))
  from orders o where (o.created_at at time zone 'Asia/Jerusalem')::date between f and t
$function$;

CREATE OR REPLACE FUNCTION public.ps_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if e = '' then return jsonb_build_object('error', 'not_signed_in'); end if;
  return jsonb_build_object(
    'email', e,
    'profile', (select jsonb_build_object('name', o.customer_name, 'phone', o.phone, 'address', case when o.delivery = 'pickup' then null else o.address end)
                from orders o where lower(o.email) = e order by o.created_at desc limit 1),
    'orders', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object('number', o.number, 'created_at', o.created_at, 'status', o.status, 'fulfillment', o.fulfillment,
          'tracking_number', o.tracking_number, 'total', o.total, 'discount', o.discount, 'coupon', o.coupon_code, 'shipping', o.shipping,
          'delivery', o.delivery,
          'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.product_id, 'title', i.title, 'q', i.qty, 'price', i.unit_price, 'total', i.line_total)) from order_items i where i.order_id = o.id), '[]'::jsonb)) x
        from orders o where lower(o.email) = e and o.status <> 'cancelled' or (lower(o.email) = e and o.paid_at is not null)) s), '[]'::jsonb));
end $function$;

-- On Supabase this called the order-webhook function through pg_net. Here it queues the order; the API sends it (api/_lib/order-webhook.js).
CREATE OR REPLACE FUNCTION public.ps_order_paid_hook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cfg jsonb;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select value into cfg from integrations where key = 'order_webhook';
    if cfg is not null and coalesce((cfg->>'enabled')::boolean, false) and coalesce(cfg->>'url', '') <> '' then
      insert into order_webhook_queue(order_id) values (new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ps_order_public(p_number text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'paid', o.paid_at is not null or o.status = 'paid',
    'total', o.total, 'shipping', o.shipping, 'discount', o.discount, 'coupon', o.coupon_code, 'currency', o.currency,
    'first_name', split_part(coalesce(o.customer_name,''), ' ', 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.product_id, 'q', i.qty, 'price', i.unit_price)) from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o
  where o.number = upper(left(regexp_replace(coalesce(p_number,''), '[^A-Za-z0-9-]', '', 'g'), 24))
    and o.created_at > now() - interval '3 days'
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.ps_order_row(o orders)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (to_jsonb(o) - 'ip_hash') || jsonb_build_object(
    'items', (select coalesce(sum(qty), 0) from order_items i where i.order_id = o.id),
    'thumbs', (select coalesce(jsonb_agg(x.image), '[]') from (select p.image from order_items i join products p on p.id = i.product_id
                 where i.order_id = o.id and p.image is not null order by i.id limit 4) x))
$function$;

CREATE OR REPLACE FUNCTION public.ps_recover_checkout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update abandoned_checkouts a set recovered_order = new.number, recovered_at = now()
   where a.recovered_at is null and a.updated_at > now() - interval '14 days'
     and ((a.phone is not null and ps_phone_key(a.phone) = ps_phone_key(new.phone)) or (a.email is not null and new.email is not null and a.email = lower(new.email)));
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.ps_save_checkout(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text := left(coalesce(p->>'key', ''), 64);
  v_phone text := nullif(left(trim(coalesce(p->>'phone', '')), 20), '');
  v_email text := nullif(lower(left(trim(coalesce(p->>'email', '')), 120)), '');
  v_items jsonb := coalesce(p->'items', '[]'::jsonb);
begin
  if length(k) < 8 then return; end if;
  if v_phone is not null and length(ps_phone_key(v_phone)) < 9 then v_phone := null; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then v_email := null; end if;
  if v_phone is null and v_email is null then return; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 40 or length(v_items::text) > 8000 then return; end if;
  insert into abandoned_checkouts (client_key, name, phone, email, items, total, step)
  values (k, nullif(left(trim(coalesce(p->>'name', '')), 80), ''), v_phone, v_email, v_items, least(greatest(coalesce((p->>'total')::numeric, 0), 0), 100000), left(p->>'step', 20))
  on conflict (client_key) do update set name = coalesce(excluded.name, abandoned_checkouts.name), phone = coalesce(excluded.phone, abandoned_checkouts.phone),
    email = coalesce(excluded.email, abandoned_checkouts.email), items = excluded.items, total = excluded.total, step = excluded.step, updated_at = now(),
    recovered_order = case when abandoned_checkouts.recovered_at < now() - interval '1 hour' then null else abandoned_checkouts.recovered_order end,
    recovered_at = case when abandoned_checkouts.recovered_at < now() - interval '1 hour' then null else abandoned_checkouts.recovered_at end;
end $function$;

CREATE OR REPLACE FUNCTION public.ps_save_lead(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text := left(trim(coalesce(p->>'name','')), 120);
        v_phone text := left(regexp_replace(coalesce(p->>'phone',''), '[^0-9+]', '', 'g'), 20);
        v_src text := coalesce(p->>'source','contact');
begin
  if v_src not in ('contact','business-wholesale','transaction-cancellation') then v_src := 'contact'; end if;
  if length(v_name) < 2 then return jsonb_build_object('error','invalid_name'); end if;
  if length(v_phone) < 9 and coalesce(p->>'email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error','invalid_contact');
  end if;
  if (select count(*) from leads where phone = v_phone and v_phone <> '' and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error','rate_limited');
  end if;
  insert into leads(source,name,phone,email,business,business_type,city,products,message,page)
  values (v_src, v_name, v_phone, left(p->>'email',160), left(p->>'business',160), left(p->>'business_type',80),
          left(p->>'city',80), left(p->>'products',500), left(p->>'message',2000), left(p->>'page',200));
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.ps_subscribe(p_email text, p_source text DEFAULT 'site'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e text := lower(trim(coalesce(p_email,'')));
begin
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 120 then return jsonb_build_object('error','invalid_email'); end if;
  insert into newsletter_subscribers(email, source) values (e, left(coalesce(p_source,'site'),40)) on conflict (email) do nothing;
  return jsonb_build_object('ok', true, 'coupon', (select code from coupons where code = 'WELCOME30' and active and (ends_at is null or ends_at > now())));
end $function$;

CREATE OR REPLACE FUNCTION public.ps_webhook_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  return jsonb_build_object('config', (select value from integrations where key = 'order_webhook'),
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (select * from order_webhook_log order by created_at desc limit 15) l), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.ps_webhook_set(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare cur jsonb; u text; s text;
begin
  if not is_admin() then return jsonb_build_object('error', 'forbidden'); end if;
  select value into cur from integrations where key = 'order_webhook';
  u := trim(coalesce(p->>'url', cur->>'url', ''));
  if u <> '' and u !~ '^https://[^\s]+$' then return jsonb_build_object('error', 'bad_url'); end if;
  s := cur->>'secret';
  if (p->>'new_secret')::boolean then s := encode(gen_random_bytes(24), 'hex'); end if;
  if coalesce(trim(p->>'secret'), '') <> '' then
    s := trim(p->>'secret');
    if length(s) < 16 or length(s) > 256 or s ~ '\s' then return jsonb_build_object('error', 'bad_secret'); end if;
  end if;
  insert into integrations(key, value) values ('order_webhook', '{}') on conflict (key) do nothing;
  update integrations set value = jsonb_build_object(
      'url', u,
      'enabled', coalesce((p->>'enabled')::boolean, (cur->>'enabled')::boolean, false) and u <> '',
      'secret', s),
    updated_at = now()
  where key = 'order_webhook';
  return ps_webhook_get();
end $function$;

CREATE OR REPLACE FUNCTION public.release_stock(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    update public.products set quantity = quantity + (it->>'qty')::int, out_of_stock = false
      where id = it->>'id' and quantity is not null;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_stock(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it jsonb; pid text; q int; r int; failed jsonb := '[]'::jsonb; done jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    pid := it->>'id'; q := (it->>'qty')::int;
    update public.products set quantity = quantity - q, out_of_stock = (quantity - q) <= 0
      where id = pid and quantity is not null and quantity >= q;
    get diagnostics r = row_count;
    if r = 1 then done := done || jsonb_build_array(it);
    elsif exists (select 1 from public.products where id = pid and quantity is not null) then failed := failed || to_jsonb(pid);
    end if;
  end loop;
  if jsonb_array_length(failed) > 0 then
    for it in select * from jsonb_array_elements(done) loop
      update public.products set quantity = quantity + (it->>'qty')::int, out_of_stock = false where id = it->>'id';
    end loop;
    done := '[]'::jsonb;
  end if;
  return jsonb_build_object('failed', failed, 'reserved', done);
end;
$function$;

CREATE OR REPLACE FUNCTION public.restock_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status in ('pending','paid') and new.status in ('failed','cancelled','refunded') then
    update public.products p set quantity = p.quantity + oi.qty, out_of_stock = false
      from public.order_items oi where oi.order_id = new.id and oi.product_id = p.id and p.quantity is not null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restock_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'pending' then
    update public.products p set quantity = p.quantity + oi.qty, out_of_stock = false
      from public.order_items oi where oi.order_id = old.id and oi.product_id = p.id and p.quantity is not null;
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_product_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    new.hidden := new.status <> 'active';
  elsif new.status is distinct from old.status then
    new.hidden := new.status <> 'active';
  elsif new.hidden is distinct from old.hidden then
    new.status := case when new.hidden then 'draft' else 'active' end;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_order_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at := now(); return new; end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_report(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a text := p->>'action';
  v_from date; v_to date; n int; v_size int; v_page int; v_sort text; v_dir text; o orders; v_id text; v_txt text; v_like text; v_digits text;
begin
  if not is_admin() then raise exception 'unauthorized' using errcode = '42501'; end if;
  v_size := least(greatest(coalesce(nullif(p->>'size', '')::int, 50), 1), 5000);
  v_page := greatest(coalesce(nullif(p->>'page', '')::int, 0), 0);
  v_dir := case when p->>'dir' = 'asc' then 'asc' else 'desc' end;

  if a = 'summary' then
    v_from := (p->>'from')::date; v_to := (p->>'to')::date;
    if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 1100 then raise exception 'bad_range'; end if;
    n := v_to - v_from + 1;
    return jsonb_build_object(
      'from', v_from, 'to', v_to,
      'kpi', ps_kpi(v_from, v_to) || jsonb_build_object('new_customers',
        (select count(*) from (select ps_phone_key(phone) k, min(created_at) f from orders where status = 'paid' group by 1) c
          where (c.f at time zone 'Asia/Jerusalem')::date between v_from and v_to)),
      'prev', ps_kpi(v_from - n, v_from - 1) || jsonb_build_object('from', v_from - n, 'to', v_from - 1),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'revenue', x.revenue, 'paid', x.paid, 'orders', x.orders) order by x.day), '[]')
        from (select d::date::text as day, coalesce(sum(o2.total) filter (where o2.status = 'paid'), 0) revenue,
                count(o2.id) filter (where o2.status = 'paid') paid, count(o2.id) orders
              from generate_series(v_from, v_to, interval '1 day') d
              left join orders o2 on (o2.created_at at time zone 'Asia/Jerusalem')::date = d::date group by d) x),
      'products', (select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue desc, x.qty desc), '[]') from (
        select i.product_id, max(i.title) title, sum(i.qty) qty, sum(i.line_total) revenue, count(distinct o2.id) orders
        from order_items i join orders o2 on o2.id = i.order_id
        where o2.status = 'paid' and (o2.created_at at time zone 'Asia/Jerusalem')::date between v_from and v_to
        group by i.product_id order by revenue desc, qty desc limit 10) x),
      'coupons', (select coalesce(jsonb_agg(to_jsonb(x) order by x.uses desc, x.revenue desc), '[]') from (
        select o2.coupon_code code, count(*) uses, sum(o2.discount) discount, sum(o2.total) revenue
        from orders o2 where o2.status = 'paid' and o2.coupon_code is not null and (o2.created_at at time zone 'Asia/Jerusalem')::date between v_from and v_to
        group by o2.coupon_code order by uses desc, revenue desc limit 8) x),
      'statuses', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
        select o2.status, count(*) n, coalesce(sum(o2.total), 0) total from orders o2
        where (o2.created_at at time zone 'Asia/Jerusalem')::date between v_from and v_to group by o2.status) x),
      'delivery', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
        select o2.delivery, count(*) n from orders o2
        where o2.status = 'paid' and (o2.created_at at time zone 'Asia/Jerusalem')::date between v_from and v_to group by o2.delivery) x),
      'recent', (select coalesce(jsonb_agg(ps_order_row(o2) order by o2.created_at desc), '[]') from (
        select * from orders o3 where (o3.created_at at time zone 'Asia/Jerusalem')::date between v_from and v_to order by o3.created_at desc limit 8) o2));
  end if;

  if a = 'orders' then
    v_sort := coalesce(p->>'sort', 'created_at');
    return (with f as (select * from ps_filter_orders(p)),
      pagef as (select * from f order by
        case when v_sort = 'total' and v_dir = 'asc' then f.total end asc nulls last,
        case when v_sort = 'total' and v_dir = 'desc' then f.total end desc nulls last,
        case when v_sort = 'discount' and v_dir = 'asc' then f.discount end asc nulls last,
        case when v_sort = 'discount' and v_dir = 'desc' then f.discount end desc nulls last,
        case when v_sort = 'paid_at' and v_dir = 'asc' then f.paid_at end asc nulls last,
        case when v_sort = 'paid_at' and v_dir = 'desc' then f.paid_at end desc nulls last,
        case when v_sort = 'number' and v_dir = 'asc' then f.number end asc,
        case when v_sort = 'number' and v_dir = 'desc' then f.number end desc,
        case when v_sort = 'customer_name' and v_dir = 'asc' then f.customer_name end asc,
        case when v_sort = 'customer_name' and v_dir = 'desc' then f.customer_name end desc,
        case when v_sort = 'created_at' and v_dir = 'asc' then f.created_at end asc,
        f.created_at desc
        limit v_size offset v_page * v_size)
      select jsonb_build_object(
        'rows', coalesce((select jsonb_agg(ps_order_row(pf::orders) || case when (p->>'items')::boolean then jsonb_build_object('order_items',
            (select coalesce(jsonb_agg(jsonb_build_object('order_id', i.order_id, 'title', i.title, 'qty', i.qty, 'unit_price', i.unit_price, 'line_total', i.line_total) order by i.id), '[]') from order_items i where i.order_id = pf.id))
            else '{}'::jsonb end) from pagef pf), '[]'),
        'count', (select count(*) from f),
        'sums', (select jsonb_build_object('n', count(*), 'total', coalesce(sum(total), 0), 'paid', coalesce(sum(total) filter (where status = 'paid'), 0),
                  'discount', coalesce(sum(discount), 0), 'with_coupon', count(*) filter (where coupon_code is not null)) from f),
        'page', v_page, 'size', v_size));
  end if;

  if a = 'order' then
    v_id := nullif(p->>'id', '');
    if v_id is not null then select * into o from orders where id::text = v_id;
    else select * into o from orders where number = p->>'number'; end if;
    if not found then return jsonb_build_object('order', null); end if;
    return jsonb_build_object(
      'order', ps_order_row(o) || jsonb_build_object('order_items', (select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'title', i.title,
          'unit_price', i.unit_price, 'qty', i.qty, 'line_total', i.line_total, 'image', (select p.image from products p where p.id = i.product_id)) order by i.id), '[]') from order_items i where i.order_id = o.id)),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'provider', e.provider, 'event_id', e.event_id, 'received_at', e.received_at,
          'status_code', e.payload #>> '{transaction,status_code}',
          'amount', coalesce(e.payload #>> '{transaction,amount}', e.payload ->> 'amount'),
          'card_last4', coalesce(e.payload #>> '{transaction,four_digits}', e.payload #>> '{data,card_information,four_digits}'),
          'payments', coalesce(e.payload #>> '{transaction,number_of_payments}', e.payload #>> '{transaction,payments}'),
          'approval', coalesce(e.payload #>> '{transaction,approval_number}', e.payload #>> '{transaction,voucher_number}')) order by e.received_at), '[]')
        from payment_events e where e.order_number = o.number),
      'customer', (select jsonb_build_object('orders', count(*), 'paid', count(*) filter (where status = 'paid'),
          'spent', coalesce(sum(total) filter (where status = 'paid'), 0), 'first', min(created_at))
        from orders where ps_phone_key(phone) = ps_phone_key(o.phone)));
  end if;

  if a = 'customers' then
    v_sort := coalesce(p->>'sort', 'last');
    v_txt := nullif(trim(coalesce(p->>'q', '')), '');
    if v_txt is not null then
      v_like := '%' || replace(replace(replace(left(v_txt, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
      v_digits := ps_phone_key(v_txt); if length(v_digits) < 3 then v_digits := null; end if;
    end if;
    return (with c as (
        select ps_phone_key(phone) as key,
          (array_agg(customer_name order by created_at desc))[1] as name,
          (array_agg(phone order by created_at desc))[1] as phone,
          (array_agg(email order by created_at desc) filter (where email is not null))[1] as email,
          (array_agg(address order by created_at desc) filter (where delivery = 'shipping' and address is not null))[1] as address,
          count(*) as orders, count(*) filter (where status = 'paid') as paid,
          coalesce(sum(total) filter (where status = 'paid'), 0) as spent,
          coalesce(sum(discount) filter (where status = 'paid'), 0) as saved,
          min(created_at) as first, max(created_at) as last,
          coalesce(array_agg(distinct coupon_code) filter (where coupon_code is not null), '{}') as coupons
        from orders group by 1
        having v_txt is null or bool_or(customer_name ilike v_like or coalesce(email, '') ilike v_like or (v_digits is not null and ps_phone_key(phone) like '%' || v_digits || '%'))),
      pagec as (select * from c order by
        case when v_sort = 'spent' and v_dir = 'asc' then c.spent end asc, case when v_sort = 'spent' and v_dir = 'desc' then c.spent end desc,
        case when v_sort = 'orders' and v_dir = 'asc' then c.orders end asc, case when v_sort = 'orders' and v_dir = 'desc' then c.orders end desc,
        case when v_sort = 'first' and v_dir = 'asc' then c.first end asc, case when v_sort = 'first' and v_dir = 'desc' then c.first end desc,
        case when v_sort = 'name' and v_dir = 'asc' then c.name end asc, case when v_sort = 'name' and v_dir = 'desc' then c.name end desc,
        case when v_sort = 'last' and v_dir = 'asc' then c.last end asc,
        c.last desc limit v_size offset v_page * v_size)
      select jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(pc)) from pagec pc), '[]'),
        'count', (select count(*) from c), 'repeat', (select count(*) from c where paid > 1), 'spent', (select coalesce(sum(spent), 0) from c),
        'page', v_page, 'size', v_size));
  end if;

  if a = 'coupons' then
    return (with r as (
        select o2.coupon_code as code,
          count(*) filter (where o2.status = 'paid') as paid_uses,
          count(*) filter (where o2.status = 'pending') as pending_uses,
          count(*) filter (where o2.status in ('failed', 'cancelled', 'refunded')) as lost_uses,
          coalesce(sum(o2.total) filter (where o2.status = 'paid'), 0) as revenue,
          coalesce(sum(o2.discount) filter (where o2.status = 'paid'), 0) as discount,
          count(distinct ps_phone_key(o2.phone)) filter (where o2.status = 'paid') as customers,
          min(o2.created_at) as first_use, max(o2.created_at) as last_use,
          max(c.type) as type, max(c.value) as value, bool_or(c.active) as active, max(c.max_uses) as max_uses, max(c.uses_count) as uses_count,
          max(c.description) as description, bool_or(c.code is null) as deleted
        from ps_filter_orders(jsonb_build_object('from', p->>'from', 'to', p->>'to', 'coupon', 'any')) o2
        left join coupons c on c.code = o2.coupon_code group by o2.coupon_code)
      select jsonb_build_object(
        'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.paid_uses desc, r.last_use desc) from r), '[]'),
        'totals', (select jsonb_build_object('uses', coalesce(sum(paid_uses), 0), 'revenue', coalesce(sum(revenue), 0), 'discount', coalesce(sum(discount), 0)) from r),
        'unused', (select count(*) from coupons c where c.active and not exists (select 1 from orders o4 where o4.coupon_code = c.code))));
  end if;

  raise exception 'bad action';
end $function$;

-- ---------- triggers ----------
drop trigger if exists products_touch on products;
create trigger products_touch before update on public.products for each row execute function touch_product();
drop trigger if exists products_sync_cats on products;
create trigger products_sync_cats before update on public.products for each row execute function products_sync_cats();
drop trigger if exists products_status_sync on products;
create trigger products_status_sync before insert or update on public.products for each row execute function sync_product_status();
drop trigger if exists coupons_touch on coupons;
create trigger coupons_touch before update on public.coupons for each row execute function touch_product();
drop trigger if exists orders_recover_checkout on orders;
create trigger orders_recover_checkout after insert on public.orders for each row execute function ps_recover_checkout();
drop trigger if exists orders_paid_hook on orders;
create trigger orders_paid_hook after insert or update of status on public.orders for each row execute function ps_order_paid_hook();
drop trigger if exists orders_restock_delete on orders;
create trigger orders_restock_delete before delete on public.orders for each row execute function restock_on_delete();
drop trigger if exists orders_coupon_usage on orders;
create trigger orders_coupon_usage after update of status on public.orders for each row execute function coupon_usage();
drop trigger if exists orders_restock on orders;
create trigger orders_restock after update of status on public.orders for each row execute function restock_on_cancel();
drop trigger if exists orders_paid_at on orders;
create trigger orders_paid_at before update on public.orders for each row execute function touch_order_paid();

-- ---------- defaults ----------
insert into site_settings (key, value) values
  ('content',  '{"topbar":""}'),
  ('shipping', '{"fee":35,"pickup":true,"free_over":499}'),
  ('payment',  '{"enabled":false,"sandbox":false,"provider":"payplus"}')
on conflict (key) do nothing;
insert into integrations (key, value) values ('order_webhook', '{"url":"","enabled":false}') on conflict (key) do nothing;
