import type { SupabaseClient } from '@supabase/supabase-js'
import type { Remote, RemoteError, RemoteResult } from './remote'

const NETWORK_RE = /fetch|network|timeout|timed out|failed to load|load failed|abort|connection/i

function toError(
  e: { code?: string | null; message?: string },
  status: number | null,
): RemoteError {
  const message = e.message ?? 'Erreur inconnue'
  const code = e.code && e.code.length > 0 ? e.code : null
  return {
    code,
    message,
    status,
    network: status === 0 || (code === null && NETWORK_RE.test(message)),
  }
}

function thrown(error: unknown): RemoteError {
  return {
    code: null,
    message: error instanceof Error ? error.message : String(error),
    status: 0,
    network: true,
  }
}

function timeout(ms = 20_000): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(ms)
    : undefined
}

/** Seul endroit qui parle à Supabase pour les données métier (les écrans, eux, ne lisent que Dexie). */
export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async upsert(table, rows, opts) {
      try {
        let q = client
          .from(table)
          .upsert(rows, { onConflict: 'id', ignoreDuplicates: opts.ignoreDuplicates })
        const signal = timeout()
        if (signal) q = q.abortSignal(signal)
        const res = await q
        return res.error
          ? { ok: false, error: toError(res.error, res.status) }
          : { ok: true, data: undefined }
      } catch (error) {
        return { ok: false, error: thrown(error) }
      }
    },

    async pull(table, shopId, query, limit) {
      try {
        let q = client.from(table).select('*').eq('shop_id', shopId)
        if (query.after) {
          q = q.or(
            `server_updated_at.gt.${query.after.ts},and(server_updated_at.eq.${query.after.ts},id.gt.${query.after.id})`,
          )
        } else if (query.fromTs) q = q.gte('server_updated_at', query.fromTs)
        q = q
          .order('server_updated_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(limit)
        const signal = timeout()
        if (signal) q = q.abortSignal(signal)
        const res = await q
        if (res.error) return { ok: false, error: toError(res.error, res.status) }
        const data: unknown = res.data
        return { ok: true, data: Array.isArray(data) ? (data as unknown[]) : [] }
      } catch (error) {
        return { ok: false, error: thrown(error) }
      }
    },

    async fetchShop() {
      try {
        const res = await client
          .from('shops')
          .select('id,name,status,block_message,settings')
          .limit(1)
        if (res.error) return { ok: false, error: toError(res.error, res.status) }
        const data: unknown = res.data
        return { ok: true, data: Array.isArray(data) ? (data[0] ?? null) : null }
      } catch (error) {
        return { ok: false, error: thrown(error) }
      }
    },

    async touchShop(pending, appVersion, clientTime) {
      try {
        const res = await client.rpc('touch_shop', {
          p_pending: pending,
          p_app_version: appVersion,
          p_client_time: clientTime,
        })
        return res.error
          ? { ok: false, error: toError(res.error, res.status) }
          : { ok: true, data: undefined }
      } catch (error) {
        return { ok: false, error: thrown(error) }
      }
    },

    async serverNow() {
      try {
        const res = await client.rpc('server_now')
        const data: unknown = res.data
        if (res.error || typeof data !== 'string')
          return {
            ok: false,
            error: toError(res.error ?? { message: 'Réponse inattendue' }, res.status),
          }
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: thrown(error) }
      }
    },

    async refreshSession(): Promise<RemoteResult<{ valid: boolean }>> {
      try {
        const { error } = await client.auth.refreshSession()
        if (!error) return { ok: true, data: { valid: true } }
        const network =
          error.status === 0 || error.status === undefined || NETWORK_RE.test(error.message)
        if (network) return { ok: false, error: toError(error, 0) }
        return { ok: true, data: { valid: false } }
      } catch (error) {
        return { ok: false, error: thrown(error) }
      }
    },
  }
}
