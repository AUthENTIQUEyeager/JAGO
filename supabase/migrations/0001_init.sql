-- Jago : schéma (Phase 1). Rejouable sur une base vide.
create schema if not exists private;

-- Modèle des colonnes communes des tables synchronisées (copié par LIKE puis supprimé).
create table private.sync_base (
  id uuid not null,
  shop_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  created_by uuid
);

-- ───────── Plateforme ─────────
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  owner_phone text check (char_length(owner_phone) <= 32),
  status text not null default 'active' check (status in ('active', 'blocked')),
  blocked_reason text check (char_length(blocked_reason) <= 500),
  blocked_at timestamptz,
  block_message text check (char_length(block_message) <= 500),
  currency text not null default 'XOF' check (char_length(currency) = 3),
  timezone text not null default 'Africa/Ouagadougou' check (char_length(timezone) <= 64),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) <= 20000),
  notes_admin text check (char_length(notes_admin) <= 2000),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  pending_count int not null default 0 check (pending_count between 0 and 1000000),
  app_version text check (char_length(app_version) <= 32),
  device_clock_skew_seconds int
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  shop_id uuid not null references public.shops (id),
  role text not null check (role in ('owner', 'manager', 'cashier')),
  full_name text not null check (char_length(full_name) between 1 and 200),
  phone text check (char_length(phone) <= 32),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  terms_accepted_at timestamptz,
  terms_version text check (char_length(terms_version) <= 32),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_shop_idx on public.profiles (shop_id);

create table public.platform_admins (user_id uuid primary key references auth.users (id) on delete cascade);

create table public.platform_settings (
  id int primary key check (id = 1),
  support_phone text not null default '' check (char_length(support_phone) <= 32),
  support_whatsapp text not null default '' check (char_length(support_whatsapp) <= 32),
  terms_version text not null default '1' check (char_length(terms_version) <= 32),
  terms_text text not null default '' check (char_length(terms_text) <= 20000),
  maintenance_message text check (char_length(maintenance_message) <= 500)
);

create table public.audit_log (
  seq bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid(),
  admin_user_id uuid,
  shop_id uuid,
  action text not null check (char_length(action) between 1 and 100),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 20000),
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  prev_hash text,
  hash text
);
create index audit_log_shop_idx on public.audit_log (shop_id, seq desc);

create table private.rate_limit_events (
  key text not null,
  at timestamptz not null default clock_timestamp()
);
create index rate_limit_events_idx on private.rate_limit_events (key, at);

-- ───────── Données métier synchronisées ─────────
create table public.categories (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  name text not null check (char_length(name) between 1 and 200)
);

create table public.suppliers (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  name text not null check (char_length(name) between 1 and 200),
  phone text check (char_length(phone) <= 32),
  note text check (char_length(note) <= 1000)
);

create table public.customers (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  name text not null check (char_length(name) between 1 and 200),
  phone text check (char_length(phone) <= 32),
  address text check (char_length(address) <= 300),
  note text check (char_length(note) <= 1000),
  credit_limit bigint check (credit_limit between 0 and 1000000000000)
);

create table public.products (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  name text not null check (char_length(name) between 1 and 200),
  kind text not null default 'product' check (kind in ('product', 'service')),
  barcode text check (char_length(barcode) <= 64),
  sku text check (char_length(sku) <= 64),
  category_id uuid references public.categories (id),
  unit text not null default 'pièce' check (char_length(unit) between 1 and 32),
  sale_price bigint not null check (sale_price between 0 and 1000000000000),
  wholesale_price bigint check (wholesale_price between 0 and 1000000000000),
  track_stock boolean not null default true,
  low_stock_threshold numeric(14, 3) not null default 0 check (low_stock_threshold between 0 and 1000000),
  is_active boolean not null default true
);

-- D-SEC-1 : le prix d'achat est lisible uniquement par owner/manager (id = id du produit).
create table public.product_costs (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  foreign key (id) references public.products (id),
  cost_price bigint not null check (cost_price between 0 and 1000000000000)
);

create table public.sales (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  receipt_no text not null check (char_length(receipt_no) between 1 and 64),
  customer_id uuid references public.customers (id),
  subtotal bigint not null check (subtotal between 0 and 1000000000000),
  discount bigint not null default 0 check (discount between 0 and 1000000000000),
  total bigint not null check (total between 0 and 1000000000000),
  paid_total bigint not null check (paid_total between 0 and 1000000000000),
  credit_amount bigint not null default 0 check (credit_amount between 0 and 1000000000000),
  status text not null default 'completed' check (status in ('completed', 'voided')),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (char_length(void_reason) <= 500),
  note text check (char_length(note) <= 500),
  override boolean not null default false,
  device_id text check (char_length(device_id) <= 64),
  fiscal jsonb check (pg_column_size(fiscal) <= 20000),
  constraint sales_total_chk check (total = subtotal - discount),
  constraint sales_credit_chk check (credit_amount = total - paid_total),
  constraint sales_credit_customer_chk check (credit_amount = 0 or customer_id is not null)
);

create table public.sale_items (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  sale_id uuid not null references public.sales (id),
  product_id uuid not null references public.products (id),
  name_snapshot text not null check (char_length(name_snapshot) between 1 and 200),
  qty numeric(14, 3) not null check (qty > 0 and qty <= 1000000),
  unit_price bigint not null check (unit_price between 0 and 1000000000000),
  list_price_snapshot bigint check (list_price_snapshot between 0 and 1000000000000),
  cost_snapshot bigint check (cost_snapshot between 0 and 1000000000000),
  line_discount bigint not null default 0 check (line_discount between 0 and 1000000000000),
  line_total bigint not null check (line_total between 0 and 1000000000000)
);

create table public.sale_payments (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  sale_id uuid not null references public.sales (id),
  method text not null check (method in ('cash', 'orange_money', 'moov_money', 'wave', 'other')),
  amount bigint not null check (amount between 1 and 1000000000000)
);

create table public.stock_movements (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  product_id uuid not null references public.products (id),
  type text not null check (type in ('opening', 'purchase', 'sale', 'sale_void', 'return_in', 'adjustment', 'loss')),
  qty numeric(14, 3) not null check (qty <> 0 and abs(qty) <= 1000000),
  unit_cost bigint check (unit_cost between 0 and 1000000000000),
  supplier_id uuid references public.suppliers (id),
  sale_id uuid references public.sales (id),
  note text check (char_length(note) <= 500),
  device_id text check (char_length(device_id) <= 64)
);

create table public.customer_ledger (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  customer_id uuid not null references public.customers (id),
  type text not null check (type in ('credit_sale', 'payment', 'adjustment')),
  amount bigint not null check (amount <> 0 and abs(amount) <= 1000000000000),
  method text check (method in ('cash', 'orange_money', 'moov_money', 'wave', 'other')),
  sale_id uuid references public.sales (id),
  note text check (char_length(note) <= 500),
  device_id text check (char_length(device_id) <= 64)
);

create table public.expenses (
  like private.sync_base including defaults,
  primary key (id),
  foreign key (shop_id) references public.shops (id),
  label text not null check (char_length(label) between 1 and 200),
  category text check (char_length(category) <= 100),
  amount bigint not null check (amount between 1 and 1000000000000),
  expense_date date not null
);

-- Index du curseur de pull + clés étrangères fréquentes
do $$
declare t text;
begin
  foreach t in array array['categories','suppliers','customers','products','product_costs','sales','sale_items','sale_payments','stock_movements','customer_ledger','expenses'] loop
    execute format('create index %I on public.%I (shop_id, server_updated_at, id)', t || '_pull_idx', t);
  end loop;
end $$;
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_payments_sale_idx on public.sale_payments (sale_id);
create index stock_movements_product_idx on public.stock_movements (product_id);
create index customer_ledger_customer_idx on public.customer_ledger (customer_id);

drop table private.sync_base;
