-- Jago : verrouillage par défaut, droits minimaux, RLS forcée (Phase 1).

-- 1) Tout est refusé d'abord (même si Supabase accorde des droits par défaut)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
-- Seules les fonctions utilisées par les policies sont exécutables par un utilisateur connecté.
grant execute on function private.current_shop_id(), private.current_user_role(), private.shop_is_active(uuid),
  private.active_shop_id(), private.active_role() to authenticated;

-- 2) RLS activée ET forcée sur toutes les tables
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('public', 'private') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format('alter table %I.%I force row level security', t.schemaname, t.tablename);
  end loop;
end $$;

-- 3) Droits minimaux (jamais de DELETE ; anon n'a accès à rien)
grant select (id, name, owner_phone, status, block_message, currency, timezone, settings, created_at)
  on public.shops to authenticated;
grant select on public.profiles, public.platform_settings to authenticated;
grant select, insert, update on public.categories, public.suppliers, public.customers, public.products,
  public.product_costs, public.sales, public.expenses to authenticated;
grant select, insert on public.sale_items, public.sale_payments, public.stock_movements, public.customer_ledger to authenticated;

grant execute on function public.touch_shop(int, text, timestamptz), public.accept_terms(text),
  public.complete_password_change(), public.server_now(), public.update_shop_settings(text, jsonb) to authenticated;
grant execute on function public.admin_overview(), public.admin_audit_sale_consistency(uuid), public.rate_limit_hit(text, int, int),
  public.admin_create_shop(uuid, text, text, text, text), public.admin_shop_stats(uuid), public.admin_shop_sales(uuid, int),
  public.admin_verify_audit_chain() to service_role;

alter role authenticated set statement_timeout = '8s';

-- 4) Policies (toutes TO authenticated)
create policy shops_select_own on public.shops for select to authenticated
  using (id = (select private.current_shop_id()));            -- visible même si bloquée (écran de blocage)
create policy profiles_select_shop on public.profiles for select to authenticated
  using (shop_id = (select private.current_shop_id()));
create policy platform_settings_select on public.platform_settings for select to authenticated using (true);

do $$
declare t text;
begin
  -- Lecture : toute la boutique active
  foreach t in array array['categories','suppliers','customers','products','sales','sale_items','sale_payments',
                           'stock_movements','customer_ledger','expenses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (shop_id = (select private.active_shop_id()))', t || '_select', t);
  end loop;
  -- Écriture réservée aux owner/manager
  foreach t in array array['categories','suppliers','products','expenses'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (shop_id = (select private.active_shop_id()) and (select private.active_role()) in (''owner'',''manager''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (shop_id = (select private.active_shop_id()) and (select private.active_role()) in (''owner'',''manager'')) with check (shop_id = (select private.active_shop_id()) and (select private.active_role()) in (''owner'',''manager''))', t || '_update', t);
  end loop;
  -- Lignes de vente et paiements : tous les rôles peuvent ajouter
  foreach t in array array['sale_items','sale_payments'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (shop_id = (select private.active_shop_id()))', t || '_insert', t);
  end loop;
end $$;

-- Prix d'achat : owner/manager uniquement (lecture et écriture)
create policy product_costs_select on public.product_costs for select to authenticated
  using (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'));
create policy product_costs_insert on public.product_costs for insert to authenticated
  with check (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'));
create policy product_costs_update on public.product_costs for update to authenticated
  using (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'))
  with check (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'));

-- Clients : le caissier peut créer, pas modifier
create policy customers_insert on public.customers for insert to authenticated
  with check (shop_id = (select private.active_shop_id()));
create policy customers_update on public.customers for update to authenticated
  using (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'))
  with check (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'));

-- Ventes : le caissier crée des ventes « completed » ; seuls owner/manager modifient (annulation)
create policy sales_insert on public.sales for insert to authenticated
  with check (shop_id = (select private.active_shop_id())
              and (status = 'completed' or (select private.active_role()) in ('owner', 'manager')));
create policy sales_update on public.sales for update to authenticated
  using (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'))
  with check (shop_id = (select private.active_shop_id()) and (select private.active_role()) in ('owner', 'manager'));

-- Stock : le caissier n'écrit que des mouvements « sale »
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (shop_id = (select private.active_shop_id())
              and ((select private.active_role()) in ('owner', 'manager') or type = 'sale'));

-- Carnet client : le caissier n'écrit que « credit_sale » et « payment »
create policy customer_ledger_insert on public.customer_ledger for insert to authenticated
  with check (shop_id = (select private.active_shop_id())
              and ((select private.active_role()) in ('owner', 'manager') or type in ('credit_sale', 'payment')));
-- audit_log, platform_admins, private.rate_limit_events : aucune policy, aucun droit = inaccessibles aux clients.
