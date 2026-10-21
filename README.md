# Jago

Logiciel de gestion de commerce (caisse, stock, crédits clients, dépenses, rapports) qui **fonctionne sans internet** et se synchronise au retour du réseau. Application web installable (PWA), pensée pour les téléphones Android d’entrée de gamme. Le nom « Jago » est provisoire : il se change dans `src/config/brand.ts`.

## Ce que contient le dépôt

| Dossier     | Contenu                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/`      | Application React (caisse, produits, stock, clients, dépenses, rapports, contrôle, paramètres, interface super admin) |
| `api/`      | Points d’entrée Vercel : 2 fonctions seulement (`admin/[action]`, `shop/[action]`), limite du plan Hobby              |
| `server/`   | Handlers serveur (administration, personnel) regroupés par ces points d’entrée                                        |
| `supabase/` | Migrations SQL (schéma, sécurité RLS), `seed.sql`, `config.toml`                                                      |
| `tests/`    | Tests de la base (RLS), de l’API et de la configuration                                                               |
| `scripts/`  | Création du super admin, contrôles de sécurité, icônes                                                                |
| `docs/`     | Architecture, décisions, déploiement, recette, sécurité, incidents, conformité                                        |

## Prérequis

- **Node.js 22** (ou 20.19+) et npm.
- Pour une vraie utilisation : un projet **Supabase** et un compte **Vercel** (voir `docs/DEPLOY.md`, pas à pas).

## Lancer en local

```bash
npm ci                    # installe exactement les versions du package-lock.json
cp .env.example .env      # puis renseignez VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_AUTH_EMAIL_DOMAIN
npm run dev               # http://localhost:5173
```

Sans `.env` valide, l’application affiche « Configuration incomplète » et liste ce qui manque. Les fonctions `/api` ne tournent pas avec `npm run dev` (elles demandent Vercel : `npx vercel dev`) ; tout le reste (caisse, stock, hors ligne) fonctionne.

## Commandes

| Commande                                      | Rôle                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview`           | Développement, production, aperçu                                           |
| `npm run typecheck` · `lint` · `format:check` | Qualité du code                                                             |
| `npm run test:run`                            | Tous les tests (base de données RLS, API, synchronisation, écrans)          |
| `npm run check:dist`                          | Contrôle de `dist/` : aucune clé secrète, aucun script inline, PWA conforme |
| `npm run scan:secrets`                        | Recherche de secrets dans les fichiers suivis par Git                       |
| `npm run security:check`                      | Enchaîne tout ce qui précède + audit des dépendances                        |
| `npm run admin:create`                        | Crée le premier super admin (voir `docs/DEPLOY.md`)                         |

## Variables d’environnement

Voir `.env.example`. **La clé secrète `service_role` ne doit jamais être dans une variable `VITE_*`** : elle serait envoyée à tous les navigateurs. L’application refuse de démarrer dans ce cas, et le build est contrôlé.

## Comment ça marche (en bref)

1. L’écran lit et écrit **uniquement** dans la base du téléphone (IndexedDB).
2. Chaque action est ajoutée à une file d’envoi ; un moteur de synchronisation l’envoie quand le réseau revient (sans doublon, dans l’ordre).
3. Le stock et les dettes sont des **journaux de mouvements** : deux appareils hors ligne ne s’écrasent jamais.
4. La sécurité est dans la base (RLS) et sur le serveur, jamais seulement dans l’interface.

## Documentation

`docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/DEPLOY.md` · `docs/RECETTE.md` · `docs/SECURITY.md` · `docs/INCIDENTS.md` · `docs/CONFORMITE.md` · `docs/THREAT_MODEL.md`
