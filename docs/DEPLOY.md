# Déploiement pas à pas (débutant)

Durée : environ 1 heure. Vous aurez besoin d’un compte **GitHub**, **Supabase** et **Vercel**, avec la **double authentification (2FA) activée sur chacun**.

## 1. Préparer le code

1. Créez un dépôt GitHub **privé** et poussez-y ce dossier :
   ```bash
   git remote add origin https://github.com/VOTRE-COMPTE/jago.git
   git push -u origin main
   ```
2. Dans GitHub → Settings → Branches : protégez la branche `main` (pull request + CI obligatoires).

## 2. Créer le projet Supabase

1. supabase.com → **New project**. Choisissez une région proche de vos clients (ex. Europe) et notez la région dans `docs/CONFORMITE.md`. **Utilisez un plan avec sauvegardes automatiques** : le plan gratuit ne convient pas à des clients payants (vérifiez les conditions actuelles).
2. **Authentication → Sign In / Providers** : désactivez **Allow new users to sign up** et **Allow anonymous sign-ins**.
3. **Authentication → Multi-Factor** : activez **TOTP** (obligatoire pour le super admin).
4. **Authentication → Sessions** : gardez la durée du jeton par défaut ; la rotation des jetons de rafraîchissement doit rester activée.
5. **Database → Extensions** / **Realtime** : Realtime n’est pas utilisé, laissez-le désactivé. Aucun stockage de fichiers (Storage) n’est utilisé.
6. **SQL Editor** : collez et exécutez, **dans cet ordre**, le contenu de :
   `supabase/migrations/0001_init.sql` → `0002_functions.sql` → `0003_rls.sql` → `0004_signup_requests.sql` → `supabase/seed.sql`.
   (Projet déjà en ligne : exécutez seulement `0004_signup_requests.sql` pour activer les demandes d’inscription de la page d’accueil.)
   (Ou avec la CLI Supabase : `supabase link` puis `supabase db push`.)
7. **Project Settings → API Keys** : notez l’**URL du projet**, la clé **publique** (anon / publishable) et la clé **secrète** (service_role). Ne partagez jamais la clé secrète.
8. **Database → Advisors** : lancez le **Security Advisor** et le **Performance Advisor** ; corrigez chaque avertissement ou justifiez-le dans `docs/SECURITY.md`.

## 3. Créer le premier super admin

Sur votre ordinateur, **sans enregistrer ces valeurs dans un fichier du dépôt** :

```bash
export SUPABASE_URL="https://VOTRE-PROJET.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="la clé secrète"
export ADMIN_EMAIL="vous@exemple.com"
export ADMIN_PASSWORD="un mot de passe de 14 caractères ou plus"
npm run admin:create
```

À la première connexion, l’application vous fait configurer la **vérification en deux étapes** (scannez le QR avec Google Authenticator, Aegis…). **Créez un second super admin de secours** et rangez les codes de récupération **hors ligne** (papier).

## 4. Tester en local

```bash
cp .env.example .env     # renseignez les 3 variables VITE_* (clé PUBLIQUE seulement)
npm run dev
```

## 5. Déployer sur Vercel

1. vercel.com → **Add New → Project** → importez le dépôt GitHub. Framework : **Vite** (détecté).
2. **Settings → Environment Variables**, portée **Production uniquement** :

   | Nom                         | Valeur                    | Sensible |
   | --------------------------- | ------------------------- | -------- |
   | `VITE_SUPABASE_URL`         | URL du projet             | non      |
   | `VITE_SUPABASE_ANON_KEY`    | clé **publique**          | non      |
   | `VITE_AUTH_EMAIL_DOMAIN`    | ex. `shops.jago.app`      | non      |
   | `SUPABASE_URL`              | URL du projet             | oui      |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé **secrète**           | **oui**  |
   | `AUTH_EMAIL_DOMAIN`         | même valeur que ci-dessus | non      |

   Les déploiements de **prévisualisation** ne doivent **jamais** recevoir les clés de production (créez un projet Supabase « staging » si vous voulez les utiliser).

3. **Avant le premier déploiement**, resserrez la CSP sur l’adresse exacte de votre projet :
   ```bash
   node scripts/set-csp-host.mjs https://VOTRE-PROJET.supabase.co
   STRICT_CSP=1 npm run check:csp
   git commit -am "CSP : adresse Supabase exacte" && git push
   ```
4. Déployez. Ouvrez l’adresse fournie.

## 6. Nom de domaine

Vercel → Settings → Domains : ajoutez votre domaine et suivez les instructions DNS. Activez la 2FA chez votre registrar.

## 7. Premier test complet

1. Connectez-vous avec le super admin (email + mot de passe) → configurez la MFA.
2. **Boutiques → Créer une boutique** → générez un mot de passe → copiez la fiche d’identifiants.
3. Ouvrez l’application dans une fenêtre privée, connectez-vous avec l’identifiant (téléphone) et le mot de passe temporaire → choisissez un nouveau mot de passe → acceptez les conditions.
4. Créez un produit, faites une vente, vérifiez l’indicateur « Synchronisé ».
5. Dans **Plateforme**, renseignez le téléphone du support (affiché sur l’écran « Accès suspendu »).

## 8. Sauvegardes

1. Vérifiez que votre plan Supabase inclut les sauvegardes automatiques.
2. Sauvegarde logique chiffrée : dans GitHub → Settings → Secrets, ajoutez `SUPABASE_DB_URL` et `BACKUP_AGE_RECIPIENT` (clé publique `age`) ; le workflow `.github/workflows/backup.yml` s’exécute chaque semaine.
3. **Testez une restauration avant le lancement**, puis chaque trimestre, et notez la date dans `docs/SECURITY.md`.

## 9. Mises à jour

Poussez sur `main` : la CI vérifie, Vercel déploie. Les utilisateurs voient « Nouvelle version disponible » et choisissent le moment (jamais en pleine vente).
