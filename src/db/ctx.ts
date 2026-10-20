import { SERVER_ONLY_COLUMNS, APPEND_ONLY, type Role, type TableName } from './schemas'
import { tableOf, type JagoDb } from './dexie'

/** Contexte d'une écriture : qui, sur quelle boutique, depuis quel appareil. */
export interface Ctx {
  db: JagoDb
  shopId: string
  userId: string
  role: Role
  deviceId: string
  deviceShort: string
  now?: () => Date
}

export class PermissionError extends Error {}
export class ValidationError extends Error {}

export const isManager = (ctx: Pick<Ctx, 'role'>) => ctx.role === 'owner' || ctx.role === 'manager'

export function assertManager(ctx: Ctx): void {
  if (!isManager(ctx))
    throw new PermissionError('Cette action est réservée au propriétaire ou au gérant.')
}

export const nowIso = (ctx: Pick<Ctx, 'now'>): string =>
  (ctx.now ? ctx.now() : new Date()).toISOString()

type Row = { id: string } & Record<string, unknown>

/** Ce qui part au serveur : la ligne sans les colonnes imposées par le serveur. */
export function toPayload(row: Row): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...row }
  for (const column of SERVER_ONLY_COLUMNS) delete payload[column]
  return payload
}

/**
 * Écrit une ligne en local ET dans l'outbox. À appeler dans une transaction `ctx.db.transaction('rw', ctx.db.tables, …)`.
 * `insert` = nouvelle ligne (envoi sans écrasement) ; `upsert` = modification.
 */
export async function putRow(
  ctx: Ctx,
  table: TableName,
  row: Row,
  op: 'insert' | 'upsert',
): Promise<void> {
  await tableOf(ctx.db, table).put(row)
  await ctx.db.outbox.add({
    table,
    op: APPEND_ONLY.has(table) ? 'insert' : op,
    record_id: row.id,
    payload: toPayload(row),
    created_at: nowIso(ctx),
    attempts: 0,
    last_error: null,
    next_retry_at: 0,
  })
}

/** Colonnes communes d'une nouvelle ligne locale. */
export function newBase(ctx: Ctx, id: string) {
  const now = nowIso(ctx)
  return {
    id,
    shop_id: ctx.shopId,
    created_at: now,
    updated_at: now,
    server_updated_at: null,
    deleted_at: null,
    created_by: ctx.userId,
  }
}
