// Crée le PREMIER super admin (compte Auth + ligne platform_admins). À lancer une seule fois, depuis votre poste.
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD (14 caractères minimum).
// Usage : npm run admin:create
import { createClient } from '@supabase/supabase-js'
import { validatePassword } from '../src/lib/password.ts'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    'Variables manquantes : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD.',
  )
  process.exit(1)
}
const problem = validatePassword(ADMIN_PASSWORD, {
  minLength: 14,
  forbidden: [ADMIN_EMAIL.split('@')[0] ?? ''],
})
if (problem) {
  console.error(`Mot de passe refusé : ${problem}`)
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const created = await admin.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,
})
if (created.error || !created.data.user) {
  console.error(`Création du compte impossible : ${created.error?.message ?? 'erreur inconnue'}`)
  process.exit(1)
}
const inserted = await admin.from('platform_admins').insert({ user_id: created.data.user.id })
if (inserted.error) {
  await admin.auth.admin.deleteUser(created.data.user.id) // pas de compte orphelin
  console.error(`Enregistrement impossible : ${inserted.error.message}`)
  process.exit(1)
}
console.log(
  `Super admin créé : ${ADMIN_EMAIL}. Connectez-vous : la vérification en deux étapes (TOTP) sera configurée à la première connexion.`,
)
console.log(
  'Créez un SECOND super admin de secours et rangez les codes de récupération hors ligne.',
)
