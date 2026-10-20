// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { as, BUSINESS_TABLES, count, errorCode, ID, makeDb, seedWorld } from './harness'

let db: PGlite
const q = (sql: string) => db.query(sql)

beforeAll(async () => {
  db = await makeDb()
  await seedWorld(db)
}, 120_000)

describe('1. RLS activée et forcée', () => {
  it('toutes les tables de public et private', async () => {
    const { rows } = await db.query<{
      relname: string
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','private') and c.relkind = 'r'`,
    )
    expect(rows.length).toBeGreaterThanOrEqual(17)
    expect(rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity)).toEqual([])
  })
})

describe('2. anon n’a accès à rien', () => {
  it('ni lecture, ni écriture, ni fonction', async () => {
    for (const t of [
      ...BUSINESS_TABLES,
      'shops',
      'profiles',
      'platform_settings',
      'audit_log',
      'platform_admins',
    ]) {
      expect(await as(db, null, () => errorCode(q(`select * from public.${t}`)), 'anon'), t).toBe(
        '42501',
      )
    }
    expect(
      await as(
        db,
        null,
        () =>
          errorCode(q(`insert into public.categories (id, name) values (gen_random_uuid(), 'x')`)),
        'anon',
      ),
    ).toBe('42501')
    expect(
      await as(db, null, () => errorCode(q(`select public.touch_shop(0, '1', now())`)), 'anon'),
    ).toBe('42501')
    expect(await as(db, null, () => errorCode(q(`select public.server_now()`)), 'anon')).toBe(
      '42501',
    )
  })
})

describe('3. aucun accès inter-boutiques', () => {
  it('un utilisateur de A ne voit aucune ligne de B (toutes les tables)', async () => {
    for (const t of BUSINESS_TABLES) {
      expect(
        await count(db, `select 1 from public.${t} where shop_id = '${ID.shopB}'`),
        `${t} (admin)`,
      ).toBeGreaterThan(0)
      const seen = await as(db, ID.ownerA, () =>
        count(db, `select 1 from public.${t} where shop_id = '${ID.shopB}'`),
      )
      expect(seen, t).toBe(0)
    }
    expect(
      await as(db, ID.ownerA, () =>
        count(db, `select 1 from public.shops where id = '${ID.shopB}'`),
      ),
    ).toBe(0)
    expect(
      await as(db, ID.ownerA, () =>
        count(db, `select 1 from public.profiles where shop_id = '${ID.shopB}'`),
      ),
    ).toBe(0)
  })

  it('ne peut ni insérer ni modifier chez B', async () => {
    const insert = `insert into public.products (id, shop_id, name, sale_price) values (gen_random_uuid(), '${ID.shopB}', 'Pirate', 1)`
    expect(await as(db, ID.ownerA, () => errorCode(q(insert)))).toBe('42501')
    const res = await as(db, ID.ownerA, () =>
      q(`update public.products set name = 'Piraté' where id = '${ID.prodB}'`),
    )
    expect(res.affectedRows).toBe(0)
    expect(
      await as(db, ID.ownerA, () =>
        errorCode(q(`delete from public.products where id = '${ID.prodA}'`)),
      ),
    ).toBe('42501')
  })
})

describe('4. anti-usurpation', () => {
  it('shop_id et created_by sont imposés par le serveur', async () => {
    const id = '21000000-0000-4000-8000-000000000001'
    await as(db, ID.managerA, () =>
      q(
        `insert into public.products (id, shop_id, created_by, name, sale_price) values ('${id}', null, '${ID.ownerB}', 'Test', 10)`,
      ),
    )
    const { rows } = await db.query<{ shop_id: string; created_by: string }>(
      `select shop_id, created_by from public.products where id = '${id}'`,
    )
    expect(rows[0]).toEqual({ shop_id: ID.shopA, created_by: ID.managerA })
  })
})

describe('5. droits du caissier', () => {
  const saleId = '41000000-0000-4000-8000-000000000001'
  it('ne modifie pas les produits, ne lit pas les prix d’achat, ne crée pas de dépense', async () => {
    expect(
      (
        await as(db, ID.cashierA, () =>
          q(`update public.products set sale_price = 1 where id = '${ID.prodA}'`),
        )
      ).affectedRows,
    ).toBe(0)
    expect(await as(db, ID.cashierA, () => count(db, `select 1 from public.product_costs`))).toBe(0)
    expect(
      await as(db, ID.cashierA, () =>
        errorCode(
          q(
            `insert into public.expenses (id, label, amount, expense_date) values (gen_random_uuid(), 'x', 5, current_date)`,
          ),
        ),
      ),
    ).toBe('42501')
    expect(
      await as(db, ID.cashierA, () =>
        errorCode(q(`insert into public.product_costs (id, cost_price) values ('${ID.prodA}', 1)`)),
      ),
    ).toBe('42501')
  })
  it('crée une vente, avec prix d’achat imposé par le serveur', async () => {
    await as(db, ID.cashierA, async () => {
      await q(
        `insert into public.sales (id, receipt_no, subtotal, total, paid_total) values ('${saleId}', 'R-1', 1000, 1000, 1000)`,
      )
      await q(`insert into public.sale_items (id, sale_id, product_id, name_snapshot, qty, unit_price, cost_snapshot, line_total)
               values (gen_random_uuid(), '${saleId}', '${ID.prodA}', 'Riz', 1, 1000, 1, 1000)`)
      await q(
        `insert into public.sale_payments (id, sale_id, method, amount) values (gen_random_uuid(), '${saleId}', 'cash', 1000)`,
      )
      await q(
        `insert into public.stock_movements (id, product_id, type, qty, sale_id) values (gen_random_uuid(), '${ID.prodA}', 'sale', -1, '${saleId}')`,
      )
    })
    const { rows } = await db.query<{ cost_snapshot: string }>(
      `select cost_snapshot from public.sale_items where sale_id = '${saleId}'`,
    )
    expect(Number(rows[0]?.cost_snapshot)).toBe(600)
  })
  it('ne peut écrire que des mouvements « sale » et certaines écritures de crédit', async () => {
    const mv = (type: string) =>
      `insert into public.stock_movements (id, product_id, type, qty) values (gen_random_uuid(), '${ID.prodA}', '${type}', 1)`
    expect(await as(db, ID.cashierA, () => errorCode(q(mv('adjustment'))))).toBe('42501')
    expect(await as(db, ID.cashierA, () => errorCode(q(mv('sale'))))).toBeNull()
    const led = (type: string) =>
      `insert into public.customer_ledger (id, customer_id, type, amount) values (gen_random_uuid(), '${ID.custA}', '${type}', 5)`
    expect(await as(db, ID.cashierA, () => errorCode(q(led('adjustment'))))).toBe('42501')
    expect(await as(db, ID.cashierA, () => errorCode(q(led('payment'))))).toBeNull()
  })
  it('crée un client mais ne le modifie pas ; n’annule pas une vente', async () => {
    expect(
      await as(db, ID.cashierA, () =>
        errorCode(
          q(`insert into public.customers (id, name) values (gen_random_uuid(), 'Nouveau')`),
        ),
      ),
    ).toBeNull()
    expect(
      (
        await as(db, ID.cashierA, () =>
          q(`update public.customers set name = 'X' where id = '${ID.custA}'`),
        )
      ).affectedRows,
    ).toBe(0)
    expect(
      (
        await as(db, ID.cashierA, () =>
          q(`update public.sales set status = 'voided' where id = '${saleId}'`),
        )
      ).affectedRows,
    ).toBe(0)
  })
})

describe('6. tables en ajout seulement', () => {
  it('rejettent UPDATE, DELETE et TRUNCATE, même pour la clé service', async () => {
    for (const t of ['stock_movements', 'customer_ledger', 'sale_items', 'sale_payments']) {
      expect(await errorCode(q(`update public.${t} set updated_at = now()`)), `update ${t}`).toBe(
        '23001',
      )
      expect(await errorCode(q(`delete from public.${t}`)), `delete ${t}`).toBe('23001')
      expect(await errorCode(q(`truncate public.${t} cascade`)), `truncate ${t}`).toBe('23001')
    }
  })
})

describe('7. boutique bloquée', () => {
  it('refuse lecture et écriture, sauf sa propre ligne shops et touch_shop', async () => {
    await q(
      `update public.shops set status = 'blocked', block_message = 'Payez' where id = '${ID.shopA}'`,
    )
    expect(await as(db, ID.ownerA, () => count(db, 'select 1 from public.products'))).toBe(0)
    expect(
      await as(db, ID.ownerA, () =>
        errorCode(
          q(
            `insert into public.products (id, name, sale_price) values (gen_random_uuid(), 'X', 1)`,
          ),
        ),
      ),
    ).toBe('42501')
    expect(
      await as(db, ID.cashierA, () =>
        errorCode(
          q(
            `insert into public.sales (id, receipt_no, subtotal, total, paid_total) values (gen_random_uuid(), 'R', 1, 1, 1)`,
          ),
        ),
      ),
    ).toBe('42501')
    const { rows } = await as(db, ID.ownerA, () =>
      db.query<{ status: string; block_message: string }>(
        'select status, block_message from public.shops',
      ),
    )
    expect(rows).toEqual([{ status: 'blocked', block_message: 'Payez' }])
    expect(
      await as(db, ID.ownerA, () => errorCode(q(`select public.touch_shop(3, '1.0', now())`))),
    ).toBeNull()
    await q(`update public.shops set status = 'active' where id = '${ID.shopA}'`)
    expect(
      await as(db, ID.ownerA, () => count(db, 'select 1 from public.products')),
    ).toBeGreaterThan(0)
  })
})

describe('8. profil désactivé', () => {
  it('tout est refusé, même avec un jeton valide', async () => {
    await q(`update public.profiles set is_active = false where user_id = '${ID.cashierA}'`)
    expect(await as(db, ID.cashierA, () => count(db, 'select 1 from public.products'))).toBe(0)
    expect(await as(db, ID.cashierA, () => count(db, 'select 1 from public.shops'))).toBe(0)
    expect(
      await as(db, ID.cashierA, () =>
        errorCode(q(`insert into public.customers (id, name) values (gen_random_uuid(), 'X')`)),
      ),
    ).toBe('42501')
    expect(
      await as(db, ID.cashierA, () => errorCode(q(`select public.touch_shop(0, '1', now())`))),
    ).toBe('42501')
    await q(`update public.profiles set is_active = true where user_id = '${ID.cashierA}'`)
  })
})

describe('9. fonctions SECURITY DEFINER', () => {
  it('search_path fixé et jamais exécutables par PUBLIC/anon', async () => {
    const { rows } = await db.query<{
      name: string
      fixed: boolean
      anon: boolean
      pub: boolean
      auth: boolean
    }>(
      `select n.nspname || '.' || p.proname as name,
              coalesce('search_path=""' = any(p.proconfig), false) as fixed,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)) as pub,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prokind = 'f'`,
    )
    expect(rows.length).toBeGreaterThan(20)
    const secDef = await db.query<{ name: string }>(
      `select n.nspname || '.' || p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prosecdef`,
    )
    const definers = new Set(secDef.rows.map((r) => r.name))
    expect(rows.filter((r) => definers.has(r.name) && !r.fixed)).toEqual([])
    expect(rows.filter((r) => r.anon || r.pub)).toEqual([])
    const allowedForUsers = new Set([
      'private.current_shop_id',
      'private.current_user_role',
      'private.shop_is_active',
      'private.active_shop_id',
      'private.active_role',
      'public.touch_shop',
      'public.accept_terms',
      'public.complete_password_change',
      'public.server_now',
      'public.update_shop_settings',
    ])
    expect(rows.filter((r) => r.auth && !allowedForUsers.has(r.name)).map((r) => r.name)).toEqual(
      [],
    )
  })
  it('un utilisateur ne peut pas appeler les fonctions d’administration', async () => {
    for (const fn of [
      'admin_overview()',
      `rate_limit_hit('k', 1, 1)`,
      `admin_shop_stats('${ID.shopA}')`,
    ]) {
      expect(await as(db, ID.ownerA, () => errorCode(q(`select * from public.${fn}`))), fn).toBe(
        '42501',
      )
    }
  })
})

describe('10. contraintes CHECK', () => {
  const bad: Array<[string, string]> = [
    [
      'montant négatif',
      `insert into public.products (id, shop_id, name, sale_price) values (gen_random_uuid(), '${ID.shopA}', 'x', -1)`,
    ],
    [
      'quantité nulle',
      `insert into public.stock_movements (id, shop_id, product_id, type, qty) values (gen_random_uuid(), '${ID.shopA}', '${ID.prodA}', 'adjustment', 0)`,
    ],
    [
      'texte trop long',
      `insert into public.categories (id, shop_id, name) values (gen_random_uuid(), '${ID.shopA}', '${'x'.repeat(201)}')`,
    ],
    [
      'statut inconnu',
      `insert into public.sales (id, shop_id, receipt_no, subtotal, total, paid_total, status) values (gen_random_uuid(), '${ID.shopA}', 'R', 1, 1, 1, 'bizarre')`,
    ],
    [
      'crédit sans client',
      `insert into public.sales (id, shop_id, receipt_no, subtotal, total, paid_total, credit_amount) values (gen_random_uuid(), '${ID.shopA}', 'R', 1000, 1000, 0, 1000)`,
    ],
    [
      'total incohérent',
      `insert into public.sales (id, shop_id, receipt_no, subtotal, discount, total, paid_total) values (gen_random_uuid(), '${ID.shopA}', 'R', 1000, 100, 1000, 1000)`,
    ],
    [
      'crédit incohérent',
      `insert into public.sales (id, shop_id, receipt_no, subtotal, total, paid_total, credit_amount) values (gen_random_uuid(), '${ID.shopA}', 'R', 1000, 1000, 500, 100)`,
    ],
    [
      'mode de paiement inconnu',
      `insert into public.sale_payments (id, shop_id, sale_id, method, amount) values (gen_random_uuid(), '${ID.shopB}', '${ID.saleB}', 'bitcoin', 5)`,
    ],
    [
      'quantité énorme',
      `insert into public.stock_movements (id, shop_id, product_id, type, qty) values (gen_random_uuid(), '${ID.shopA}', '${ID.prodA}', 'adjustment', 5000000)`,
    ],
  ]
  it.each(bad)('rejette : %s', async (_name, sql) => {
    expect(await errorCode(q(sql))).toBe('23514')
  })
})

describe('annulation de vente et colonnes protégées', () => {
  const sale = '42000000-0000-4000-8000-000000000001'
  it('le gérant annule (voided_by imposé) mais ne rétablit ni ne modifie le total', async () => {
    await as(db, ID.managerA, () =>
      q(
        `insert into public.sales (id, receipt_no, subtotal, total, paid_total) values ('${sale}', 'R-2', 500, 500, 500)`,
      ),
    )
    await as(db, ID.managerA, () =>
      q(
        `update public.sales set status = 'voided', void_reason = 'Erreur', updated_at = now() + interval '1 second' where id = '${sale}'`,
      ),
    )
    const { rows } = await db.query<{ voided_by: string; status: string }>(
      `select voided_by, status from public.sales where id = '${sale}'`,
    )
    expect(rows[0]).toEqual({ voided_by: ID.managerA, status: 'voided' })
    expect(
      await as(db, ID.managerA, () =>
        errorCode(
          q(
            `update public.sales set status = 'completed', updated_at = now() + interval '2 seconds' where id = '${sale}'`,
          ),
        ),
      ),
    ).toBe('23514')
    expect(
      await as(db, ID.managerA, () =>
        errorCode(
          q(
            `update public.sales set total = 1, subtotal = 1, paid_total = 1, updated_at = now() + interval '3 seconds' where id = '${sale}'`,
          ),
        ),
      ),
    ).toBe('23514')
  })
})

describe('synchronisation : conflits et idempotence', () => {
  const id = '22000000-0000-4000-8000-000000000001'
  it('dernière modification gagne : une mise à jour plus ancienne est ignorée', async () => {
    await as(db, ID.managerA, () =>
      q(
        `insert into public.products (id, name, sale_price, updated_at) values ('${id}', 'V2', 10, '2026-01-02T00:00:00Z')`,
      ),
    )
    await as(db, ID.managerA, () =>
      q(
        `update public.products set name = 'Ancien', updated_at = '2026-01-01T00:00:00Z' where id = '${id}'`,
      ),
    )
    expect(
      (await db.query<{ name: string }>(`select name from public.products where id = '${id}'`))
        .rows[0]?.name,
    ).toBe('V2')
    await as(db, ID.managerA, () =>
      q(
        `update public.products set name = 'V3', updated_at = '2026-01-03T00:00:00Z' where id = '${id}'`,
      ),
    )
    expect(
      (await db.query<{ name: string }>(`select name from public.products where id = '${id}'`))
        .rows[0]?.name,
    ).toBe('V3')
  })
  it('un upsert sans created_by ni shop_id fonctionne sur la ligne d’un autre utilisateur', async () => {
    const sql = `insert into public.products (id, name, sale_price, updated_at) values ('${id}', 'V4', 10, '2026-01-04T00:00:00Z')
                 on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at`
    expect(await as(db, ID.ownerA, () => errorCode(q(sql)))).toBeNull()
    expect(
      (
        await db.query<{ created_by: string }>(
          `select created_by from public.products where id = '${id}'`,
        )
      ).rows[0]?.created_by,
    ).toBe(ID.managerA)
  })
  it('renvoyer une ligne en ajout seulement ne crée pas de doublon', async () => {
    const sql = `insert into public.stock_movements (id, product_id, type, qty) values ('23000000-0000-4000-8000-000000000001', '${ID.prodA}', 'purchase', 5) on conflict (id) do nothing`
    await as(db, ID.managerA, () => q(sql))
    await as(db, ID.managerA, () => q(sql))
    expect(
      await count(
        db,
        `select 1 from public.stock_movements where id = '23000000-0000-4000-8000-000000000001'`,
      ),
    ).toBe(1)
  })
})

describe('autres contrôles de sécurité', () => {
  it('colonnes internes de shops masquées', async () => {
    for (const col of ['blocked_reason', 'notes_admin', 'pending_count']) {
      expect(
        await as(db, ID.ownerA, () => errorCode(q(`select ${col} from public.shops`))),
        col,
      ).toBe('42501')
    }
  })
  it('tables d’administration inaccessibles aux utilisateurs', async () => {
    for (const t of ['public.audit_log', 'public.platform_admins', 'private.rate_limit_events']) {
      expect(await as(db, ID.ownerA, () => errorCode(q(`select * from ${t}`))), t).toBe('42501')
    }
  })
  it('impossible de désactiver le dernier propriétaire', async () => {
    expect(
      await errorCode(
        q(`update public.profiles set is_active = false where user_id = '${ID.ownerB}'`),
      ),
    ).toBe('23514')
    expect(
      await errorCode(
        q(`update public.profiles set role = 'cashier' where user_id = '${ID.ownerB}'`),
      ),
    ).toBe('23514')
  })
  it('touch_shop valide ses paramètres et n’agit que sur la boutique de l’appelant', async () => {
    expect(
      await as(db, ID.ownerA, () => errorCode(q(`select public.touch_shop(-1, '1', now())`))),
    ).toBe('22023')
    expect(
      await as(db, ID.ownerA, () =>
        errorCode(q(`select public.touch_shop(1, '${'v'.repeat(33)}', now())`)),
      ),
    ).toBe('22023')
    await as(db, ID.ownerA, () =>
      q(`select public.touch_shop(7, '2.1', now() - interval '20 minutes')`),
    )
    const a = await db.query<{ pending_count: number; skew: number }>(
      `select pending_count, device_clock_skew_seconds as skew from public.shops where id = '${ID.shopA}'`,
    )
    expect(a.rows[0]?.pending_count).toBe(7)
    expect(Math.abs((a.rows[0]?.skew ?? 0) + 1200)).toBeLessThan(5)
    expect(
      (
        await db.query<{ pending_count: number }>(
          `select pending_count from public.shops where id = '${ID.shopB}'`,
        )
      ).rows[0]?.pending_count,
    ).toBe(0)
  })
  it('update_shop_settings réservé au propriétaire', async () => {
    expect(
      await as(db, ID.managerA, () =>
        errorCode(q(`select public.update_shop_settings('X', '{}'::jsonb)`)),
      ),
    ).toBe('42501')
    await as(db, ID.ownerA, () =>
      q(`select public.update_shop_settings('Boutique A bis', '{"paper":58}'::jsonb)`),
    )
    expect(
      (await db.query<{ name: string }>(`select name from public.shops where id = '${ID.shopA}'`))
        .rows[0]?.name,
    ).toBe('Boutique A bis')
  })
  it('accept_terms et complete_password_change ne touchent que le profil de l’appelant', async () => {
    await q(
      `update public.profiles set must_change_password = true where user_id = '${ID.cashierA}'`,
    )
    await as(db, ID.cashierA, () =>
      q(`select public.accept_terms('1'), public.complete_password_change()`),
    )
    const { rows } = await db.query<{ user_id: string; must: boolean; terms: string | null }>(
      `select user_id, must_change_password as must, terms_version as terms from public.profiles where shop_id = '${ID.shopA}' order by user_id`,
    )
    expect(rows.find((r) => r.user_id === ID.cashierA)).toMatchObject({ must: false, terms: '1' })
    expect(rows.find((r) => r.user_id === ID.ownerA)?.terms).toBeNull()
  })
})

describe('administration (clé service)', () => {
  it('admin_overview, anomalies, limitation de débit', async () => {
    const overview = await as(
      db,
      null,
      () => db.query<{ name: string }>('select name from public.admin_overview()'),
      'service_role',
    )
    expect(overview.rows.length).toBe(2)
    const anomalies = await db.query<{ problem: string }>(
      `select problem from private.audit_sale_consistency('${ID.shopB}', '-1 second') where sale_id = '${ID.saleB}'`,
    )
    expect(anomalies.rows).toEqual([]) // la vente de B est cohérente
    await q(
      `insert into public.sales (id, shop_id, receipt_no, subtotal, total, paid_total) values ('43000000-0000-4000-8000-000000000001', '${ID.shopA}', 'R-X', 700, 700, 700)`,
    )
    const incoherent = await db.query<{ problem: string }>(
      `select problem from private.audit_sale_consistency('${ID.shopA}', '-1 second')`,
    )
    expect(incoherent.rows.some((r) => r.problem.includes('lignes'))).toBe(true) // vente sans lignes
    expect(incoherent.rows.some((r) => r.problem.includes('paiements'))).toBe(true) // vente sans paiements
    const hits: boolean[] = []
    for (let i = 0; i < 4; i++) {
      const r = await as(
        db,
        null,
        () =>
          db.query<{ rate_limit_hit: boolean }>(
            `select public.rate_limit_hit('ip:1.2.3.4:create', 3, 60)`,
          ),
        'service_role',
      )
      hits.push(r.rows[0]?.rate_limit_hit ?? false)
    }
    expect(hits).toEqual([true, true, true, false])
  })
  it('journal d’audit : chaîne de hachage vérifiable et altération détectée', async () => {
    for (const action of ['create_shop', 'block_shop', 'reset_password']) {
      await q(
        `insert into public.audit_log (admin_user_id, shop_id, action, details) values ('${ID.admin}', '${ID.shopA}', '${action}', '{"a":1}'::jsonb)`,
      )
    }
    expect(
      (await db.query<{ v: string | null }>('select private.verify_audit_chain() as v')).rows[0]?.v,
    ).toBeNull()
    expect(await errorCode(q(`update public.audit_log set action = 'x'`))).toBe('23001')
    await q('alter table public.audit_log disable trigger z_append_only')
    await q(
      `update public.audit_log set action = 'falsifié' where seq = (select min(seq) from public.audit_log)`,
    )
    await q('alter table public.audit_log enable trigger z_append_only')
    expect(
      (await db.query<{ v: string | null }>('select private.verify_audit_chain() as v')).rows[0]?.v,
    ).not.toBeNull()
  })
})
