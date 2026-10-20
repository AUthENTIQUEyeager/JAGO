// Vérifie le dossier dist/ : aucune clé secrète, aucun script inline (compatible avec la CSP).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
if (!existsSync(distDir)) {
  console.error('dist/ introuvable : lancez d’abord « npm run build ».')
  process.exit(1)
}

// Motifs interdits : le mot « service_role », une vraie clé « sb_secret_… » (avec son corps),
// ou le nom de la variable serveur. Une clé service au format JWT est aussi détectée par décodage.
const SECRET_PATTERNS = [/service_role/i, /sb_secret_[A-Za-z0-9_-]{16,}/, /SUPABASE_SERVICE/i]
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{5,}\.(eyJ[A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{5,}/g

function leakedServiceJwt(content) {
  for (const match of content.matchAll(JWT_PATTERN)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'))
      if (typeof payload.role === 'string' && payload.role.startsWith('service')) return true
    } catch {
      // Pas un vrai jeton : on ignore.
    }
  }
  return false
}
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.map',
  '.webmanifest',
  '.txt',
  '.svg',
])
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}

const problems = []
let filesChecked = 0
for (const file of walk(distDir)) {
  const extension = extname(file)
  if (!TEXT_EXTENSIONS.has(extension)) continue
  filesChecked += 1
  const content = readFileSync(file, 'utf8')
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) problems.push(`${file} : motif secret interdit ${String(pattern)}`)
  }
  if (leakedServiceJwt(content)) problems.push(`${file} : jeton de clé SERVICE détecté`)
  if (extension === '.html' && INLINE_SCRIPT.test(content)) {
    problems.push(`${file} : script inline détecté (interdit par la CSP)`)
  }
}

// ── PWA : manifeste complet, Service Worker sans cache d'API ni de données ──
function checkPwa() {
  const manifestPath = join(distDir, 'manifest.webmanifest')
  const swPath = join(distDir, 'sw.js')
  if (!existsSync(manifestPath) || !existsSync(swPath))
    return problems.push('manifest.webmanifest ou sw.js absent de dist/')
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const [key, expected] of [
    ['lang', 'fr'],
    ['display', 'standalone'],
    ['start_url', '/'],
    ['scope', '/'],
  ]) {
    if (m[key] !== expected) problems.push(`manifest : « ${key} » devrait valoir ${expected}`)
  }
  const icons = Array.isArray(m.icons) ? m.icons : []
  if (!icons.some((i) => i.sizes === '192x192')) problems.push('manifest : icône 192 absente')
  if (!icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'))
    problems.push('manifest : icône 512 absente')
  if (!icons.some((i) => i.purpose === 'maskable'))
    problems.push('manifest : icône maskable absente')
  const sw = readFileSync(swPath, 'utf8')
  if (!/denylist/.test(sw) || !sw.includes('api'))
    problems.push('sw.js : /api/ doit être exclu du repli de navigation')
  if (/NetworkFirst|StaleWhileRevalidate|CacheFirst|supabase/i.test(sw))
    problems.push('sw.js : aucun cache d’API ou de données n’est autorisé')
  if (!readFileSync(join(distDir, 'index.html'), 'utf8').includes('rel="manifest"'))
    problems.push('index.html : lien vers le manifeste absent')
}
checkPwa()

if (problems.length > 0) {
  console.error('Contrôle de dist/ ÉCHOUÉ :')
  for (const problem of problems) console.error(` - ${problem}`)
  process.exit(1)
}
console.log(`Contrôle de dist/ réussi (${filesChecked} fichiers texte vérifiés).`)
