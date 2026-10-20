// Avec STRICT_CSP=1 (déploiement), échoue si le joker *.supabase.co est encore dans la CSP.
import { readFileSync } from 'node:fs'
const text = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
const wildcard = text.includes('*.supabase.co')
if (wildcard && process.env.STRICT_CSP === '1') {
  console.error(
    'CSP : le joker https://*.supabase.co doit être remplacé par l’adresse exacte (node scripts/set-csp-host.mjs <url>).',
  )
  process.exit(1)
}
console.log(
  wildcard
    ? 'CSP : joker *.supabase.co présent (autorisé en développement ; interdit avec STRICT_CSP=1).'
    : 'CSP : adresse Supabase exacte.',
)
