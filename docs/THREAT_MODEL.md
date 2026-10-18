# Modèle de menaces (version initiale, Phase 0)

Document vivant : chaque phase le complète avec ses contrôles et ses tests.

| Menace                     | Exemple concret                                          | Réponse principale                                                        | Phase       |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- | ----------- |
| Accès inter-boutiques      | Un commerçant lit les ventes d’un autre                  | RLS stricte + tests automatiques                                          | 1           |
| Fraude interne             | Caissier baisse un prix, annule une vente, vide du stock | Rôles, colonnes immuables, traçabilité, écran « Contrôle »                | 1, 6        |
| Attaque sur les comptes    | Essais de mots de passe sur des numéros de téléphone     | Mots de passe aléatoires forts, limitation de débit, erreurs génériques   | 2, 9        |
| Super admin compromis      | Prise de contrôle de **toutes** les boutiques            | MFA obligatoire (aal2), ré-authentification, audit inviolable             | 2, 9        |
| Appareil volé ou perdu     | Accès hors ligne aux données                             | Verrou PIN, désactivation à distance (au retour du réseau), limites dites | 2           |
| Faille web                 | XSS, injection CSV, clickjacking                         | CSP stricte, échappement, en-têtes, protection des exports                | **0**, 5, 8 |
| Chaîne d’approvisionnement | Dépendance npm piégée                                    | Peu de dépendances, versions figées, `ignore-scripts`, audit              | **0**       |
| Erreur du développeur      | Clé secrète dans le navigateur, table sans RLS           | Tests automatiques qui font échouer le build                              | **0**, 1    |
| Abus de l’administrateur   | Consultation de données sans raison                      | Agrégats par défaut, consultation détaillée motivée et tracée             | 9           |
| Perte de données / panne   | Suppression, corruption, projet suspendu                 | Sauvegardes testées, export, procédures de reprise                        | 12          |

## Contrôles déjà en place (Phase 0)

- **CSP et en-têtes** dans `vercel.json`, vérifiés par `tests/config/vercel.test.ts` (pas de `unsafe-eval`, pas de script inline, pas de cadre, pas d’objet).
- **Aucun script inline** dans `dist/index.html` (`npm run check:dist`).
- **Aucune clé secrète dans le navigateur** : refus au démarrage (`env.ts`) et contrôle de `dist/` par texte **et** par décodage des JWT.
- **XSS** : règle ESLint bloquante sur `dangerouslySetInnerHTML`.
- **Dépendances** : versions exactes, aucun script d’installation, `npm audit` documenté (voir `DECISIONS.md`).

## Limites connues à ce stade

- La CSP autorise provisoirement `https://*.supabase.co` (décision D-014).
- Aucun test d’intrusion ni revue humaine indépendante n’a encore eu lieu.
