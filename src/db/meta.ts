import { z } from 'zod'
import { newDeviceShort, newId } from '@/lib/id'
import type { JagoDb } from './dexie'

export async function getMeta<T>(
  db: JagoDb,
  key: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  const row = await db.meta.get(key)
  if (!row) return undefined
  const parsed = schema.safeParse(row.value)
  return parsed.success ? parsed.data : undefined
}

export async function setMeta(db: JagoDb, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export interface DeviceIdentity {
  deviceId: string
  deviceShort: string
}

/** Identité de l'appareil, créée une fois à l'installation (sert aux reçus et aux traces). */
export async function ensureDeviceIdentity(db: JagoDb): Promise<DeviceIdentity> {
  const idSchema = z.string().min(8)
  let deviceId = await getMeta(db, 'device_id', idSchema)
  let deviceShort = await getMeta(db, 'device_short', z.string().length(4))
  if (!deviceId || !deviceShort) {
    deviceId = newId()
    deviceShort = newDeviceShort()
    await db.transaction('rw', db.meta, async () => {
      await setMeta(db, 'device_id', deviceId)
      await setMeta(db, 'device_short', deviceShort)
    })
  }
  return { deviceId, deviceShort }
}

/** Numéro de reçu : AAMMJJ-appareil-compteur du jour. À appeler dans une transaction qui inclut `meta`. */
export async function nextReceiptNo(db: JagoDb, now: Date, deviceShort: string): Promise<string> {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '')
  const key = `receipt_counter:${day}`
  const next = ((await getMeta(db, key, z.number())) ?? 0) + 1
  await setMeta(db, key, next)
  return `${day.slice(2)}-${deviceShort}-${next}`
}
