import { z } from 'zod'
import { recomputeBalances, recomputeStock } from '@/db/derived'
import { tableOf, type JagoDb, type OutboxItem } from '@/db/dexie'
import { getMeta, setMeta } from '@/db/meta'
import { shopSnapshotSchema } from '@/db/settings'
import { APPEND_ONLY, SYNC_TABLES, TABLE_SCHEMAS, type Role, type TableName } from '@/db/schemas'
import { classify, nextBackoff } from './errors'
import type { PullKey, Remote, RemoteError } from './remote'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'blocked'

export interface SyncStatus {
  state: SyncState
  pending: number
  failed: number
  lastSyncAt: string | null
  error: string | null
  /** blocked : suspendue par l'administrateur ; disabled : compte désactivé. */
  blockedReason: 'blocked' | 'disabled' | null
  blockMessage: string | null
  /** La session n'est plus valable : il faut se reconnecter (l'outbox est conservée). */
  needsLogin: boolean
  retryInMs: number | null
  /** Avancement du premier téléchargement (nouvel appareil). */
  progress: { done: number; total: number } | null
  clockSkewSeconds: number | null
  invalidRows: number
}

export interface EngineOptions {
  db: JagoDb
  remote: Remote
  shopId: string
  role: Role
  appVersion: string
  now?: () => Date
  batchSize?: number
  pageSize?: number
  maxFkAttempts?: number
  /** false : pas de minuterie interne (tests). */
  autoRetry?: boolean
  /** Verrou entre onglets (navigator.locks) ; sinon un simple drapeau en mémoire. */
  locks?: Pick<LockManager, 'request'> | null
}

/** On relit un peu en arrière : sans danger (mises à jour idempotentes) et ne rate aucune ligne validée tardivement. */
const PULL_OVERLAP_MS = 5000
const cursorSchema = z.object({ ts: z.string(), id: z.string() })
const keySchema = z.object({ server_updated_at: z.string(), id: z.string() })
type Outcome = 'ok' | 'stop'

export class SyncEngine {
  private readonly db: JagoDb
  private readonly remote: Remote
  private readonly o: Required<Omit<EngineOptions, 'db' | 'remote' | 'locks'>> & {
    locks: EngineOptions['locks']
  }
  private listeners = new Set<() => void>()
  private running = false
  private retryMs = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private authRetried = false
  private lastClockCheck = 0
  private status: SyncStatus = {
    state: 'idle',
    pending: 0,
    failed: 0,
    lastSyncAt: null,
    error: null,
    blockedReason: null,
    blockMessage: null,
    needsLogin: false,
    retryInMs: null,
    progress: null,
    clockSkewSeconds: null,
    invalidRows: 0,
  }

  constructor(options: EngineOptions) {
    this.db = options.db
    this.remote = options.remote
    this.o = {
      shopId: options.shopId,
      role: options.role,
      appVersion: options.appVersion,
      now: options.now ?? (() => new Date()),
      batchSize: options.batchSize ?? 100,
      pageSize: options.pageSize ?? 500,
      maxFkAttempts: options.maxFkAttempts ?? 8,
      autoRetry: options.autoRetry ?? true,
      locks:
        options.locks === undefined
          ? typeof navigator !== 'undefined' && 'locks' in navigator
            ? navigator.locks
            : null
          : options.locks,
    }
  }

  getStatus = (): SyncStatus => this.status
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.listeners.clear()
  }

  private set(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch }
    this.listeners.forEach((l) => l())
  }

  async refreshCounts(): Promise<void> {
    const [pending, failed, lastSyncAt] = await Promise.all([
      this.db.outbox.count(),
      this.db.outbox_failed.count(),
      getMeta(this.db, 'last_sync_at', z.string()),
    ])
    this.set({ pending, failed, lastSyncAt: lastSyncAt ?? this.status.lastSyncAt })
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.set({ retryInMs: ms })
    if (!this.o.autoRetry) return
    this.timer = setTimeout(() => void this.syncNow(), ms)
  }

  /** Un cycle complet : état de la boutique → envoi → réception. Un seul cycle à la fois (aussi entre onglets). */
  async syncNow(): Promise<SyncStatus> {
    if (this.running) return this.status
    this.running = true
    try {
      if (this.o.locks) {
        await this.o.locks.request(
          `jago-sync-${this.o.shopId}`,
          { ifAvailable: true },
          async (lock) => {
            if (lock) await this.cycle()
          },
        )
      } else await this.cycle()
    } finally {
      this.running = false
    }
    return this.status
  }

  private async cycle(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.authRetried = false
    this.set({ state: 'syncing', error: null, retryInMs: null })
    await this.refreshCounts()
    if ((await this.checkShop()) === 'stop') return
    if ((await this.push()) === 'stop') return
    if ((await this.pull()) === 'stop') return
    await this.afterSuccess()
  }

  // ───────── état de la boutique (blocage / désactivation) ─────────
  private async checkShop(): Promise<Outcome> {
    const res = await this.remote.fetchShop()
    if (!res.ok) return this.onError(res.error)
    const parsed = shopSnapshotSchema.safeParse(res.data)
    if (res.data === null || !parsed.success) {
      this.set({
        state: 'blocked',
        blockedReason: 'disabled',
        blockMessage: null,
        error: 'Votre compte a été désactivé.',
      })
      this.schedule(30_000)
      return 'stop'
    }
    await setMeta(this.db, 'shop_snapshot', parsed.data)
    if (parsed.data.status === 'blocked') {
      this.set({
        state: 'blocked',
        blockedReason: 'blocked',
        blockMessage: parsed.data.block_message ?? null,
        error: 'Accès suspendu par l’administrateur.',
      })
      this.schedule(30_000)
      return 'stop'
    }
    this.set({ blockedReason: null, blockMessage: null })
    return 'ok'
  }

  private onError(error: RemoteError): Outcome {
    const kind = classify(error)
    if (kind === 'network') {
      this.retryMs = nextBackoff(this.retryMs)
      this.set({
        state: 'offline',
        error: 'Pas de connexion. Vos données sont gardées et seront envoyées au retour du réseau.',
      })
      this.schedule(this.retryMs)
    } else if (kind === 'auth') {
      void this.recoverAuth()
    } else {
      this.retryMs = nextBackoff(this.retryMs)
      this.set({ state: 'error', error: `Le serveur a répondu une erreur : ${error.message}` })
      this.schedule(this.retryMs)
    }
    return 'stop'
  }

  /** 401 : on tente un renouvellement de session. Jamais d'effacement de l'outbox. */
  private async recoverAuth(): Promise<boolean> {
    if (this.authRetried) {
      this.set({
        state: 'error',
        needsLogin: true,
        error:
          'Votre session a expiré. Reconnectez-vous : vos ventes non envoyées sont conservées.',
      })
      return false
    }
    this.authRetried = true
    const res = await this.remote.refreshSession()
    if (!res.ok) {
      this.onError(res.error)
      return false
    }
    if (!res.data.valid) {
      this.set({
        state: 'error',
        needsLogin: true,
        error:
          'Votre session a expiré. Reconnectez-vous : vos ventes non envoyées sont conservées.',
      })
      return false
    }
    return true
  }

  // ───────── envoi (outbox) ─────────
  private async push(): Promise<Outcome> {
    for (;;) {
      const head = await this.db.outbox.orderBy('seq').first()
      await this.refreshCounts()
      if (!head) return 'ok'
      if (head.next_retry_at > this.o.now().getTime()) {
        this.set({
          state: 'error',
          error: 'Certains éléments attendent d’autres données avant d’être envoyés.',
        })
        this.schedule(Math.max(1000, head.next_retry_at - this.o.now().getTime()))
        return 'stop'
      }
      const ignore = this.ignoreDuplicates(head)
      const window = await this.db.outbox.orderBy('seq').limit(this.o.batchSize).toArray()
      const batch: OutboxItem[] = []
      for (const item of window) {
        if (
          item.table !== head.table ||
          this.ignoreDuplicates(item) !== ignore ||
          item.next_retry_at > this.o.now().getTime()
        )
          break
        batch.push(item)
      }
      if ((await this.sendBatch(batch, ignore, true)) === 'stop') return 'stop'
    }
  }

  private ignoreDuplicates(item: OutboxItem): boolean {
    return item.op === 'insert' || APPEND_ONLY.has(item.table)
  }

  private async deleteItems(items: OutboxItem[]): Promise<void> {
    await this.db.outbox.bulkDelete(items.flatMap((i) => (i.seq === undefined ? [] : [i.seq])))
  }

  private async sendBatch(batch: OutboxItem[], ignore: boolean, split: boolean): Promise<Outcome> {
    const table = batch[0]?.table
    if (!table) return 'ok'
    const res = await this.remote.upsert(
      table,
      batch.map((b) => b.payload),
      { ignoreDuplicates: ignore },
    )
    if (res.ok) {
      await this.deleteItems(batch)
      this.retryMs = 0
      return 'ok'
    }
    const kind = classify(res.error)
    if (kind === 'duplicate') {
      await this.deleteItems(batch) // déjà présent sur le serveur : succès
      return 'ok'
    }
    if (kind === 'network' || kind === 'transient') return this.onError(res.error)
    if (kind === 'auth')
      return (await this.recoverAuth()) ? this.sendBatch(batch, ignore, split) : 'stop'
    if (kind === 'rls' && (await this.checkShop()) === 'stop') return 'stop' // boutique bloquée / compte désactivé : pause, rien n'est supprimé
    if (kind === 'fk') {
      await this.bumpAttempts(batch, res.error)
      return 'ok'
    }
    // Erreur permanente (validation, droit refusé alors que la boutique est active…) : on isole la ligne fautive.
    if (batch.length > 1 && split) {
      for (const item of batch)
        if ((await this.sendBatch([item], ignore, false)) === 'stop') return 'stop'
      return 'ok'
    }
    await this.moveToFailed(batch, res.error.message)
    return 'ok'
  }

  /** Clé étrangère manquante : le parent n'est peut-être pas encore arrivé. On réessaie, puis on met de côté. */
  private async bumpAttempts(batch: OutboxItem[], error: RemoteError): Promise<void> {
    const dead: OutboxItem[] = []
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const item of batch) {
        const attempts = item.attempts + 1
        if (attempts >= this.o.maxFkAttempts) dead.push(item)
        else if (item.seq !== undefined) {
          await this.db.outbox.update(item.seq, {
            attempts,
            last_error: error.message,
            next_retry_at: this.o.now().getTime() + Math.min(2 ** attempts * 1000, 60_000),
          })
        }
      }
    })
    if (dead.length) await this.moveToFailed(dead, `Élément parent introuvable : ${error.message}`)
  }

  /** Rejet définitif : jamais supprimé en silence, visible dans « État de la synchronisation ». */
  private async moveToFailed(items: OutboxItem[], reason: string): Promise<void> {
    const failedAt = this.o.now().toISOString()
    await this.db.transaction('rw', [this.db.outbox, this.db.outbox_failed], async () => {
      for (const item of items) {
        const rest: Omit<OutboxItem, 'seq'> & { seq?: number } = { ...item }
        delete rest.seq
        await this.db.outbox_failed.add({
          ...rest,
          failed_at: failedAt,
          reason,
          last_error: reason,
        })
      }
      await this.deleteItems(items)
    })
    await this.refreshCounts()
  }

  // ───────── réception (pull) ─────────
  private async pull(): Promise<Outcome> {
    const tables = SYNC_TABLES.filter((t) => !(t === 'product_costs' && this.o.role === 'cashier'))
    const cursors = await Promise.all(
      tables.map((t) => getMeta(this.db, `pull_cursor:${t}`, cursorSchema)),
    )
    const initial = cursors.every((c) => c === undefined)
    for (const [index, table] of tables.entries()) {
      if (initial) this.set({ progress: { done: index, total: tables.length } })
      const cursor = cursors[index]
      let fromTs = cursor ? new Date(Date.parse(cursor.ts) - PULL_OVERLAP_MS).toISOString() : null
      let after: PullKey | null = null
      for (;;) {
        const res = await this.remote.pull(table, this.o.shopId, { fromTs, after }, this.o.pageSize)
        if (!res.ok) {
          const kind = classify(res.error)
          if (kind === 'rls' && (await this.checkShop()) === 'ok') {
            this.set({ state: 'error', error: `Lecture refusée pour « ${table} ».` })
            return 'stop'
          }
          if (kind === 'rls') return 'stop'
          if (kind === 'auth') {
            if (await this.recoverAuth()) continue
            return 'stop'
          }
          return this.onError(res.error)
        }
        fromTs = null
        const last = res.data.length ? keySchema.safeParse(res.data[res.data.length - 1]) : null
        await this.applyPage(
          table,
          res.data,
          last?.success ? { ts: last.data.server_updated_at, id: last.data.id } : null,
        )
        if (res.data.length < this.o.pageSize || !last?.success) break
        after = { ts: last.data.server_updated_at, id: last.data.id }
      }
    }
    this.set({ progress: null })
    return 'ok'
  }

  private async applyPage(
    table: TableName,
    raw: unknown[],
    lastKey: PullKey | null,
  ): Promise<void> {
    const schema = TABLE_SCHEMAS[table]
    const rows: Array<{ id: string; updated_at: string } & Record<string, unknown>> = []
    let invalid = 0
    for (const item of raw) {
      const parsed = schema.safeParse(item)
      if (parsed.success) rows.push(parsed.data)
      else invalid++
    }
    if (invalid) this.set({ invalidRows: this.status.invalidRows + invalid })
    const local = tableOf(this.db, table)
    await this.db.transaction('rw', this.db.tables, async () => {
      const ids = rows.map((r) => r.id)
      let accepted = rows
      if (!APPEND_ONLY.has(table)) {
        // Règle de conflit : la dernière modification gagne, sauf si la ligne locale attend d'être envoyée.
        const pending = new Set(
          (await this.db.outbox.where('record_id').anyOf(ids).toArray())
            .filter((o) => o.table === table)
            .map((o) => o.record_id),
        )
        const existing = await local.bulkGet(ids)
        accepted = rows.filter((row, i) => {
          if (pending.has(row.id)) return false
          const mine = existing[i]
          return !mine || Date.parse(String(mine.updated_at)) <= Date.parse(row.updated_at)
        })
      }
      await local.bulkPut(accepted)
      if (table === 'stock_movements')
        await recomputeStock(
          this.db,
          accepted.map((r) => String(r.product_id)),
        )
      if (table === 'customer_ledger')
        await recomputeBalances(
          this.db,
          accepted.map((r) => String(r.customer_id)),
        )
      if (lastKey) await setMeta(this.db, `pull_cursor:${table}`, lastKey)
    })
  }

  // ───────── fin de cycle ─────────
  private async afterSuccess(): Promise<void> {
    const nowIso = this.o.now().toISOString()
    await this.refreshCounts()
    const touch = await this.remote.touchShop(this.status.pending, this.o.appVersion, nowIso)
    if (!touch.ok && classify(touch.error) === 'rls' && (await this.checkShop()) === 'stop') return
    if (this.o.now().getTime() - this.lastClockCheck > 600_000) {
      const server = await this.remote.serverNow()
      if (server.ok) {
        this.lastClockCheck = this.o.now().getTime()
        this.set({
          clockSkewSeconds: Math.round((this.o.now().getTime() - Date.parse(server.data)) / 1000),
        })
      }
    }
    await setMeta(this.db, 'last_sync_at', nowIso)
    this.retryMs = 0
    this.set({ state: 'idle', error: null, lastSyncAt: nowIso, needsLogin: false, retryInMs: null })
    await this.refreshCounts()
  }
}
