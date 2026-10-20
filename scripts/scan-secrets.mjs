// Recherche de secrets dans les fichiers suivis par Git (équivalent léger de gitleaks, sans dépendance).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const BINARY = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|zip|lock)$|package-lock\.json$/i
const PATTERNS = [
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'clé privée'],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, 'clé secrète Supabase (sb_secret_…)'],
  [/AKIA[0-9A-Z]{16}/, 'clé d’accès AWS'],
  [/(SERVICE_ROLE_KEY|SERVICE_KEY)\s*[=:]\s*["']?eyJ/, 'valeur de clé service assignée'],
  [/ghp_[A-Za-z0-9]{36}/, 'jeton GitHub'],
]
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g

const problems = []
for (const file of files) {
  if (BINARY.test(file)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const [pattern, label] of PATTERNS)
    if (pattern.test(text)) problems.push(`${file} : ${label}`)
  for (const m of text.matchAll(JWT)) {
    try {
      const role = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role
      if (typeof role === 'string' && role.startsWith('service'))
        problems.push(`${file} : jeton de clé service`)
    } catch {
      /* pas un jeton */
    }
  }
}
if (problems.length) {
  console.error('Secrets détectés :')
  problems.forEach((p) => console.error(` - ${p}`))
  process.exit(1)
}
console.log(`Scan de secrets propre (${files.length} fichiers suivis).`)
