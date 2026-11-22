-- Protein Stock — PostgreSQL schema (moved off Supabase).
-- Works on any PostgreSQL 14+ (Neon, Vercel Postgres, RDS, self-hosted).
-- Access control lives in the API (/api/*): the database is never exposed to the browser.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists products (
  id           text primary key,
  title        text not null,
  price        numeric not null check (price >= 0),
  old_price    numeric not null default 0 check (old_price >= 0),
  out_of_stock boolean not null default false,
  hidden       boolean not null default false,
  description  text not null default '',
  vendor       text,
  category     text,
  tags         text[] not null default '{}',
  image        text,
  quantity     integer check (quantity is null or quantity >= 0),
  sku          text,
  status       text not null default 'active' check (status in ('active','draft','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists site_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  number           text not null unique,
  status           text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
  customer_name    text not null,
  phone            text not null,
  email            text,
  address          text,
  notes            text,
  subtotal         numeric not null check (subtotal >= 0),
  shipping         numeric not null default 0 check (shipping >= 0),
  total            numeric not null check (total >= 0),
  currency         text not null default 'ILS',
  payment_provider text,
  payment_ref      text,
  paid_at          timestamptz,
  ip_hash          text,
  delivery         text not null default 'shipping' check (delivery in ('shipping','pickup')),
  created_at       timestamptz not null default now()
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_ip_idx      on orders (ip_hash, created_at desc);
create index if not exists orders_status_idx  on orders (status);

create table if not exists order_items (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references orders(id) on delete cascade,
  product_id text not null,
  title      text not null,
  unit_price numeric not null,
  qty        integer not null check (qty > 0 and qty <= 50),
  line_total numeric not null
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists payment_events (
  id           bigint generated always as identity primary key,
  provider     text not null,
  event_id     text not null,
  order_number text,
  payload      jsonb,
  received_at  timestamptz not null default now(),
  unique (provider, event_id)
);

create table if not exists admins (
  email    text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

create table if not exists admin_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  admin_email text not null,
  kind        text not null check (kind in ('prompt','change','dev_request')),
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists admin_log_at_idx    on admin_log (at desc);
create index if not exists admin_log_email_idx on admin_log (admin_email, kind, at desc);

-- One-time login codes for the admin panel (replaces Supabase Auth).
create table if not exists admin_otps (
  id         bigint generated always as identity primary key,
  email      text not null,
  code_hash  text not null,
  attempts   integer not null default 0,
  used       boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists admin_otps_email_idx on admin_otps (email, created_at desc);

-- ---------- functions & triggers (same behaviour as on Supabase) ----------

create or replace function reserve_stock(p_items jsonb) returns jsonb language plpgsql as $$
declare it jsonb; pid text; q int; r int; failed jsonb := '[]'::jsonb; done jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    pid := it->>'id'; q := (it->>'qty')::int;
    update products set quantity = quantity - q, out_of_stock = (quantity - q) <= 0
      where id = pid and quantity is not null and quantity >= q;
    get diagnostics r = row_count;
    if r = 1 then done := done || jsonb_build_array(it);
    elsif exists (select 1 from products where id = pid and quantity is not null) then failed := failed || to_jsonb(pid);
    end if;
  end loop;
  if jsonb_array_length(failed) > 0 then
    for it in select * from jsonb_array_elements(done) loop
      update products set quantity = quantity + (it->>'qty')::int, out_of_stock = false where id = it->>'id';
    end loop;
    done := '[]'::jsonb;
  end if;
  return jsonb_build_object('failed', failed, 'reserved', done);
end; $$;

create or replace function release_stock(p_items jsonb) returns void language plpgsql as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    update products set quantity = quantity + (it->>'qty')::int, out_of_stock = false
      where id = it->>'id' and quantity is not null;
  end loop;
end; $$;

create or replace function mark_order_paid(p_number text, p_provider text, p_event_id text, p_ref text, p_amount numeric, p_payload jsonb)
returns text language plpgsql as $$
declare o orders%rowtype; inserted int;
begin
  insert into payment_events (provider, event_id, order_number, payload)
  values (p_provider, p_event_id, p_number, p_payload)
  on conflict (provider, event_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'duplicate'; end if;

  select * into o from orders where number = p_number for update;
  if not found then return 'order_not_found'; end if;
  if o.status = 'paid' then return 'already_paid'; end if;
  if o.status <> 'pending' then return 'not_payable'; end if;
  if p_amount is null or round(p_amount, 2) <> o.total then return 'amount_mismatch'; end if;

  update orders set status = 'paid', paid_at = now(), payment_provider = p_provider, payment_ref = p_ref where id = o.id;
  return 'paid';
end; $$;

create or replace function restock_on_cancel() returns trigger language plpgsql as $$
begin
  if old.status in ('pending','paid') and new.status in ('failed','cancelled','refunded') then
    update products p set quantity = p.quantity + oi.qty, out_of_stock = false
      from order_items oi where oi.order_id = new.id and oi.product_id = p.id and p.quantity is not null;
  end if;
  return new;
end; $$;

create or replace function touch_product() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create or replace function sync_product_status() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.hidden := new.status <> 'active';
  elsif new.status is distinct from old.status then
    new.hidden := new.status <> 'active';
  elsif new.hidden is distinct from old.hidden then
    new.status := case when new.hidden then 'draft' else 'active' end;
  end if;
  return new;
end; $$;

create or replace function touch_order_paid() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end; $$;

drop trigger if exists products_touch on products;
create trigger products_touch before update on products for each row execute function touch_product();
drop trigger if exists products_status_sync on products;
create trigger products_status_sync before insert or update on products for each row execute function sync_product_status();
drop trigger if exists orders_paid_at on orders;
create trigger orders_paid_at before update on orders for each row execute function touch_order_paid();
drop trigger if exists orders_restock on orders;
create trigger orders_restock after update of status on orders for each row execute function restock_on_cancel();

insert into site_settings (key, value) values
  ('content',  '{"topbar":""}'),
  ('shipping', '{"fee":35,"pickup":true,"free_over":499}'),
  ('payment',  '{"enabled":false,"sandbox":false,"provider":"payplus"}')
on conflict (key) do nothing;
