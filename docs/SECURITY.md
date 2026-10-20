# Sécurité : contrôles, résultats et limites

> Aucune application n’est « 100 % sécurisée ». Ce document dit ce qui est en place, ce qui a été testé, et ce qui reste à faire.

## Contrôles en place

**Base de données (Postgres / RLS)**

- RLS **activée et forcée** sur toutes les tables ; `anon` n’a accès à rien ; aucun `DELETE` accordé.
- Fonctions d’autorisation dans le schéma `private` (non exposé) ; toutes les fonctions `SECURITY DEFINER` fixent `search_path = ''` et ne sont pas exécutables par `PUBLIC`/`anon`.
- Triggers : `shop_id` et `created_by` imposés par le serveur ; colonnes immuables ; tables de mouvements **en ajout seulement** (même la clé service) ; vente annulée jamais rétablie ; dernier propriétaire protégé ; prix d’achat du caissier fourni par le serveur.
- Prix d’achat dans `product_costs` (lecture réservée owner/manager).
- Contraintes `CHECK` (montants, quantités, longueurs, énumérations, cohérence des ventes).
- Journal d’audit **chaîné par hachage**, non modifiable.
- Boutique bloquée ou profil désactivé : toute lecture/écriture métier refusée **par la base**.

**Serveur (`/api`)**

- Refus par défaut : méthode, jeton, rôle, état de la boutique. Boutique déduite du profil, jamais du corps de la requête (anti-IDOR). Champs inconnus refusés. Corps limité à 20 Ko.
- Super admin : session **aal2 (MFA)** obligatoire ; actions sensibles (blocage, mot de passe, consultation détaillée, paramètres) exigent un **code TOTP de moins de 5 minutes**.
- Limitation de débit (fenêtre glissante, table dédiée). Erreurs génériques ; journaux sans secrets, téléphones masqués.
- Création de compte atomique avec annulation (pas de compte orphelin).

**Navigateur / PWA**

- CSP stricte, aucun script inline, aucune ressource tierce, en-têtes de sécurité (HSTS, nosniff, DENY, COOP, Permissions-Policy). Règle ESLint interdisant `dangerouslySetInnerHTML`.
- Service Worker : précache de l’application seulement, **aucun cache d’API** ni de données.
- Exports CSV protégés contre l’injection de formules. Import CSV limité (5 Mo / 10 000 lignes).
- Verrou PIN (PBKDF2, sel aléatoire, 210 000 itérations, délais, retour au mot de passe après 10 échecs sans perdre l’outbox).
- Mots de passe temporaires aléatoires (14 caractères), affichés une seule fois, jamais journalisés.

**Chaîne d’approvisionnement**

- Versions exactes, `npm ci`, `ignore-scripts=true`, audit en CI, Dependabot, scan de secrets, contrôle de `dist/` (clé service détectée aussi dans un JWT encodé).

## Tests automatiques (`npm run test:run`)

- **Base (pglite, vraies migrations)** : RLS forcée partout, `anon` sans accès, isolement entre boutiques (toutes les tables), anti-usurpation, droits du caissier, tables en ajout seulement, boutique bloquée, profil désactivé, fonctions `SECURITY DEFINER`, contraintes `CHECK`, annulation, conflits, audit chaîné, limitation de débit.
- **API** : 401/403/405, `aal2`, MFA récente, IDOR, champs inconnus, 429, retour arrière de création de compte, dernier propriétaire, erreurs sans fuite, journal sans mot de passe.
- **Synchronisation** : ordre, lots, idempotence, reprise après coupure, hors ligne, blocage/désactivation avec outbox conservée et reprise, doublon, rejet permanent, clés étrangères, 401, pages, curseur, conflits, ligne en attente non écrasée.
- **Local** : transaction atomique (panne simulée), annulation, stock sans double comptage, migration Dexie v1→v2.
- **Écrans** : tous les écrans, rôles, vente complète par l’interface.
- **Build** (`check:dist`) : pas de clé secrète, pas de script inline, PWA conforme ; `vercel.json` testé.

## Limites connues (à lire)

1. **Les données locales (IndexedDB) ne sont pas chiffrées.** Le PIN protège l’interface, pas le disque. Conseillez le verrouillage d’écran du téléphone. Chiffrement AES-GCM local : évolution V2.
2. **Hors ligne, une fraude (prix, remise) ne peut pas être empêchée**, seulement détectée et tracée (écran « Contrôle »).
3. Un blocage ou une désactivation prend effet **au retour du réseau** sur l’appareil concerné.
4. Le jeton de session est dans `localStorage` : risque XSS atténué par la CSP et l’absence de code tiers.
5. Le **code gérant** (remises) est vérifié sur l’appareil du caissier : son empreinte est donc lisible par les utilisateurs de la boutique. Un code de 4 chiffres peut être retrouvé par force brute. Toute vente hors limites reste signalée dans « Contrôle ».
6. Le caissier peut lire toutes les ventes et clients de sa boutique (nécessaire à la synchronisation) ; l’interface limite l’affichage, pas la base.
7. Le super admin reste un point unique de défaillance (protégé par MFA).
8. Les alertes « échecs de connexion répétés » ne sont pas dans `/admin` : consultez les journaux d’authentification Supabase.
9. `pending_count` de la boutique reflète le dernier appareil qui a synchronisé.

## Non vérifié dans cet environnement (à faire avant la vente)

- Migrations sur un **vrai projet Supabase** et **Security Advisor** (testées sur Postgres simulé, avec un `auth.uid()` factice).
- Adaptateur de synchronisation contre un vrai **PostgREST** (filtres `or`/horodatages) ; fonctions `/api` avec `vercel build`/`vercel dev` (imports `.js`, fichiers partagés `src/lib`).
- Audit **Lighthouse**, rendu et ergonomie sur de vrais téléphones, impression réelle, scan caméra.
- Parcours MFA réel (inscription TOTP, ré-authentification).
- **Test de restauration d’une sauvegarde** (date : ______).
- **Test d’intrusion simple par un humain indépendant** : recommandé avant la mise en vente.

## Liste de vérification des comptes (à cocher)

- [ ] 2FA : GitHub, Vercel, Supabase, registrar du domaine, email principal.
- [ ] Dépôt privé, `main` protégée, secrets uniquement dans Vercel / GitHub Secrets.
- [ ] Supabase : inscription publique OFF, anonymes OFF, MFA TOTP ON, Realtime OFF, rotation des jetons ON, Advisor sans alerte.
- [ ] Vercel : variables serveur « sensibles », portée Production ; prévisualisations sans clés de production.
- [ ] CSP avec l’adresse exacte (`STRICT_CSP=1 npm run check:csp`).
- [ ] Deux super admins, codes de récupération MFA hors ligne.
- [ ] Plan Supabase/Vercel compatible **usage commercial** et sauvegardes.
- [ ] Supervision externe de disponibilité de l’URL.
