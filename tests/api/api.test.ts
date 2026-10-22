// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeAdmin } from './fakeAdmin'

const h = vi.hoisted((): { admin: unknown } => ({ admin: null }))
vi.mock('../../server/_lib/supabaseAdmin.js', () => ({
  getAdmin: () => h.admin,
  authEmailDomain: () => 'shops.test',
}))

import auditLog from '../../server/admin/audit-log'
import createShop from '../../server/admin/create-shop'
import deleteSignup from '../../server/admin/delete-signup'
import listSignups from '../../server/admin/list-signups'
import updateSignup from '../../server/admin/update-signup'
import signup from '../../server/public/signup'
import listShops from '../../server/admin/list-shops'
import me from '../../server/admin/me'
import resetPassword from '../../server/admin/reset-password'
import setShopStatus from '../../server/admin/set-shop-status'
import shopDetail from '../../server/admin/shop-detail'
import updateSettings from '../../server/admin/update-settings'
import viewShopData from '../../server/admin/view-shop-data'
import createStaff from '../../server/shop/create-staff'
import listStaff from '../../server/shop/list-staff'
import resetStaffPassword from '../../server/shop/reset-staff-password'
import setStaffActive from '../../server/shop/set-staff-active'
import { scrub } from '../../server/_lib/audit'

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>
const U = {
  admin: '00000000-0000-4000-8000-0000000000ff',
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  cashierA: '00000000-0000-4000-8000-0000000000a3',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  cashierB: '00000000-0000-4000-8000-0000000000b2',
  managerA: '00000000-0000-4000-8000-0000000000a2',
  ownerC: '00000000-0000-4000-8000-0000000000c1',
}
const SHOP_A = '10000000-0000-4000-8000-00000000000a'
const SHOP_B = '10000000-0000-4000-8000-00000000000b'
const ADMIN_ROUTES: Record<string, Handler> = {
  me,
  listShops,
  shopDetail,
  createShop,
  setShopStatus,
  resetPassword,
  auditLog,
  updateSettings,
  viewShopData,
  listSignups,
  updateSignup,
  deleteSignup,
}
const SHOP_ROUTES: Record<string, Handler> = {
  listStaff,
  createStaff,
  setStaffActive,
  resetStaffPassword,
}

let fake: FakeAdmin
beforeEach(() => {
  fake = new FakeAdmin()
  h.admin = fake
  fake.addShop(SHOP_A)
  fake.addShop(SHOP_B)
  fake.addProfile({ user_id: U.ownerA, shop_id: SHOP_A, role: 'owner' })
  fake.addProfile({ user_id: U.managerA, shop_id: SHOP_A, role: 'manager' })
  fake.addProfile({ user_id: U.cashierA, shop_id: SHOP_A, role: 'cashier', phone: '+22670000003' })
  fake.addProfile({ user_id: U.ownerB, shop_id: SHOP_B, role: 'owner' })
  fake.addProfile({ user_id: U.cashierB, shop_id: SHOP_B, role: 'cashier', phone: '+22670000099' })
  fake.tables.platform_admins?.push({ user_id: U.admin })
})

async function call(
  handler: Handler,
  opts: { token?: string; body?: unknown; method?: string; ip?: string } = {},
) {
  const req = {
    method: opts.method ?? 'POST',
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      'x-forwarded-for': opts.ip ?? '1.1.1.1',
    },
    body: opts.body ?? {},
  } as unknown as VercelRequest
  const out: {
    status: number
    body: { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } }
  } = { status: 0, body: { ok: false } }
  const res = {
    setHeader: () => res,
    status: (c: number) => {
      out.status = c
      return res
    },
    json: (b: typeof out.body) => {
      out.body = b
    },
  } as unknown as VercelResponse
  await handler(req, res)
  return out
}
const adminToken = (age = 10) => fake.token({ id: U.admin }, { aal: 'aal2', totpAgeSec: age })

describe('refus par défaut', () => {
  it('chaque route refuse sans jeton (401) et avec une mauvaise méthode (405)', async () => {
    for (const [name, handler] of Object.entries({ ...ADMIN_ROUTES, ...SHOP_ROUTES })) {
      expect((await call(handler)).status, `${name} sans jeton`).toBe(401)
      expect((await call(handler, { token: 'faux' })).status, `${name} jeton faux`).toBe(401)
      expect(
        (await call(handler, { method: 'GET', token: adminToken() })).status,
        `${name} GET`,
      ).toBe(405)
    }
  })

  it('403 : un non-admin sur les routes admin, un non-propriétaire sur les routes boutique', async () => {
    const asOwner = fake.token({ id: U.ownerA }, { aal: 'aal2', totpAgeSec: 1 })
    for (const [name, handler] of Object.entries(ADMIN_ROUTES))
      expect((await call(handler, { token: asOwner })).status, name).toBe(403)
    for (const [who, id] of [
      ['gérant', U.managerA],
      ['caissier', U.cashierA],
      ['admin plateforme', U.admin],
    ] as const) {
      const token = fake.token({ id }, { aal: 'aal2', totpAgeSec: 1 })
      for (const [name, handler] of Object.entries(SHOP_ROUTES))
        expect((await call(handler, { token })).status, `${who} → ${name}`).toBe(403)
    }
  })

  it('un propriétaire désactivé ou d’une boutique suspendue est refusé', async () => {
    const token = fake.token({ id: U.ownerA })
    fake.tables.shops![0]!.status = 'blocked'
    expect((await call(listStaff, { token })).body.error?.code).toBe('shop_blocked')
    fake.tables.shops![0]!.status = 'active'
    fake.tables.profiles![0]!.is_active = false
    expect((await call(listStaff, { token })).status).toBe(403)
  })
})

describe('super admin : MFA (aal2) et ré-authentification', () => {
  it('« me » accepte aal1 (pour proposer la MFA) ; les autres routes exigent aal2', async () => {
    const aal1 = fake.token({ id: U.admin }, { aal: 'aal1' })
    expect((await call(me, { token: aal1 })).body.data).toEqual({ admin: true })
    for (const [name, handler] of Object.entries(ADMIN_ROUTES).filter(([n]) => n !== 'me')) {
      const r = await call(handler, { token: aal1 })
      expect([r.status, r.body.error?.code], name).toEqual([403, 'mfa_required'])
    }
  })
  it('les actions sensibles exigent un code TOTP récent (5 min)', async () => {
    const stale = adminToken(3600)
    const bodies: Array<[Handler, unknown]> = [
      [setShopStatus, { shop_id: SHOP_A, status: 'active' }],
      [resetPassword, { shop_id: SHOP_A }],
      [viewShopData, { shop_id: SHOP_A, reason: 'Demande du client' }],
      [
        updateSettings,
        {
          support_phone: '',
          support_whatsapp: '',
          terms_version: '2',
          terms_text: 'x',
          maintenance_message: null,
        },
      ],
    ]
    for (const [handler, body] of bodies) {
      const r = await call(handler, { token: stale, body })
      expect([r.status, r.body.error?.code]).toEqual([403, 'reauth_required'])
    }
    expect(
      (
        await call(setShopStatus, {
          token: adminToken(30),
          body: { shop_id: SHOP_A, status: 'active' },
        })
      ).status,
    ).toBe(200)
  })
  it('lecture : liste, détail, journal', async () => {
    const token = adminToken()
    expect((await call(listShops, { token })).body.data?.shops).toHaveLength(1)
    const detail = await call(shopDetail, { token, body: { shop_id: SHOP_A } })
    expect(detail.status).toBe(200)
    expect((detail.body.data?.staff as unknown[]).length).toBe(3)
    expect(
      (await call(shopDetail, { token, body: { shop_id: '99999999-0000-4000-8000-000000000000' } }))
        .status,
    ).toBe(404)
    expect((await call(auditLog, { token })).status).toBe(200)
  })
})

describe('création de boutique', () => {
  const body = {
    shop_name: 'Chez Sali',
    owner_name: 'Sali',
    phone: '70 12 34 56',
    password: 'Kd7-pomme-Zq',
  }
  it('crée le compte, la boutique, et journalise sans mot de passe', async () => {
    const r = await call(createShop, { token: adminToken(), body })
    expect(r.status).toBe(200)
    expect(r.body.data?.identifier).toBe('22670123456@shops.test')
    expect(fake.createdUsers[0]?.password).toBe(body.password)
    const entry = fake.tables.audit_log?.find((e) => e.action === 'create_shop')
    expect(JSON.stringify(entry)).not.toContain('pomme')
    expect(JSON.stringify(entry)).toContain('+226 70 ** ** 56')
  })
  it('annule le compte Auth si l’étape SQL échoue (pas de compte orphelin)', async () => {
    fake.failRpc.add('admin_create_shop')
    const r = await call(createShop, { token: adminToken(), body })
    expect(r.status).toBe(500)
    expect(fake.deletedUsers).toEqual([fake.createdUsers[0]?.id])
    expect(fake.tables.shops?.some((s) => s.name === 'Chez Sali')).toBe(false)
  })
  it('refuse mot de passe faible, téléphone invalide, doublon, champs inconnus', async () => {
    const token = adminToken()
    expect(
      (await call(createShop, { token, body: { ...body, password: '12345678' } })).body.error?.code,
    ).toBe('weak_password')
    expect(
      (await call(createShop, { token, body: { ...body, password: 'Chez Sali 2026' } })).body.error
        ?.code,
    ).toBe('weak_password')
    expect((await call(createShop, { token, body: { ...body, phone: '12345' } })).status).toBe(400)
    expect(
      (await call(createShop, { token, body: { ...body, status: 'blocked' } })).body.error?.code,
    ).toBe('invalid_input')
    await call(createShop, { token, body })
    expect((await call(createShop, { token, body })).body.error?.code).toBe('account_exists')
  })
})

describe('blocage et consultation détaillée', () => {
  it('bloquer exige un motif, met à jour la boutique et journalise', async () => {
    const token = adminToken(5)
    expect(
      (await call(setShopStatus, { token, body: { shop_id: SHOP_A, status: 'blocked' } })).status,
    ).toBe(400)
    const r = await call(setShopStatus, {
      token,
      body: { shop_id: SHOP_A, status: 'blocked', reason: 'Impayé', message: 'Appelez-nous' },
    })
    expect(r.status).toBe(200)
    expect(fake.tables.shops?.find((s) => s.id === SHOP_A)).toMatchObject({
      status: 'blocked',
      block_message: 'Appelez-nous',
      blocked_reason: 'Impayé',
    })
    expect(fake.tables.audit_log?.[0]).toMatchObject({
      action: 'block_shop',
      reason: 'Impayé',
      shop_id: SHOP_A,
      admin_user_id: U.admin,
    })
  })
  it('la consultation détaillée exige un motif et est journalisée avant la réponse', async () => {
    const token = adminToken(5)
    expect((await call(viewShopData, { token, body: { shop_id: SHOP_A } })).status).toBe(400)
    expect(
      (await call(viewShopData, { token, body: { shop_id: SHOP_A, reason: 'ok' } })).status,
    ).toBe(400)
    const r = await call(viewShopData, {
      token,
      body: { shop_id: SHOP_A, reason: 'Réclamation du commerçant' },
    })
    expect(r.status).toBe(200)
    expect(fake.tables.audit_log?.[0]).toMatchObject({
      action: 'view_shop_data',
      reason: 'Réclamation du commerçant',
    })
  })
  it('réinitialiser le mot de passe journalise sans le mot de passe', async () => {
    const r = await call(resetPassword, { token: adminToken(5), body: { shop_id: SHOP_A } })
    expect(r.status).toBe(200)
    expect(r.body.data?.password).toBe(fake.passwordUpdates[0]?.password)
    expect(JSON.stringify(fake.tables.audit_log)).not.toContain(String(r.body.data?.password))
    expect(fake.tables.profiles?.find((p) => p.user_id === U.ownerA)?.must_change_password).toBe(
      true,
    )
  })
})

describe('routes boutique : isolation, rôles, anti-escalade', () => {
  const owner = () => fake.token({ id: U.ownerA })
  it('aucun IDOR : un propriétaire ne touche pas aux personnes d’une autre boutique', async () => {
    expect(
      (await call(setStaffActive, { token: owner(), body: { user_id: U.cashierB, active: false } }))
        .status,
    ).toBe(404)
    expect(fake.tables.profiles?.find((p) => p.user_id === U.cashierB)?.is_active).toBe(true)
    expect(
      (await call(resetStaffPassword, { token: owner(), body: { user_id: U.cashierB } })).status,
    ).toBe(404)
    expect(fake.passwordUpdates).toHaveLength(0)
    const list = await call(listStaff, { token: owner() })
    expect(
      (list.body.data?.staff as Array<{ user_id: string }>).map((s) => s.user_id).sort(),
    ).toEqual([U.cashierA, U.managerA, U.ownerA].sort())
  })
  it('le corps ne peut pas imposer une boutique (champ refusé)', async () => {
    const r = await call(createStaff, {
      token: owner(),
      body: { full_name: 'X', phone: '70111111', role: 'cashier', shop_id: SHOP_B },
    })
    expect(r.body.error?.code).toBe('invalid_input')
    expect(fake.createdUsers).toHaveLength(0)
  })
  it('crée un caissier dans SA boutique, jamais un propriétaire ni un admin', async () => {
    const ok = await call(createStaff, {
      token: owner(),
      body: { full_name: 'Moussa', phone: '70 11 11 11', role: 'cashier' },
    })
    expect(ok.status).toBe(200)
    expect(ok.body.data?.identifier).toBe('+22670111111')
    expect(String(ok.body.data?.password)).toHaveLength(14)
    expect(fake.tables.profiles?.find((p) => p.full_name === 'Moussa')).toMatchObject({
      shop_id: SHOP_A,
      role: 'cashier',
    })
    expect(
      (
        await call(createStaff, {
          token: owner(),
          body: { full_name: 'Boss', phone: '70 22 22 22', role: 'owner' },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call(createStaff, {
          token: owner(),
          body: { full_name: 'Boss', phone: '70 22 22 22', role: 'platform_admin' },
        })
      ).status,
    ).toBe(400)
  })
  it('désactive un caissier et remet un mot de passe, sans toucher au propriétaire', async () => {
    expect(
      (await call(setStaffActive, { token: owner(), body: { user_id: U.cashierA, active: false } }))
        .status,
    ).toBe(200)
    expect(fake.tables.profiles?.find((p) => p.user_id === U.cashierA)?.is_active).toBe(false)
    expect(
      (await call(resetStaffPassword, { token: owner(), body: { user_id: U.cashierA } })).status,
    ).toBe(200)
    expect(
      (await call(resetStaffPassword, { token: owner(), body: { user_id: U.ownerA } })).status,
    ).toBe(404)
  })
  it('impossible de désactiver le dernier propriétaire', async () => {
    const r = await call(setStaffActive, {
      token: owner(),
      body: { user_id: U.ownerA, active: false },
    })
    expect([r.status, r.body.error?.code]).toEqual([409, 'last_owner'])
    expect(fake.tables.profiles?.find((p) => p.user_id === U.ownerA)?.is_active).toBe(true)
  })
  it('limitation de débit : 429 au-delà de 10 réinitialisations par heure', async () => {
    const codes: number[] = []
    for (let i = 0; i < 11; i++)
      codes.push(
        (await call(resetStaffPassword, { token: owner(), body: { user_id: U.cashierA } })).status,
      )
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true)
    expect(codes[10]).toBe(429)
    expect(
      (
        await call(resetStaffPassword, {
          token: owner(),
          body: { user_id: U.cashierA },
          ip: '9.9.9.9',
        })
      ).status,
    ).toBe(200)
  })
})

describe('réponses d’erreur', () => {
  it('ne fuient aucun détail interne', async () => {
    fake.explode = 'SECRET_DB_DETAIL connection to 10.0.0.5 refused'
    const r = await call(listShops, { token: adminToken() })
    expect(r.status).toBe(500)
    expect(r.body.error?.code).toBe('internal')
    expect(JSON.stringify(r.body)).not.toMatch(/SECRET_DB_DETAIL|10\.0\.0\.5/)
  })
  it('le journal retire tout ce qui ressemble à un secret', () => {
    expect(
      scrub({ password: 'x', api_key: 'y', token: 'z', shop: 'ok', phone: '+226 70 ** ** 56' }),
    ).toEqual({ shop: 'ok', phone: '+226 70 ** ** 56' })
  })
})

describe('demandes d’inscription (page d’accueil publique)', () => {
  const body = {
    full_name: 'Awa Traoré',
    shop_name: 'Boutique Awa',
    phone: '70 12 34 56',
    email: 'awa@example.com',
    country: 'Burkina Faso',
    city: 'Bobo-Dioulasso',
    activity: 'units',
    message: 'Je vends des unités.',
    consent: true,
  }
  const rows = () => fake.tables.signup_requests ?? []

  it('accepte une demande sans compte et l’enregistre proprement', async () => {
    const r = await call(signup, { body })
    expect([r.status, r.body.data]).toEqual([200, { received: true }])
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      full_name: 'Awa Traoré',
      phone: '70123456',
      activity: 'units',
    })
  })

  it('refuse la mauvaise méthode, les champs inconnus et les données invalides', async () => {
    expect((await call(signup, { method: 'GET', body })).status).toBe(405)
    for (const [i, bad] of [
      { ...body, extra: 1 },
      { ...body, phone: 'abc' },
      { ...body, full_name: 'A' },
      { ...body, activity: 'hacker' },
      { ...body, email: 'pas-un-email' },
      { ...body, consent: false },
      { ...body, message: 'x'.repeat(1001) },
    ].entries()) {
      // Une adresse différente à chaque essai, pour ne pas déclencher la limite de débit.
      const r = await call(signup, { body: bad, ip: `3.3.3.${i}` })
      expect([r.status, r.body.error?.code]).toEqual([400, 'invalid_input'])
    }
    expect(rows()).toHaveLength(0)
  })

  it('un robot (champ piège rempli) reçoit un « ok » mais rien n’est enregistré', async () => {
    const r = await call(signup, { body: { ...body, website: 'http://spam.example' } })
    expect([r.status, r.body.data]).toEqual([200, { received: true }])
    expect(rows()).toHaveLength(0)
  })

  it('même numéro déjà en attente : pas de doublon, même réponse', async () => {
    await call(signup, { body })
    const again = await call(signup, { body: { ...body, shop_name: 'Autre nom' }, ip: '2.2.2.2' })
    expect([again.status, again.body.data]).toEqual([200, { received: true }])
    expect(rows()).toHaveLength(1)
  })

  it('limite à 5 demandes par heure et par adresse IP', async () => {
    for (let i = 0; i < 5; i++)
      expect((await call(signup, { body: { ...body, phone: `7012345${i}` } })).status).toBe(200)
    const sixth = await call(signup, { body: { ...body, phone: '70999999' } })
    expect([sixth.status, sixth.body.error?.code]).toEqual([429, 'rate_limited'])
    // Une autre adresse n'est pas touchée.
    expect(
      (await call(signup, { body: { ...body, phone: '70888888' }, ip: '9.9.9.9' })).status,
    ).toBe(200)
  })

  it('plafond global quotidien', async () => {
    fake.rateCounts.set('signup:global', 300)
    const r = await call(signup, { body })
    expect([r.status, r.body.error?.code]).toEqual([429, 'rate_limited'])
  })

  it('une erreur interne ne fuit aucun détail', async () => {
    fake.explode = 'secret db detail'
    const r = await call(signup, { body })
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('secret')
  })

  it('une route publique sans limite de débit ne peut pas être définie', async () => {
    const { defineHandler } = await import('../../server/_lib/http')
    const { z } = await import('zod')
    expect(() =>
      defineHandler({ auth: 'public', schema: z.object({}), run: () => Promise.resolve(1) }),
    ).toThrow()
  })

  it('la lecture est réservée au super admin (MFA) et ne passe jamais par la route publique', async () => {
    await call(signup, { body })
    expect((await call(listSignups)).status).toBe(401)
    const asOwner = fake.token({ id: U.ownerA }, { aal: 'aal2', totpAgeSec: 1 })
    expect((await call(listSignups, { token: asOwner })).status).toBe(403)
    const list = await call(listSignups, { token: adminToken() })
    expect(list.status).toBe(200)
    expect(list.body.data?.requests as unknown[]).toHaveLength(1)
  })

  it('l’admin change le statut, ajoute une note, supprime (code récent) ; tout est journalisé', async () => {
    await call(signup, { body })
    const sid = String(rows()[0]?.id)
    const upd = await call(updateSignup, {
      token: adminToken(),
      body: { id: sid, status: 'contacted', admin_notes: 'Appelé' },
    })
    expect(upd.status).toBe(200)
    expect(rows()[0]).toMatchObject({ status: 'contacted', admin_notes: 'Appelé' })
    expect((await call(updateSignup, { token: adminToken(), body: { id: sid } })).status).toBe(400)
    const missing = '50000000-0000-4000-8000-0000000000ff'
    expect(
      (await call(updateSignup, { token: adminToken(), body: { id: missing, status: 'new' } }))
        .status,
    ).toBe(404)
    const stale = await call(deleteSignup, { token: adminToken(3600), body: { id: sid } })
    expect([stale.status, stale.body.error?.code]).toEqual([403, 'reauth_required'])
    expect((await call(deleteSignup, { token: adminToken(30), body: { id: sid } })).status).toBe(
      200,
    )
    expect(rows()).toHaveLength(0)
    const actions = (fake.tables.audit_log ?? []).map((a) => a.action)
    expect(actions).toEqual(['update_signup', 'delete_signup'])
  })

  it('créer le compte depuis une demande la passe à « créé » et la relie à la boutique', async () => {
    await call(signup, { body })
    const sid = String(rows()[0]?.id)
    const r = await call(createShop, {
      token: adminToken(),
      body: {
        shop_name: 'Boutique Awa',
        owner_name: 'Awa Traoré',
        phone: '70123456',
        password: 'Kd7-pomme-Zq',
        signup_id: sid,
      },
    })
    expect(r.status).toBe(200)
    expect(rows()[0]).toMatchObject({ status: 'created', shop_id: r.body.data?.shop_id })
  })
})
