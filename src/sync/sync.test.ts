import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ctx } from '@/db/ctx'
import { JagoDb } from '@/db/dexie'
import { ensureDeviceIdentity, getMeta } from '@/db/meta'
import { saveProduct } from '@/db/repositories/products'
import { saveCustomer, saveExpense } from '@/db/repositories/people'
import { createSale } from '@/db/repositories/sales'
import { tableOf } from '@/db/dexie'
import type { Role, TableName } from '@/db/schemas'
import { z } from 'zod'
import { classify, nextBackoff } from './errors'
import { SyncEngine } from './engine'
import type { PullQuery, Remote, RemoteError, RemoteResult } from './remote'

const SHOP = '10000000-0000-4000-8000-00000000000a'
const USER = '00000000-0000-4000-8000-0000000000a1'
const net: RemoteError = { code: null, message: 'Failed to fetch', status: 0, network: true }
const rls: RemoteError = {
  code: '42501',
  message: 'permission denied',
  status: 403,
  network: false,
}
const err = (code: string, status: number, message = 'erreur'): RemoteError => ({
  code,
  message,
  status,
  network: false,
})

class FakeRemote implements Remote {
  rows = new Map<TableName, Map<string, Record<string, unknown>>>()
  upsertCalls: Array<{ table: TableName; ids: string[]; ignore: boolean }> = []
  pullCalls: Array<{ table: TableName; query: PullQuery }> = []
  touches: number[] = []
  shop: unknown = {
    id: SHOP,
    name: 'Boutique',
    status: 'active',
    block_message: null,
    settings: {},
  }
  down = false
  failAfterCalls: number | null = null
  loseResponseOnce = false
  failUpsert:
    ((table: TableName, rows: Array<Record<string, unknown>>) => RemoteError | null) | null = null
  refreshValid = true
  /** Simule une action de l'utilisateur pendant la réception (ex. une modification hors ligne). */
  onPull: (() => Promise<void>) | null = null
  private clock = 0

  private table(name: TableName) {
    if (!this.rows.has(name)) this.rows.set(name, new Map())
    return this.rows.get(name)!
  }
  stamp(): string {
    return new Date(Date.UTC(2026, 9, 18, 10, 0, 0) + ++this.clock)
      .toISOString()
      .replace('Z', '000+00:00')
  }
  serverPut(name: TableName, row: Record<string, unknown>): void {
    this.table(name).set(String(row.id), {
      shop_id: SHOP,
      created_by: USER,
      deleted_at: null,
      ...row,
      server_updated_at: this.stamp(),
    })
  }
  count(name: TableName): number {
    return this.table(name).size
  }

  upsert(
    table: TableName,
    rows: Array<Record<string, unknown>>,
    opts: { ignoreDuplicates: boolean },
  ): Promise<RemoteResult> {
    this.upsertCalls.push({
      table,
      ids: rows.map((r) => String(r.id)),
      ignore: opts.ignoreDuplicates,
    })
    if (
      this.down ||
      (this.failAfterCalls !== null && this.upsertCalls.length > this.failAfterCalls)
    )
      return Promise.resolve({ ok: false, error: net })
    const failure = this.failUpsert?.(table, rows)
    if (failure) return Promise.resolve({ ok: false, error: failure })
    const store = this.table(table)
    for (const row of rows) {
      const existing = store.get(String(row.id))
      if (
        existing &&
        (opts.ignoreDuplicates ||
          Date.parse(String(row.updated_at)) < Date.parse(String(existing.updated_at)))
      )
        continue
      store.set(String(row.id), {
        shop_id: SHOP,
        created_by: USER,
        deleted_at: null,
        ...existing,
        ...row,
        server_updated_at: this.stamp(),
      })
    }
    if (this.loseResponseOnce) {
      this.loseResponseOnce = false
      return Promise.resolve({ ok: false, error: net }) // le serveur a écrit, mais la réponse est perdue
    }
    return Promise.resolve({ ok: true, data: undefined })
  }
  async pull(
    table: TableName,
    _shop: string,
    query: PullQuery,
    limit: number,
  ): Promise<RemoteResult<unknown[]>> {
    this.pullCalls.push({ table, query })
    if (this.onPull && table === 'products') {
      const hook = this.onPull
      this.onPull = null
      await hook()
    }
    if (this.down) return { ok: false, error: net }
    const key = (r: Record<string, unknown>) =>
      [Date.parse(String(r.server_updated_at)), String(r.id)] as const
    let list = [...this.table(table).values()].sort(
      (a, b) => key(a)[0] - key(b)[0] || key(a)[1].localeCompare(key(b)[1]),
    )
    if (query.after) {
      const [ts, id] = [Date.parse(query.after.ts), query.after.id]
      list = list.filter((r) => key(r)[0] > ts || (key(r)[0] === ts && key(r)[1] > id))
    } else if (query.fromTs) list = list.filter((r) => key(r)[0] >= Date.parse(query.fromTs!))
    return { ok: true, data: list.slice(0, limit) }
  }
  fetchShop(): Promise<RemoteResult<unknown>> {
    return Promise.resolve(this.down ? { ok: false, error: net } : { ok: true, data: this.shop })
  }
  touchShop(pending: number): Promise<RemoteResult> {
    this.touches.push(pending)
    return Promise.resolve({ ok: true, data: undefined })
  }
  serverNow(): Promise<RemoteResult<string>> {
    return Promise.resolve({ ok: true, data: new Date('2026-10-18T10:00:00Z').toISOString() })
  }
  refreshSession(): Promise<RemoteResult<{ valid: boolean }>> {
    return Promise.resolve({ ok: true, data: { valid: this.refreshValid } })
  }
}

let t = Date.parse('2026-10-18T10:00:00Z')
let n = 0
async function setup(
  role: Role = 'owner',
  opts: { pageSize?: number; maxFkAttempts?: number } = {},
) {
  const db = new JagoDb(`sync-${++n}-${Math.random()}`)
  const { deviceId, deviceShort } = await ensureDeviceIdentity(db)
  const ctx: Ctx = {
    db,
    shopId: SHOP,
    userId: USER,
    role: 'owner',
    deviceId,
    deviceShort,
    now: () => new Date(t),
  }
  const remote = new FakeRemote()
  const engine = new SyncEngine({
    db,
    remote,
    shopId: SHOP,
    role,
    appVersion: '1.0',
    autoRetry: false,
    locks: null,
    now: () => new Date(t),
    ...opts,
  })
  return { db, ctx, remote, engine }
}
beforeEach(() => {
  t = Date.parse('2026-10-18T10:00:00Z')
})

const productRow = (i: number, over: Record<string, unknown> = {}) => ({
  id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  name: `Produit ${i}`,
  kind: 'product',
  barcode: null,
  sku: null,
  category_id: null,
  unit: 'pièce',
  sale_price: 100,
  wholesale_price: null,
  track_stock: true,
  low_stock_threshold: 0,
  is_active: true,
  ...over,
})
async function addCustomers(ctx: Ctx, count: number) {
  for (let i = 0; i < count; i++) await saveCustomer(ctx, { name: `Client ${i}` })
}

describe('classification des erreurs', () => {
  it('classe chaque cas', () => {
    expect(classify(net)).toBe('network')
    expect(classify(rls)).toBe('rls')
    expect(classify(err('PGRST301', 401))).toBe('auth')
    expect(classify(err('23505', 409))).toBe('duplicate')
    expect(classify(err('23503', 409))).toBe('fk')
    expect(classify(err('23514', 400))).toBe('permanent')
    expect(classify(err('XX000', 503))).toBe('transient')
    expect(nextBackoff(0)).toBe(2000)
    expect(nextBackoff(2000)).toBe(4000)
    expect(nextBackoff(200_000)).toBe(300_000)
  })
})

describe('envoi (push)', () => {
  it('envoie dans l’ordre, par lots de 100 maximum, sans doublon', async () => {
    const { ctx, db, remote, engine } = await setup()
    await addCustomers(ctx, 230)
    const p = await saveProduct(ctx, {
      name: 'Riz',
      sale_price: 1000,
      cost_price: 600,
      opening_qty: 5,
    })
    await createSale(ctx, {
      lines: [
        {
          product_id: p,
          name: 'Riz',
          qty: 1,
          unit_price: 1000,
          list_price: 1000,
          line_discount: 0,
          track_stock: true,
        },
      ],
      discount: 0,
      payments: [{ method: 'cash', amount: 1000 }],
      customer_id: null,
    })
    const expectedTables = (await db.outbox.orderBy('seq').toArray()).map((o) => o.table)
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 })
    const sent = remote.upsertCalls.flatMap((c) => c.ids.map(() => c.table))
    expect(sent).toEqual(expectedTables)
    expect(Math.max(...remote.upsertCalls.map((c) => c.ids.length))).toBe(100)
    expect(remote.count('customers')).toBe(230)
    expect(remote.count('sales')).toBe(1)
    expect(remote.upsertCalls.every((c) => c.ignore)).toBe(true) // lignes toutes nouvelles : envoi sans écrasement
    expect(remote.touches.at(-1)).toBe(0)
  })

  it('idempotence : réponse perdue après écriture serveur, renvoi sans doublon', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 5)
    remote.loseResponseOnce = true
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('offline')
    expect(await db.outbox.count()).toBe(5)
    expect(remote.count('customers')).toBe(5)
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 })
    expect(remote.count('customers')).toBe(5)
  })

  it('reprise après coupure au milieu d’un envoi, avec attente croissante', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 250)
    remote.failAfterCalls = 2
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'offline', retryInMs: 2000 })
    expect(await db.outbox.count()).toBe(50)
    await engine.syncNow()
    expect(engine.getStatus().retryInMs).toBe(4000)
    remote.failAfterCalls = null
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0, retryInMs: null })
    expect(remote.count('customers')).toBe(250)
  })

  it('un seul cycle à la fois', async () => {
    const { ctx, remote, engine } = await setup()
    await addCustomers(ctx, 3)
    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()])
    expect(remote.upsertCalls).toHaveLength(1)
  })

  it('doublon 23505 = succès', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 2)
    let once = true
    remote.failUpsert = () => (once ? ((once = false), err('23505', 409)) : null)
    await engine.syncNow()
    expect(await db.outbox.count()).toBe(0)
    expect(engine.getStatus().failed).toBe(0)
  })

  it('rejet permanent : la ligne fautive est isolée et mise de côté, les autres partent', async () => {
    const { ctx, remote, engine, db } = await setup()
    await saveCustomer(ctx, { name: 'Bon 1' })
    await saveCustomer(ctx, { name: 'BAD' })
    await saveCustomer(ctx, { name: 'Bon 2' })
    remote.failUpsert = (_t, rows) =>
      rows.some((r) => r.name === 'BAD') ? err('23514', 400, 'contrainte violée') : null
    await engine.syncNow()
    expect(remote.count('customers')).toBe(2)
    const failed = await db.outbox_failed.toArray()
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ table: 'customers', reason: 'contrainte violée' })
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0, failed: 1 })
  })

  it('droit refusé alors que la boutique est active : mis de côté, sans bloquer le reste', async () => {
    const { ctx, remote, engine, db } = await setup()
    await saveExpense(ctx, { label: 'Loyer', amount: 5000, expense_date: '2026-10-18' })
    await saveCustomer(ctx, { name: 'Awa' })
    remote.failUpsert = (table) => (table === 'expenses' ? rls : null)
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('idle')
    expect(remote.count('customers')).toBe(1)
    expect(await db.outbox_failed.count()).toBe(1)
  })

  it('clé étrangère manquante : réessais espacés, puis mise de côté', async () => {
    const { ctx, remote, engine, db } = await setup('owner', { maxFkAttempts: 3 })
    await saveCustomer(ctx, { name: 'Awa' })
    remote.failUpsert = () => err('23503', 409, 'parent absent')
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('error')
    expect(await db.outbox.count()).toBe(1)
    t += 120_000
    await engine.syncNow()
    t += 120_000
    await engine.syncNow()
    expect(await db.outbox.count()).toBe(0)
    expect((await db.outbox_failed.toArray())[0]?.reason).toContain('parent')
  })
})

describe('blocage, désactivation et session', () => {
  it('boutique bloquée : pause totale, outbox intacte, reprise propre au déblocage', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 4)
    remote.shop = {
      id: SHOP,
      name: 'B',
      status: 'blocked',
      block_message: 'Contactez-nous',
      settings: {},
    }
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({
      state: 'blocked',
      blockedReason: 'blocked',
      blockMessage: 'Contactez-nous',
      pending: 4,
    })
    expect(remote.upsertCalls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(4)
    remote.shop = { id: SHOP, name: 'B', status: 'active', block_message: null, settings: {} }
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'idle', pending: 0, blockedReason: null })
    expect(remote.count('customers')).toBe(4)
  })

  it('blocage détecté pendant l’envoi (erreur RLS) : rien n’est supprimé', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 3)
    remote.failUpsert = () => {
      remote.shop = { id: SHOP, name: 'B', status: 'blocked', block_message: null, settings: {} }
      return rls
    }
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('blocked')
    expect(await db.outbox.count()).toBe(3)
    expect(await db.outbox_failed.count()).toBe(0)
    remote.failUpsert = null
    remote.shop = { id: SHOP, name: 'B', status: 'active', block_message: null, settings: {} }
    await engine.syncNow()
    expect(remote.count('customers')).toBe(3)
  })

  it('utilisateur désactivé (ligne boutique invisible) : pause, outbox intacte', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 2)
    remote.shop = null
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'blocked', blockedReason: 'disabled' })
    expect(await db.outbox.count()).toBe(2)
    expect(remote.upsertCalls).toHaveLength(0)
  })

  it('session expirée (401) : renouvelée si possible, sinon reconnexion demandée sans rien perdre', async () => {
    const { ctx, remote, engine, db } = await setup()
    await addCustomers(ctx, 2)
    let expired = true
    remote.failUpsert = () => (expired ? err('PGRST301', 401, 'JWT expired') : null)
    remote.refreshValid = false
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'error', needsLogin: true })
    expect(await db.outbox.count()).toBe(2)
    remote.refreshValid = true
    let first = true
    remote.failUpsert = () => (first ? ((first = false), err('PGRST301', 401)) : null)
    expired = false
    await engine.syncNow()
    expect(engine.getStatus()).toMatchObject({ state: 'idle', needsLogin: false, pending: 0 })
    expect(remote.count('customers')).toBe(2)
  })
})

describe('réception (pull)', () => {
  it('pages de 500, curseur conservé, puis seulement les nouveautés', async () => {
    const { db, remote, engine } = await setup('owner', { pageSize: 500 })
    for (let i = 1; i <= 1200; i++) remote.serverPut('products', productRow(i))
    await engine.syncNow()
    expect(await db.products.count()).toBe(1200)
    expect(remote.pullCalls.filter((c) => c.table === 'products')).toHaveLength(3)
    const cursor = await getMeta(
      db,
      'pull_cursor:products',
      z.object({ ts: z.string(), id: z.string() }),
    )
    expect(cursor?.id).toBeTruthy()
    remote.pullCalls = []
    remote.serverPut('products', productRow(1201))
    await engine.syncNow()
    expect(await db.products.count()).toBe(1201)
    expect(remote.pullCalls.find((c) => c.table === 'products')?.query.fromTs).not.toBeNull()
  })

  it('la dernière modification gagne', async () => {
    const { ctx, db, remote, engine } = await setup()
    const id = await saveProduct(ctx, { name: 'Local', sale_price: 100 })
    await engine.syncNow() // envoyé : plus rien en attente
    const mine = (await db.products.get(id))!
    remote.serverPut('products', {
      ...productRow(1),
      id,
      updated_at: new Date(Date.parse(mine.updated_at) - 1000).toISOString(),
      name: 'Serveur ancien',
    })
    await engine.syncNow()
    expect((await db.products.get(id))?.name).toBe('Local')
    remote.serverPut('products', {
      ...productRow(1),
      id,
      updated_at: new Date(Date.parse(mine.updated_at) + 1000).toISOString(),
      name: 'Serveur récent',
    })
    await engine.syncNow()
    expect((await db.products.get(id))?.name).toBe('Serveur récent')
  })

  it('n’écrase jamais une ligne locale en attente d’envoi', async () => {
    const { ctx, db, remote, engine } = await setup()
    const id = await saveProduct(ctx, { name: 'Base', sale_price: 100 })
    await engine.syncNow()
    // Pendant la réception, l'utilisateur modifie le produit (la modification attend dans l'outbox)…
    remote.onPull = async () => {
      await saveProduct(ctx, { name: 'Modifié hors ligne', sale_price: 100 }, id)
    }
    // …alors que le serveur propose une version « plus récente » de la même ligne.
    remote.serverPut('products', {
      ...productRow(1),
      id,
      updated_at: '2030-01-01T00:00:00.000Z',
      name: 'Serveur très récent',
    })
    await engine.syncNow()
    expect((await db.products.get(id))?.name).toBe('Modifié hors ligne')
    expect(await db.outbox.count()).toBe(1)
  })

  it('pas de double comptage du stock quand un mouvement local revient par pull', async () => {
    const { ctx, db, engine } = await setup()
    const p = await saveProduct(ctx, { name: 'Riz', sale_price: 100, opening_qty: 5 })
    await engine.syncNow()
    expect(await db.stock_movements.count()).toBe(1)
    expect((await db.stock_cache.get(p))?.qty).toBe(5)
    await engine.syncNow()
    expect((await db.stock_cache.get(p))?.qty).toBe(5)
  })

  it('un nouvel appareil reconstitue stock et soldes depuis le serveur', async () => {
    const a = await setup()
    const p = await saveProduct(a.ctx, { name: 'Riz', sale_price: 1000, opening_qty: 10 })
    const c = await saveCustomer(a.ctx, { name: 'Awa' })
    await createSale(a.ctx, {
      lines: [
        {
          product_id: p,
          name: 'Riz',
          qty: 4,
          unit_price: 1000,
          list_price: 1000,
          line_discount: 0,
          track_stock: true,
        },
      ],
      discount: 0,
      payments: [{ method: 'cash', amount: 1000 }],
      customer_id: c,
    })
    await a.engine.syncNow()
    const b = await setup()
    b.remote.rows = a.remote.rows // même serveur
    await b.engine.syncNow()
    expect((await b.db.stock_cache.get(p))?.qty).toBe(6)
    expect((await b.db.balance_cache.get(c))?.balance).toBe(3000)
    expect(await b.db.sales.count()).toBe(1)
    expect(b.engine.getStatus().progress).toBeNull()
  })

  it('ignore une ligne invalide sans bloquer les autres', async () => {
    const { db, remote, engine } = await setup()
    remote.serverPut('products', productRow(1))
    remote.serverPut('products', productRow(2, { kind: 'inconnu' }))
    await engine.syncNow()
    expect(await db.products.count()).toBe(1)
    expect(engine.getStatus().invalidRows).toBe(1)
  })

  it('le caissier ne télécharge pas les prix d’achat', async () => {
    const { remote, engine } = await setup('cashier')
    await engine.syncNow()
    expect(remote.pullCalls.some((c) => c.table === 'product_costs')).toBe(false)
    expect(remote.pullCalls.some((c) => c.table === 'products')).toBe(true)
  })

  it('coupure réseau pendant la réception : état hors ligne', async () => {
    const { remote, engine } = await setup()
    remote.down = true
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('offline')
    remote.down = false
    await engine.syncNow()
    expect(engine.getStatus().state).toBe('idle')
  })
})

describe('stockage local', () => {
  it('les tables locales restent lisibles après plusieurs cycles', async () => {
    const { ctx, db, engine } = await setup()
    await addCustomers(ctx, 3)
    await engine.syncNow()
    expect(await tableOf(db, 'customers').count()).toBe(3)
  })
})
