import {
  ArrowRight,
  BarChart3,
  Boxes,
  LogIn,
  Printer,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Store,
  Users,
  WifiOff,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonStyles } from '@/components/button-styles'
import { brand } from '@/config/brand'
import { SignupForm } from './SignupForm'

const BENEFITS = [
  {
    icon: WifiOff,
    title: 'Vendez même sans internet',
    text: 'La caisse continue de fonctionner quand le réseau coupe. Tout s’envoie tout seul dès que la connexion revient.',
  },
  {
    icon: ShoppingCart,
    title: 'Une caisse rapide',
    text: 'Encaissez en quelques touches, au comptant ou à crédit, avec un reçu à imprimer ou à envoyer.',
  },
  {
    icon: Boxes,
    title: 'Un stock toujours juste',
    text: 'Chaque vente met le stock à jour. Vous êtes prévenu avant la rupture, fini les mauvaises surprises.',
  },
  {
    icon: Users,
    title: 'Les crédits clients sous contrôle',
    text: 'Sachez qui vous doit quoi, fixez des limites et notez chaque remboursement.',
  },
  {
    icon: BarChart3,
    title: 'Vos bénéfices en clair',
    text: 'Ventes du jour, produits qui marchent, dépenses et bénéfice : tout est calculé pour vous.',
  },
  {
    icon: ShieldCheck,
    title: 'Vos données en sécurité',
    text: 'Accès par rôle (propriétaire, gérant, caissier), sauvegarde et protection contre la fraude.',
  },
]

const ACTIVITIES = [
  {
    icon: Store,
    title: 'Boutiques et commerces',
    text: 'Produits, stock, fournisseurs, dépenses et rapports.',
  },
  {
    icon: Smartphone,
    title: 'Unités et transferts',
    text: 'Vendez des unités à montant libre et suivez votre bénéfice sur chaque recharge.',
  },
  {
    icon: Printer,
    title: 'Impression et rédaction',
    text: 'Photocopie, impression, scan, saisie de documents : facturez à la page ou au document.',
  },
]

const STEPS = [
  'Remplissez la demande ci-dessous, cela prend une minute.',
  'Nous vous contactons pour comprendre votre activité.',
  'Votre compte est créé : vous pouvez vendre dès aujourd’hui.',
]

function Section({ id, children, tone }: { id?: string; children: ReactNode; tone?: 'soft' }) {
  return (
    <section id={id} className={tone === 'soft' ? 'bg-brand-50' : ''}>
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">{children}</div>
    </section>
  )
}

/** Page d'accueil publique : explique l'intérêt du logiciel et reçoit les demandes d'inscription. */
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <span className="text-2xl font-bold text-brand-800">{brand.name}</span>
          <nav aria-label="Navigation" className="flex items-center gap-2">
            <a href="#inscription" className="hidden px-3 text-base font-semibold sm:block">
              Demander un compte
            </a>
            <Link to="/connexion" className={buttonStyles({ variant: 'secondary' })}>
              <LogIn className="h-5 w-5" aria-hidden="true" />
              Se connecter
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-brand-900 text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-2 md:items-center md:py-24">
            <div className="space-y-5">
              <p className="inline-block rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
                Pour les commerçants d’Afrique de l’Ouest
              </p>
              <h1 className="text-4xl font-bold leading-tight md:text-5xl">{brand.tagline}</h1>
              <p className="text-lg text-brand-100">
                {brand.name} est la caisse et le cahier de gestion de votre commerce : ventes,
                stock, crédits clients et bénéfices, sur votre téléphone ou votre ordinateur.
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#inscription" className={buttonStyles({ variant: 'accent', size: 'lg' })}>
                  Demander mon compte
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </a>
                <a
                  href="#avantages"
                  className="inline-flex min-h-14 items-center px-4 text-lg font-semibold text-white underline underline-offset-4"
                >
                  Découvrir les avantages
                </a>
              </div>
            </div>
            <ul className="grid gap-3 text-base">
              {[
                'Fonctionne sans connexion internet',
                'Simple : utilisable dès le premier jour',
                'Plusieurs vendeurs, chacun avec ses droits',
                'Vos chiffres du jour en un coup d’œil',
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 font-semibold"
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Section id="avantages">
          <h2 className="text-3xl font-bold text-brand-900">Pourquoi choisir {brand.name} ?</h2>
          <p className="mt-2 max-w-2xl text-lg text-neutral-700">
            Tout ce qu’il faut pour gérer votre commerce sans cahier, sans calcul à la main et sans
            stress.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <li key={b.title} className="rounded-2xl border border-neutral-200 p-5">
                <b.icon className="h-8 w-8 text-brand-700" aria-hidden="true" />
                <h3 className="mt-3 text-xl font-bold">{b.title}</h3>
                <p className="mt-1 text-base text-neutral-700">{b.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section tone="soft">
          <h2 className="text-3xl font-bold text-brand-900">Adapté à votre activité</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {ACTIVITIES.map((a) => (
              <li key={a.title} className="rounded-2xl bg-white p-5 shadow-sm">
                <a.icon className="h-8 w-8 text-brand-700" aria-hidden="true" />
                <h3 className="mt-3 text-xl font-bold">{a.title}</h3>
                <p className="mt-1 text-base text-neutral-700">{a.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section>
          <h2 className="text-3xl font-bold text-brand-900">Comment ça marche ?</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className="flex items-start gap-4 rounded-2xl border border-neutral-200 p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-lg font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-base">{s}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="inscription" tone="soft">
          <div className="mx-auto max-w-xl space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-brand-900">Demandez votre compte</h2>
              <p className="mt-2 text-lg text-neutral-700">
                Laissez vos informations : nous vous rappelons pour créer votre compte.
              </p>
            </div>
            <SignupForm />
            <p className="text-center text-base">
              Vous avez déjà un compte ?{' '}
              <Link to="/connexion" className="font-semibold text-brand-800 underline">
                Se connecter
              </Link>
            </p>
          </div>
        </Section>
      </main>

      <footer className="bg-neutral-900 px-5 py-8 text-center text-sm text-neutral-300">
        © {new Date().getFullYear()} {brand.name}. Tous droits réservés.
      </footer>
    </div>
  )
}
