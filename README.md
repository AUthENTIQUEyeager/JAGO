# Jago

Logiciel de gestion de commerce (caisse, stock, crédits clients, dépenses, rapports) qui **fonctionne sans internet** et se synchronise au retour du réseau. Le nom « Jago » est provisoire : il se change dans `src/config/brand.ts`.

> **État : Phase 0 (socle).** Le cadre de l’application, les composants de base, la sécurité des en-têtes et les contrôles de build sont en place. Les écrans métier arrivent phase par phase (voir `docs/ARCHITECTURE.md`).

## Prérequis

- Node.js **20.19+ ou 22.12+** et npm.

## Démarrer

```bash
npm ci                       # installe exactement les versions du package-lock.json
cp .env.example .env         # puis renseignez les trois variables VITE_*
npm run dev                  # http://localhost:5173
```

Sans `.env` valide, l’application affiche un écran « Configuration incomplète » qui liste ce qui manque.

## Commandes

| Commande                 | Rôle                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `npm run dev`            | Serveur de développement                                      |
| `npm run build`          | Vérification TypeScript + build de production                 |
| `npm run typecheck`      | Vérification TypeScript seule                                 |
| `npm run lint`           | ESLint                                                        |
| `npm run format:check`   | Vérifie le format (Prettier) ; `npm run format` le corrige    |
| `npm run test:run`       | Tests (une fois)                                              |
| `npm run check:dist`     | Contrôle de `dist/` : aucune clé secrète, aucun script inline |
| `npm run security:check` | Tests + build + contrôle de `dist/` + audit des dépendances   |

## Variables d’environnement

Voir `.env.example`. Règle absolue : **la clé secrète « service » ne va jamais dans une variable `VITE_*`** (elle serait envoyée à tous les navigateurs). Le démarrage et le build refusent cette erreur.

## Documentation

`docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/THREAT_MODEL.md`
