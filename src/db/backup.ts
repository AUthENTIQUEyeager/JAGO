import { toCsv } from '@/lib/csv'
import { tableOf, type JagoDb } from './dexie'
import { SYNC_TABLES } from './schemas'

export interface BackupFile {
  app: string
  version: number
  exported_at: string
  tables: Record<string, unknown[]>
  outbox: unknown[]
  outbox_failed: unknown[]
}

/** Export complet (JSON) : toutes les tables + les éléments non envoyés. Filet de sécurité et sauvegarde. */
export async function exportBackup(db: JagoDb, now = new Date()): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const name of SYNC_TABLES) tables[name] = await tableOf(db, name).toArray()
  return {
    app: 'jago',
    version: 1,
    exported_at: now.toISOString(),
    tables,
    outbox: await db.outbox.toArray(),
    outbox_failed: await db.outbox_failed.toArray(),
  }
}

/** Uniquement ce qui n'est pas encore sur le serveur. */
export async function exportUnsent(
  db: JagoDb,
  now = new Date(),
): Promise<{ exported_at: string; outbox: unknown[]; outbox_failed: unknown[] }> {
  return {
    exported_at: now.toISOString(),
    outbox: await db.outbox.toArray(),
    outbox_failed: await db.outbox_failed.toArray(),
  }
}

/** Un fichier CSV par table (Excel). */
export async function exportCsvFiles(
  db: JagoDb,
): Promise<Array<{ name: string; content: string }>> {
  const files: Array<{ name: string; content: string }> = []
  for (const name of SYNC_TABLES) {
    const rows = (await tableOf(db, name).toArray()) as Array<Record<string, unknown>>
    const header = Object.keys(rows[0] ?? { id: '' })
    files.push({
      name: `${name}.csv`,
      content: toCsv(
        header,
        rows.map((r) =>
          header.map((h) =>
            typeof r[h] === 'object' && r[h] !== null
              ? JSON.stringify(r[h])
              : (r[h] as string | number | boolean | null | undefined),
          ),
        ),
      ),
    })
  }
  return files
}
