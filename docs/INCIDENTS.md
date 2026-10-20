# Procédures d’incident

Gardez la tête froide : **l’application continue de fonctionner hors ligne**, les ventes ne sont pas perdues.

## (a) Compte super admin compromis

1. Supabase → Authentication → Users : **supprimez ou désactivez** le compte compromis ; sur le second super admin, **changez le mot de passe** et **réinitialisez la MFA**.
2. Consultez `/admin → Journal d’audit` : repérez les actions suspectes (blocages, réinitialisations, consultations détaillées).
3. Rotation de la clé service (voir b) par précaution. Prévenez les commerçants dont les données ont été consultées (voir modèle).

## (b) Fuite de la clé `service_role`

1. Supabase → Project Settings → API : **régénérez** la clé secrète.
2. Vercel → Environment Variables : mettez à jour `SUPABASE_SERVICE_ROLE_KEY` → **redéployez**.
3. Vérifiez : connexion admin, création d’une boutique de test. Consultez le journal d’audit et les logs Supabase.
4. Si la clé a été publiée dans Git : `git filter-repo` / dépôt neuf, et considérez toute donnée comme potentiellement consultée → (d).

## (c) Appareil volé ou perdu

1. Propriétaire : Paramètres → Personnel → **Désactiver** la personne (refusée dès que l’appareil a du réseau) et **réinitialiser son mot de passe**.
2. Si c’est le propriétaire : le super admin réinitialise le mot de passe et, au besoin, bloque la boutique.
3. Rappel : les données locales ne sont pas chiffrées (voir SECURITY.md).

## (d) Un commerçant signale une fuite de données

1. Ne supprimez rien. Notez date, boutique, symptômes. Consultez le journal d’audit (consultations détaillées) et les logs d’authentification.
2. Bloquez la boutique si nécessaire (message neutre). Corrigez la cause, changez les mots de passe concernés.
3. **Violation de données personnelles** : avertissez la **CIL** (autorité burkinabè de protection des données) dans les délais légaux et informez les personnes concernées — à valider avec un juriste.

## (e) Données supprimées ou corrompues

1. Supabase → Database → Backups : restauration à un instant donné (**sur un projet de test d’abord**), ou restauration de la sauvegarde `age` : `age -d -i cle.txt backup.sql.gz.age | gunzip | psql "$URL_DE_TEST"`.
2. Les appareils conservent leurs données locales : après restauration, ils renvoient ce qui manque (idempotent, sans doublon).
3. Exportez d’abord les « éléments non envoyés » des appareils concernés (Paramètres → Synchronisation).

## (f) Panne Supabase ou Vercel

- **Ne rien faire de risqué** : les commerçants continuent de vendre hors ligne.
- Message type : « Notre service rencontre une panne. Continuez à vendre normalement : vos ventes sont enregistrées sur votre téléphone et seront envoyées automatiquement au retour du service. »
- Activez au besoin le bandeau de maintenance (Admin → Plateforme).
- Suivez les pages d’état de Supabase et Vercel.

## Modèle de message aux clients

> Bonjour, nous avons détecté [incident] le [date]. Données concernées : [liste]. Ce que nous avons fait : [actions]. Ce que vous devez faire : [changer votre mot de passe…]. Contact : [téléphone du support].
