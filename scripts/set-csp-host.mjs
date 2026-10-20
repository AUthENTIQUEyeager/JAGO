// Remplace le joker https://*.supabase.co de la CSP par l'adresse EXACTE de votre projet.
// Usage : node scripts/set-csp-host.mjs https://VOTRE-PROJET.supabase.co
import { readFileSync, writeFileSync } from 'node:fs'

const raw = process.argv[2]
let host
try {
  const url = new URL(raw ?? '')
  if (url.protocol !== 'https:') throw new Error('https requis')
  host = url.origin
} catch {
  console.error('Usage : node scripts/set-csp-host.mjs https://VOTRE-PROJET.supabase.co')
  process.exit(1)
}
const path = new URL('../vercel.json', import.meta.url)
const text = readFileSync(path, 'utf8')
if (!text.includes('https://*.supabase.co') && !text.includes(host)) {
  console.error(
    'connect-src ne contient ni le joker ni cette adresse : vérifiez vercel.json à la main.',
  )
  process.exit(1)
}
writeFileSync(path, text.replaceAll('https://*.supabase.co', host))
console.log(`CSP mise à jour : connect-src 'self' ${host}`)
