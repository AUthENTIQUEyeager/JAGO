export const ACTIVITY_OPTIONS = [
  { value: 'shop', label: 'Boutique, commerce, alimentation' },
  { value: 'units', label: 'Vente d’unités et transferts d’argent' },
  { value: 'print', label: 'Impression, photocopie, rédaction, cybercafé' },
  { value: 'other', label: 'Autre activité' },
] as const

export const COUNTRIES = ['Burkina Faso', 'Côte d’Ivoire', 'Haïti', 'Autre pays']

export const EMPTY = {
  full_name: '',
  shop_name: '',
  phone: '',
  email: '',
  country: 'Burkina Faso',
  city: '',
  activity: 'shop',
  message: '',
  consent: false,
  website: '', // champ piège (robots)
}

export type Errors = Partial<
  Record<'full_name' | 'shop_name' | 'phone' | 'email' | 'consent', string>
>

/** Mêmes règles que le serveur (qui reste le seul juge) : sert à guider la personne avant l'envoi. */
export function validateSignup(f: typeof EMPTY): Errors {
  const e: Errors = {}
  if (f.full_name.trim().length < 2) e.full_name = 'Indiquez votre nom.'
  if (f.shop_name.trim().length < 2) e.shop_name = 'Indiquez le nom de votre commerce.'
  if (!/^\+?\d{8,18}$/.test(f.phone.replace(/[\s.\-()]/g, '')))
    e.phone = 'Numéro invalide (au moins 8 chiffres).'
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    e.email = 'Adresse e-mail invalide.'
  if (!f.consent) e.consent = 'Vous devez accepter d’être contacté pour continuer.'
  return e
}
