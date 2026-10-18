# Architecture de Jago

> État : **Phase 0 terminée** (socle). Les sections marquées _(à venir)_ décrivent le plan suivi par les phases suivantes.

## 1. Principes

1. **Offline-first** : l’interface lit et écrit **uniquement dans Dexie** (IndexedDB). Jamais d’appel Supabase direct depuis un écran pour les données métier.
2. **Le serveur est la défense** : toute règle de sécurité vit dans la base (RLS, triggers, contraintes) et dans `/api`. L’interface n’est qu’un affichage.
3. **Rien ne s’écrase** : stock et dettes clients sont des **journaux de mouvements** (ajout seulement). Le stock affiché = somme des mouvements. Deux appareils hors ligne ne se contredisent donc jamais.
4. **Rien ne se perd** : suppressions douces (`deleted_at`), outbox conservée même en cas de blocage, de désactivation ou de déconnexion forcée.

## 2. Schéma

```
 Téléphone / PC du commerçant                    Cloud
┌──────────────────────────────────┐      ┌─────────────────────────────┐
│ PWA React                        │      │ Vercel                      │
│  ├─ UI (écrans)                  │      │  ├─ front statique (dist)   │
│  ├─ Dexie (IndexedDB) ◄─ SOURCE  │      │  └─ /api/* (fonctions admin)│
│  │   DE VÉRITÉ LOCALE            │      │        │ clé service        │
│  ├─ Outbox (file d’envoi)        │      │        ▼                    │
│  ├─ Moteur de sync ──────────────┼─────►│ Supabase                    │
│  └─ Service Worker (app shell)   │ HTTPS│  ├─ Auth                    │
└──────────────────────────────────┘      │  ├─ Postgres + RLS          │
                                          │  └─ RPC / triggers          │
                                          └─────────────────────────────┘
```

## 3. Dossiers (réalité de la Phase 0)

| Dossier                                         | Rôle                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/config/`                                   | `brand.ts` (nom, couleurs), `env.ts` (validation des variables), `navigation.ts` |
| `src/components/`                               | Composants UI communs (Button, Input, Modal, Toast, Tabs, Badge…)                |
| `src/features/`                                 | Un dossier par domaine métier (Phase 5 et suivantes). `shell/` = pages de cadre  |
| `src/i18n/fr.ts`                                | Dictionnaire central des textes visibles                                         |
| `src/lib/`                                      | Fonctions pures (`cn` pour l’instant ; `money`, `phone`, `dates`… en Phase 3)    |
| `src/db/`, `src/sync/`, `src/auth/`, `src/pwa/` | _(à venir)_ Phases 2, 3, 4, 10                                                   |
| `api/`, `supabase/`                             | _(à venir)_ Phases 1 et 9                                                        |
| `tests/`                                        | Tests qui lisent des fichiers du dépôt (ex. `vercel.json`)                       |
| `scripts/`                                      | Outils : `check-dist.mjs` (contrôle du build)                                    |

## 4. Flux d’écriture _(à venir, Phase 3)_

Action utilisateur → repository (`salesRepo.createSale()`) → **une seule transaction Dexie** qui écrit : lignes métier + mouvements de stock + écritures de crédit + `stock_cache` + lignes d’`outbox`, dans l’ordre des dépendances (la vente avant ses lignes). Tout ou rien.

## 5. Flux de sync _(à venir, Phase 4)_

- **Push** : outbox traitée dans l’ordre de `seq`, lots ≤ 100 lignes de la même table, `upsert … onConflict: id` (idempotent ; `ignoreDuplicates` pour les tables en ajout seulement). Suppression de l’outbox **après** confirmation du serveur.
- **Pull** : curseur `(server_updated_at, id)` par table, pages de 500, `bulkPut` idempotent.
- **Erreurs** : réseau → `offline` + reprise ; RLS `42501` ou boutique `blocked` → `blocked`, pause totale, rien n’est supprimé ; `23505` = succès ; `23503` = réessayer puis `outbox_failed` ; 4xx permanent = `outbox_failed` visible.

## 6. Règles de conflit _(à venir)_

« La dernière modification gagne » (`updated_at`), sans jamais écraser une ligne locale qui a une entrée en attente dans l’outbox. Les tables de mouvements sont en ajout seulement : pas de conflit possible.

## 7. Authentification et blocage _(à venir, Phases 1, 2, 9)_

Identifiant = numéro de téléphone → email technique `{id}@{domaine}`. Création des comptes uniquement côté serveur. Session conservée hors ligne ; **jamais de déconnexion sur simple erreur réseau**. Le blocage d’une boutique est appliqué par la RLS (le vrai verrou) ; l’écran « Accès suspendu » n’est qu’un affichage.

## 8. PWA _(à venir, Phase 10)_

`vite-plugin-pwa` en `generateSW`, mise à jour sur demande (jamais en pleine vente), précache de l’app shell seulement, **aucun cache d’API** dans le Service Worker.

## 9. Sécurité

Voir `docs/THREAT_MODEL.md` et l’addendum sécurité. Déjà en place en Phase 0 : CSP stricte et en-têtes (testés), aucun script inline, règle ESLint interdisant `dangerouslySetInnerHTML`, refus d’une clé secrète dans les variables du navigateur, contrôle de `dist/` (`npm run check:dist`).

## 10. Avancement

| Phase | Contenu                          | État        |
| ----- | -------------------------------- | ----------- |
| 0     | Socle                            | ✅ Terminée |
| 1–12  | Base, auth, local, sync, métier… | À faire     |
