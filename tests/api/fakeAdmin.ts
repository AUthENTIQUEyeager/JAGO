import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>
export interface DbError {
  code?: string
  message: string
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Faux client Supabase « service » en mémoire : juste assez pour tester les routes /api. */
export class FakeAdmin {
  tables: Record<string, Row[]> = {
    platform_admins: [],
    profiles: [],
    shops: [],
    audit_log: [],
    signup_requests: [],
    platform_settings: [{ id: 1 }],
  }
  tokens = new Map<string, { id: string; email: string }>()
  deletedUsers: string[] = []
  createdUsers: Array<{ id: string; email: string; password: string }> = []
  passwordUpdates: Array<{ id: string; password: string }> = []
  rateCounts = new Map<string, number>()
  failRpc = new Set<string>()
  explode: string | null = null

  /** Fabrique un jeton (JWT lisible) pour un utilisateur, avec les revendications voulues. */
  token(
    user: { id: string; email?: string },
    claims: { aal?: string; totpAgeSec?: number } = {},
  ): string {
    const amr =
      claims.totpAgeSec === undefined
        ? []
        : [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - claims.totpAgeSec }]
    const t = `${b64({ alg: 'HS256' })}.${b64({ sub: user.id, aal: claims.aal ?? 'aal1', amr })}.sig${this.tokens.size}`
    this.tokens.set(t, { id: user.id, email: user.email ?? `${user.id}@t.app` })
    return t
  }

  auth = {
    getUser: (token: string) => {
      const user = this.tokens.get(token)
      return Promise.resolve(
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'bad jwt' } },
      )
    },
    admin: {
      createUser: ({ email, password }: { email: string; password: string }) => {
        if (this.createdUsers.some((u) => u.email === email))
          return Promise.resolve({
            data: { user: null },
            error: { message: 'User already registered' },
          })
        const user = { id: randomUUID(), email, password }
        this.createdUsers.push(user)
        return Promise.resolve({ data: { user }, error: null })
      },
      deleteUser: (id: string) => {
        this.deletedUsers.push(id)
        return Promise.resolve({ data: null, error: null })
      },
      updateUserById: (id: string, patch: { password: string }) => {
        this.passwordUpdates.push({ id, password: patch.password })
        return Promise.resolve({ data: { user: { id, email: `${id}@t.app` } }, error: null })
      },
    },
  }

  from(table: string) {
    return new Query(this, table)
  }

  rpc(name: string, args: Row) {
    if (this.explode) return Promise.resolve({ data: null, error: { message: this.explode } })
    if (this.failRpc.has(name))
      return Promise.resolve({ data: null, error: { message: 'rpc failed' } })
    switch (name) {
      case 'rate_limit_hit': {
        const key = String(args.p_key)
        const n = (this.rateCounts.get(key) ?? 0) + 1
        this.rateCounts.set(key, n)
        return Promise.resolve({ data: n <= Number(args.p_limit), error: null })
      }
      case 'admin_create_shop': {
        const shop = randomUUID()
        this.tables.shops?.push({ id: shop, name: args.p_shop_name, status: 'active' })
        this.tables.profiles?.push({
          user_id: args.p_user_id,
          shop_id: shop,
          role: 'owner',
          is_active: true,
          full_name: args.p_owner_name,
        })
        return Promise.resolve({ data: shop, error: null })
      }
      case 'admin_overview':
        return Promise.resolve({ data: [{ shop_id: 'x', name: 'B' }], error: null })
      case 'admin_shop_stats':
        return Promise.resolve({ data: { revenue_30d: 0 }, error: null })
      case 'admin_shop_sales':
        return Promise.resolve({ data: [{ id: 's1', total: 1000 }], error: null })
      default:
        return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
    }
  }

  addShop(id: string, status = 'active'): void {
    this.tables.shops?.push({ id, name: `Boutique ${id.slice(0, 4)}`, status })
  }
  addProfile(p: {
    user_id: string
    shop_id: string
    role: string
    is_active?: boolean
    phone?: string
  }): void {
    this.tables.profiles?.push({
      full_name: 'X',
      is_active: true,
      phone: null,
      last_seen_at: null,
      ...p,
    })
  }
}

class Query implements PromiseLike<{ data: unknown; error: DbError | null }> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private patch: Row = {}
  private filters: Array<[string, unknown]> = []
  private max = Infinity
  private single = false
  constructor(
    private readonly db: FakeAdmin,
    private readonly table: string,
  ) {}
  select() {
    return this
  }
  insert(row: Row) {
    this.op = 'insert'
    this.patch = row
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value])
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }

  private run(): { data: unknown; error: DbError | null } {
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = [])
    if (this.op === 'insert') {
      // Réplique les valeurs par défaut SQL de signup_requests.
      const defaults = this.table === 'signup_requests' ? { id: randomUUID(), status: 'new' } : {}
      rows.push({ ...defaults, ...this.patch })
      return { data: null, error: null }
    }
    const hit = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v))
    if (this.op === 'delete') {
      for (const r of hit) rows.splice(rows.indexOf(r), 1)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    if (this.op === 'update') {
      for (const r of hit) {
        // Réplique le trigger SQL « dernier propriétaire ».
        if (
          this.table === 'profiles' &&
          r.role === 'owner' &&
          r.is_active === true &&
          this.patch.is_active === false &&
          !rows.some(
            (o) => o.shop_id === r.shop_id && o.role === 'owner' && o.is_active === true && o !== r,
          )
        ) {
          return {
            data: null,
            error: { code: '23514', message: 'Impossible : dernier propriétaire de la boutique' },
          }
        }
      }
      for (const r of hit) Object.assign(r, this.patch)
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    const out = hit.slice(0, this.max).map((r) => ({ ...r }))
    return { data: this.single ? (out[0] ?? null) : out, error: null }
  }
  then<T, U>(
    ok?: (v: { data: unknown; error: DbError | null }) => T | PromiseLike<T>,
    bad?: (e: unknown) => U | PromiseLike<U>,
  ) {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, bad)
  }
}
