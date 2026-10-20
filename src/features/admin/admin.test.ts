import { describe, expect, it } from 'vitest'
import { alertsFor, type ShopRow } from './shops'

const shop = (over: Partial<ShopRow> = {}): ShopRow => ({
  shop_id: 's',
  name: 'B',
  owner_phone: null,
  status: 'active',
  last_seen_at: new Date().toISOString(),
  pending_count: 0,
  app_version: '1.0.0',
  device_clock_skew_seconds: 0,
  sales_today: 0,
  sales_count_today: 0,
  ...over,
})

describe('alertes de la plateforme', () => {
  it('signale inactivité, synchronisations bloquées et horloge décalée', () => {
    const now = Date.parse('2026-10-20T10:00:00Z')
    expect(alertsFor(shop({ last_seen_at: '2026-10-20T09:00:00Z' }), now)).toEqual([])
    expect(alertsFor(shop({ last_seen_at: '2026-10-10T09:00:00Z' }), now)[0]).toContain('Inactive')
    expect(alertsFor(shop({ last_seen_at: null }), now)[0]).toContain('Inactive')
    expect(
      alertsFor(shop({ last_seen_at: '2026-10-20T09:00:00Z', pending_count: 120 }), now)[0],
    ).toContain('120')
    expect(
      alertsFor(
        shop({ last_seen_at: '2026-10-20T09:00:00Z', device_clock_skew_seconds: 1800 }),
        now,
      )[0],
    ).toContain('Horloge')
    expect(alertsFor(shop({ status: 'blocked', last_seen_at: null }), now)).toEqual([])
  })
})
