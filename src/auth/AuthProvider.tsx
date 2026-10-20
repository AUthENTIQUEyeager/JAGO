import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Env } from '@/config/env'
import { closeShopDb, dbName, openShopDb } from '@/db/dexie'
import { ensureDeviceIdentity, getMeta, setMeta } from '@/db/meta'
import { parseSettings, shopSnapshotSchema } from '@/db/settings'
import { apiCall } from '@/lib/api'
import { isNetworkError } from '@/lib/network'
import { toAuthEmail } from '@/lib/phone'
import { createSupabase } from '@/lib/supabase'
import { supabaseRemote } from '@/sync/supabaseRemote'
import { AuthContext, GENERIC_LOGIN_ERROR, type AuthApi } from './context'
import { z } from 'zod'
import {
  platformSchema,
  profileSchema,
  type AuthState,
  type PlatformSettings,
  type Profile,
  type ReadySession,
} from './types'
import { loginDelaySeconds } from './pin'
import Dexie from 'dexie'

const CTX_KEY = 'jago:ctx'
const FAILS_KEY = 'jago:login-failures'
const ctxSchema = z.object({ userId: z.string(), shopId: z.string() })

function readCtx(): z.infer<typeof ctxSchema> | null {
  try {
    const parsed = ctxSchema.safeParse(JSON.parse(localStorage.getItem(CTX_KEY) ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
const writeCtx = (userId: string, shopId: string) => {
  try {
    localStorage.setItem(CTX_KEY, JSON.stringify({ userId, shopId }))
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}
const failures = () => Number(localStorage.getItem(FAILS_KEY) ?? '0') || 0

export function AuthProvider({ env, children }: { env: Env; children: ReactNode }) {
  const supabase = useMemo(() => createSupabase(env), [env])
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const booting = useRef(false)
  const lastFailAt = useRef(0)

  const buildReady = useCallback(
    async (
      userId: string,
      email: string,
      profile: Profile,
      online: { shop: unknown; platform: unknown } | null,
    ): Promise<ReadySession | 'needsNetwork'> => {
      const db = openShopDb(profile.shop_id)
      const { deviceId, deviceShort } = await ensureDeviceIdentity(db)
      let shop = online
        ? shopSnapshotSchema.safeParse(online.shop)
        : shopSnapshotSchema.safeParse(await getMeta(db, 'shop_snapshot', shopSnapshotSchema))
      const platformRaw = online ? online.platform : (await db.meta.get('platform_snapshot'))?.value
      const platform: PlatformSettings = platformSchema.parse(platformRaw ?? {})
      if (!shop.success) {
        if (!online) return 'needsNetwork'
        shop = shopSnapshotSchema.safeParse({
          id: profile.shop_id,
          name: 'Ma boutique',
          status: 'active',
        })
        if (!shop.success) return 'needsNetwork'
      }
      if (online) {
        await setMeta(db, 'shop_snapshot', shop.data)
        await setMeta(db, 'profile_snapshot', { userId, email, profile })
        await setMeta(db, 'platform_snapshot', platform)
      }
      writeCtx(userId, profile.shop_id)
      return {
        status: 'ready',
        userId,
        email,
        profile,
        shop: shop.data,
        settings: parseSettings(shop.data.settings),
        platform,
        db,
        offline: !online,
        ctx: { db, shopId: profile.shop_id, userId, role: profile.role, deviceId, deviceShort },
      }
    },
    [],
  )

  const enterOffline = useCallback(
    async (cached: z.infer<typeof ctxSchema>): Promise<AuthState> => {
      const db = openShopDb(cached.shopId)
      const snap = await getMeta(
        db,
        'profile_snapshot',
        z.object({ userId: z.string(), email: z.string(), profile: profileSchema }),
      )
      if (!snap || snap.userId !== cached.userId) return { status: 'needsNetwork' }
      const ready = await buildReady(snap.userId, snap.email, snap.profile, null)
      return ready === 'needsNetwork' ? { status: 'needsNetwork' } : ready
    },
    [buildReady],
  )

  const boot = useCallback(async () => {
    if (booting.current) return
    booting.current = true
    try {
      const cached = readCtx()
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        // Jamais de déconnexion sur une simple erreur réseau : on entre avec les données en cache.
        if (isNetworkError(error) && cached) return setState(await enterOffline(cached))
        return setState({ status: 'signedOut' })
      }
      const user = data.session?.user
      if (!user) return setState({ status: 'signedOut' })
      const res = await supabase
        .from('profiles')
        .select('shop_id, role, full_name, phone, is_active, must_change_password, terms_version')
        .eq('user_id', user.id)
        .maybeSingle()
      if (res.error) {
        if (isNetworkError(res.error) && cached?.userId === user.id)
          return setState(await enterOffline(cached))
        if (isNetworkError(res.error)) return setState({ status: 'needsNetwork' })
        return setState({ status: 'disabled' })
      }
      const profile = profileSchema.safeParse(res.data)
      if (!profile.success || !profile.data.is_active) {
        const admin = await apiCall(supabase, 'admin/me', {}, z.object({ admin: z.literal(true) }))
        return setState(
          admin.ok
            ? { status: 'admin', userId: user.id, email: user.email ?? '' }
            : { status: 'disabled' },
        )
      }
      const remote = supabaseRemote(supabase)
      const [shop, platform] = await Promise.all([
        remote.fetchShop(),
        supabase
          .from('platform_settings')
          .select('support_phone, support_whatsapp, terms_version, terms_text, maintenance_message')
          .eq('id', 1)
          .maybeSingle(),
      ])
      const ready = await buildReady(user.id, user.email ?? '', profile.data, {
        shop: shop.ok ? shop.data : null,
        platform: platform.data,
      })
      setState(ready === 'needsNetwork' ? { status: 'needsNetwork' } : ready)
    } finally {
      booting.current = false
    }
  }, [supabase, enterOffline, buildReady])

  useEffect(() => {
    void boot()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState({ status: 'signedOut' })
      if (event === 'SIGNED_IN') setTimeout(() => void boot(), 0) // jamais d'appel Supabase directement dans ce callback
    })
    return () => data.subscription.unsubscribe()
  }, [supabase, boot])

  const signIn = useCallback(
    async (identifier: string, password: string): Promise<string | null> => {
      if (loginDelaySeconds(failures()) * 1000 > Date.now() - lastFailAt.current && failures() >= 3)
        return 'Trop d’essais. Patientez un instant avant de réessayer.'
      const email = toAuthEmail(identifier, env.authEmailDomain)
      if (!email || !password) return GENERIC_LOGIN_ERROR
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (isNetworkError(error))
          return 'Pas de connexion internet. La première connexion sur un appareil demande du réseau.'
        localStorage.setItem(FAILS_KEY, String(failures() + 1))
        lastFailAt.current = Date.now()
        return GENERIC_LOGIN_ERROR // message volontairement identique pour un compte inconnu ou un mauvais mot de passe
      }
      localStorage.removeItem(FAILS_KEY)
      await boot()
      return null
    },
    [supabase, env.authEmailDomain, boot],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' }) // la base locale et l'outbox sont conservées
    closeShopDb()
    setState({ status: 'signedOut' })
  }, [supabase])

  const wipeLocalData = useCallback(async (): Promise<string | null> => {
    if (state.status !== 'ready') return 'Aucune donnée locale à effacer.'
    if ((await state.db.outbox.count()) > 0)
      return 'Des éléments ne sont pas encore envoyés : effacement refusé pour ne rien perdre.'
    const name = dbName(state.profile.shop_id)
    await supabase.auth.signOut({ scope: 'local' })
    closeShopDb()
    await Dexie.delete(name)
    localStorage.removeItem(CTX_KEY)
    setState({ status: 'signedOut', notice: 'Les données de cet appareil ont été effacées.' })
    return null
  }, [state, supabase])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      supabase,
      env,
      signIn,
      signOut,
      wipeLocalData,
      refresh: boot,
      loginWait: () => loginDelaySeconds(failures()),
    }),
    [state, supabase, env, signIn, signOut, wipeLocalData, boot],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
