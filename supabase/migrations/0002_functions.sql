-- Jago : fonctions d'autorisation, triggers de sécurité, RPC (Phase 1).
-- Toutes les fonctions SECURITY DEFINER fixent search_path = '' et qualifient leurs noms.

-- ───────── Aides d'autorisation (schéma private, non exposé par l'API) ─────────
create function private.current_shop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.shop_id from public.profiles p where p.user_id = auth.uid() and p.is_active
$$;

create function private.current_user_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.is_active
$$;

create function private.shop_is_active(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shops s where s.id = p_shop and s.status = 'active')
$$;

-- Boutique de l'utilisateur seulement si son profil ET sa boutique sont actifs (sinon NULL = tout refusé).
create function private.active_shop_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.shop_id from public.profiles p join public.shops s on s.id = p.shop_id
  where p.user_id = auth.uid() and p.is_active and s.status = 'active'
$$;

create function private.active_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p join public.shops s on s.id = p.shop_id
  where p.user_id = auth.uid() and p.is_active and s.status = 'active'
$$;

-- ───────── Triggers ─────────
-- Anti-usurpation, horloge serveur, « dernière modification gagne », colonnes immuables.
create function private.tg_sync_common() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_shop uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      v_shop := private.current_shop_id();
      if v_shop is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
      if new.shop_id is not null and new.shop_id <> v_shop then
        raise exception 'Boutique incorrecte' using errcode = '42501';
      end if;
      new.shop_id := v_shop;
      new.created_by := auth.uid();
    end if;
    new.server_updated_at := clock_timestamp();
    return new;
  end if;
  if new.updated_at < old.updated_at then return old; end if;
  if new.id <> old.id or new.shop_id <> old.shop_id or new.created_at <> old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Colonne non modifiable' using errcode = '23514';
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

create function private.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Table en ajout seulement : % interdit', tg_op using errcode = '23001';
end $$;

create function private.tg_sales_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_free text[] := array['status','voided_at','voided_by','void_reason','note','updated_at','server_updated_at','deleted_at'];
begin
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Colonne de vente non modifiable' using errcode = '23514';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'Une vente annulée ne peut pas être rétablie' using errcode = '23514';
  end if;
  if new.status = 'voided' and old.status <> 'voided' and auth.uid() is not null then
    new.voided_by := auth.uid();
    new.voided_at := coalesce(new.voided_at, now());
  end if;
  return new;
end $$;

-- Le prix d'achat vient toujours du serveur pour un caissier (il ne le connaît pas).
create function private.tg_sale_item_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cost_snapshot is null or (auth.uid() is not null and private.current_user_role() = 'cashier') then
    select c.cost_price into new.cost_snapshot from public.product_costs c where c.id = new.product_id;
  end if;
  return new;
end $$;

-- Interdit de désactiver ou rétrograder le dernier propriétaire actif d'une boutique.
create function private.tg_last_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active)
     and not exists (select 1 from public.profiles p where p.shop_id = old.shop_id and p.role = 'owner'
                     and p.is_active and p.user_id <> old.user_id) then
    raise exception 'Impossible : dernier propriétaire de la boutique' using errcode = '23514';
  end if;
  return new;
end $$;

-- Journal d'audit chaîné par hachage (toute altération est détectable).
create function private.audit_row_hash(p_prev text, p_id uuid, p_admin uuid, p_shop uuid, p_action text,
                                       p_details jsonb, p_reason text, p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(
    coalesce(p_prev, '') || '|' || p_id::text || '|' || coalesce(p_admin::text, '') || '|' ||
    coalesce(p_shop::text, '') || '|' || p_action || '|' || p_details::text || '|' || coalesce(p_reason, '') || '|' ||
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex')
$$;

create function private.tg_audit_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7355608);
  select a.hash into new.prev_hash from public.audit_log a order by a.seq desc limit 1;
  new.hash := private.audit_row_hash(new.prev_hash, new.id, new.admin_user_id, new.shop_id, new.action,
                                     new.details, new.reason, new.created_at);
  return new;
end $$;

create function private.verify_audit_chain() returns bigint
language plpgsql stable set search_path = '' as $$
declare r record; v_prev text := null;
begin
  for r in select * from public.audit_log order by seq loop
    if r.prev_hash is distinct from v_prev
       or r.hash is distinct from private.audit_row_hash(r.prev_hash, r.id, r.admin_user_id, r.shop_id,
                                                         r.action, r.details, r.reason, r.created_at) then
      return r.seq;
    end if;
    v_prev := r.hash;
  end loop;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','suppliers','customers','products','product_costs','sales',
                           'sale_items','sale_payments','stock_movements','customer_ledger','expenses'] loop
    execute format('create trigger a_sync before insert or update on public.%I for each row execute function private.tg_sync_common()', t);
  end loop;
  foreach t in array array['sale_items','sale_payments','stock_movements','customer_ledger','audit_log'] loop
    execute format('create trigger z_append_only before update or delete on public.%I for each row execute function private.tg_append_only()', t);
    execute format('create trigger z_append_only_trunc before truncate on public.%I for each statement execute function private.tg_append_only()', t);
  end loop;
end $$;
create trigger b_sales_guard before update on public.sales for each row execute function private.tg_sales_guard();
create trigger b_cost before insert on public.sale_items for each row execute function private.tg_sale_item_cost();
create trigger a_last_owner before update on public.profiles for each row execute function private.tg_last_owner();
create trigger a_chain before insert on public.audit_log for each row execute function private.tg_audit_chain();

-- ───────── RPC appelables par un utilisateur connecté ─────────
create function public.touch_shop(p_pending int, p_app_version text, p_client_time timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shop uuid := private.current_shop_id();
begin
  if v_shop is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if p_pending is null or p_pending < 0 or p_pending > 1000000 then
    raise exception 'p_pending invalide' using errcode = '22023';
  end if;
  if p_app_version is not null and char_length(p_app_version) > 32 then
    raise exception 'p_app_version trop long' using errcode = '22023';
  end if;
  update public.shops set last_seen_at = now(), pending_count = p_pending, app_version = p_app_version,
    device_clock_skew_seconds = case when p_client_time is null then null
      else greatest(-31536000, least(31536000, extract(epoch from (p_client_time - now()))::int)) end
  where id = v_shop;
  update public.profiles set last_seen_at = now() where user_id = auth.uid();
end $$;

create function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_shop_id() is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if p_version is null or char_length(p_version) not between 1 and 32 then
    raise exception 'Version invalide' using errcode = '22023';
  end if;
  update public.profiles set terms_accepted_at = now(), terms_version = p_version where user_id = auth.uid();
end $$;

create function public.complete_password_change() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_shop_id() is null then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.profiles set must_change_password = false where user_id = auth.uid();
end $$;

create function public.server_now() returns timestamptz
language sql stable security definer set search_path = '' as $$ select now() $$;

create function public.update_shop_settings(p_name text, p_settings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.active_role() is distinct from 'owner' then
    raise exception 'Réservé au propriétaire' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Nom invalide' using errcode = '22023';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or pg_column_size(p_settings) > 20000 then
    raise exception 'Réglages invalides' using errcode = '22023';
  end if;
  update public.shops set name = btrim(p_name), settings = p_settings where id = private.active_shop_id();
end $$;

-- ───────── Fonctions d'administration (clé service uniquement, via /api) ─────────
create function private.admin_overview() returns table (
  shop_id uuid, name text, owner_phone text, status text, created_at timestamptz, last_seen_at timestamptz,
  pending_count int, app_version text, device_clock_skew_seconds int, sales_today bigint, sales_count_today bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.owner_phone, s.status, s.created_at, s.last_seen_at, s.pending_count, s.app_version,
         s.device_clock_skew_seconds, coalesce(x.total, 0)::bigint, coalesce(x.cnt, 0)::bigint
  from public.shops s
  left join lateral (
    select sum(sa.total) as total, count(*) as cnt from public.sales sa
    where sa.shop_id = s.id and sa.status = 'completed'
      and sa.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
  ) x on true
  order by s.created_at desc
$$;

create function private.audit_sale_consistency(p_shop uuid, p_min_age interval default '1 hour')
returns table (sale_id uuid, receipt_no text, problem text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.receipt_no, 'La somme des lignes ne correspond pas au sous-total'::text
  from public.sales s where s.shop_id = p_shop and s.status = 'completed' and s.created_at < now() - p_min_age
    and s.subtotal <> (select coalesce(sum(i.line_total), 0) from public.sale_items i where i.sale_id = s.id)
  union all
  select s.id, s.receipt_no, 'La somme des paiements ne correspond pas au total payé'
  from public.sales s where s.shop_id = p_shop and s.status = 'completed' and s.created_at < now() - p_min_age
    and s.paid_total <> (select coalesce(sum(p.amount), 0) from public.sale_payments p where p.sale_id = s.id)
  union all
  select s.id, s.receipt_no, 'Le crédit de la vente ne correspond pas au carnet du client'
  from public.sales s where s.shop_id = p_shop and s.status = 'completed' and s.created_at < now() - p_min_age
    and s.credit_amount <> (select coalesce(sum(l.amount), 0) from public.customer_ledger l
                            where l.sale_id = s.id and l.type = 'credit_sale')
$$;

create function private.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or char_length(p_key) > 200 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from private.rate_limit_events where at < clock_timestamp() - interval '1 day';
  delete from private.rate_limit_events where key = p_key and at < clock_timestamp() - make_interval(secs => p_window_seconds);
  if (select count(*) from private.rate_limit_events where key = p_key) >= p_limit then return false; end if;
  insert into private.rate_limit_events (key) values (p_key);
  return true;
end $$;

-- Création atomique boutique + propriétaire (appelée par /api après createUser).
create function private.admin_create_shop(p_user_id uuid, p_shop_name text, p_owner_name text, p_phone text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shop uuid;
begin
  insert into public.shops (name, owner_phone, notes_admin) values (p_shop_name, p_phone, p_notes) returning id into v_shop;
  insert into public.profiles (user_id, shop_id, role, full_name, phone) values (p_user_id, v_shop, 'owner', p_owner_name, p_phone);
  return v_shop;
end $$;

create function private.admin_shop_stats(p_shop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'revenue_30d', coalesce((select sum(total) from public.sales where shop_id = p_shop and status = 'completed' and created_at > now() - interval '30 days'), 0),
    'sales_count_30d', (select count(*) from public.sales where shop_id = p_shop and status = 'completed' and created_at > now() - interval '30 days'),
    'last_sale_at', (select max(created_at) from public.sales where shop_id = p_shop),
    'staff_count', (select count(*) from public.profiles where shop_id = p_shop and is_active),
    'anomalies_count', (select count(*) from private.audit_sale_consistency(p_shop)))
$$;

create function private.admin_shop_sales(p_shop uuid, p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select id, receipt_no, created_at, total, paid_total, credit_amount, status, created_by
    from public.sales where shop_id = p_shop order by created_at desc limit greatest(1, least(p_limit, 200))) x
$$;

-- Enveloppes publiques (le schéma private n'est pas exposé) : droits accordés au seul service_role en 0003.
create function public.admin_overview() returns table (
  shop_id uuid, name text, owner_phone text, status text, created_at timestamptz, last_seen_at timestamptz,
  pending_count int, app_version text, device_clock_skew_seconds int, sales_today bigint, sales_count_today bigint)
language sql stable security definer set search_path = '' as $$ select * from private.admin_overview() $$;
create function public.admin_audit_sale_consistency(p_shop uuid) returns table (sale_id uuid, receipt_no text, problem text)
language sql stable security definer set search_path = '' as $$ select * from private.audit_sale_consistency(p_shop) $$;
create function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language sql security definer set search_path = '' as $$ select private.rate_limit_hit(p_key, p_limit, p_window_seconds) $$;
create function public.admin_create_shop(p_user_id uuid, p_shop_name text, p_owner_name text, p_phone text, p_notes text) returns uuid
language sql security definer set search_path = '' as $$ select private.admin_create_shop(p_user_id, p_shop_name, p_owner_name, p_phone, p_notes) $$;
create function public.admin_shop_stats(p_shop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.admin_shop_stats(p_shop) $$;
create function public.admin_shop_sales(p_shop uuid, p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.admin_shop_sales(p_shop, p_limit) $$;
create function public.admin_verify_audit_chain() returns bigint
language sql stable security definer set search_path = '' as $$ select private.verify_audit_chain() $$;
