/** Fuseau de l'application : Africa/Ouagadougou = UTC+0, sans heure d'été. */
export const TIME_ZONE = 'Africa/Ouagadougou'

const parts = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** « 18/10/2026 14:05 » */
export function formatDateTime(value: string | Date): string {
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day ?? ''}/${p.month ?? ''}/${p.year ?? ''} ${p.hour ?? ''}:${p.minute ?? ''}`
}

export function formatDate(value: string | Date): string {
  return formatDateTime(value).slice(0, 10)
}

export function formatTime(value: string | Date): string {
  return formatDateTime(value).slice(11)
}

/** « 2026-10-18 » du jour local (UTC+0). */
export function dayKey(value: string | Date): string {
  return toDate(value).toISOString().slice(0, 10)
}

export function startOfDay(value: string | Date): Date {
  return new Date(`${dayKey(value)}T00:00:00.000Z`)
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000)
}

export type Period = 'today' | '7d' | 'month' | 'custom'
export interface DateRange {
  from: string
  to: string
}

/** Bornes ISO [from, to[ d'une période. `custom` : jours « yyyy-MM-dd » inclus. */
export function periodRange(
  period: Period,
  now: Date,
  custom?: { from: string; to: string },
): DateRange {
  const today = startOfDay(now)
  if (period === 'today') return { from: today.toISOString(), to: addDays(today, 1).toISOString() }
  if (period === '7d')
    return { from: addDays(today, -6).toISOString(), to: addDays(today, 1).toISOString() }
  if (period === 'month') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    return { from: first.toISOString(), to: addDays(today, 1).toISOString() }
  }
  const from = custom ? startOfDay(`${custom.from}T00:00:00Z`) : today
  const to = custom ? addDays(startOfDay(`${custom.to}T00:00:00Z`), 1) : addDays(today, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function inRange(iso: string, range: DateRange): boolean {
  return iso >= range.from && iso < range.to
}

export function todayInput(now = new Date()): string {
  return dayKey(now)
}
