import type { TableName } from '@/db/schemas'

export interface RemoteError {
  code: string | null
  message: string
  status: number | null
  /** Vrai si la requête n'a pas pu atteindre le serveur (pas de réseau, délai dépassé). */
  network: boolean
}
export type RemoteResult<T = undefined> = { ok: true; data: T } | { ok: false; error: RemoteError }
export interface PullKey {
  ts: string
  id: string
}
export interface PullQuery {
  fromTs: string | null
  after: PullKey | null
}

/** Tout ce que le moteur de sync sait demander au serveur. L'implémentation réelle est dans supabaseRemote.ts. */
export interface Remote {
  upsert(
    table: TableName,
    rows: Array<Record<string, unknown>>,
    opts: { ignoreDuplicates: boolean },
  ): Promise<RemoteResult>
  pull(
    table: TableName,
    shopId: string,
    query: PullQuery,
    limit: number,
  ): Promise<RemoteResult<unknown[]>>
  /** Ligne `shops` de l'utilisateur (null = compte désactivé ou introuvable). */
  fetchShop(): Promise<RemoteResult<unknown>>
  touchShop(pending: number, appVersion: string, clientTime: string): Promise<RemoteResult>
  serverNow(): Promise<RemoteResult<string>>
  /** Tente de renouveler la session. valid=false : le jeton de rafraîchissement est refusé. */
  refreshSession(): Promise<RemoteResult<{ valid: boolean }>>
}
