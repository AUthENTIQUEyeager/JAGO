# Conformité (Burkina Faso) : cadre technique

> Ce document prépare le travail ; **la partie juridique doit être validée par un juriste ou la CIL**. Cadre : loi n° 001-2021/AN du 30 mars 2021 sur la protection des données à caractère personnel ; autorité : Commission de l’Informatique et des Libertés (CIL), qui demande notamment une **déclaration préalable** des traitements et des mesures de sécurité adaptées.

## Traitements à déclarer

| Traitement                       | Données                                                  | Finalité                               | Accès                                                            |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| Comptes utilisateurs             | nom, téléphone (identifiant), rôle, dernières connexions | authentification, gestion du personnel | utilisateur, propriétaire de la boutique, administrateur         |
| Boutiques                        | nom, téléphone du propriétaire, notes internes, statut   | gestion du service                     | administrateur                                                   |
| Données de gestion du commerçant | produits, ventes, stock, dépenses                        | tenue du commerce                      | boutique ; administrateur : agrégats, détail seulement sur motif |
| Clients du commerçant            | nom, téléphone, adresse (facultative), crédit            | suivi des dettes                       | boutique                                                         |
| Journaux                         | actions d’administration, connexions                     | sécurité, preuve                       | administrateur                                                   |

## Rôles (à faire trancher par un juriste)

- Le **commerçant** est en principe responsable de traitement pour les données de ses clients ; l’**éditeur** de Jago agit comme **sous-traitant** pour ces données, et responsable de traitement pour les comptes et journaux.

## Minimisation

Seul le nécessaire est collecté (nom, téléphone, adresse facultative). **Aucune donnée sensible** (santé, biométrie, pièce d’identité). Pharmacies : **pas de dossier patient**.

## Transparence

Écran de conditions d’utilisation (modifiable par l’administrateur, version suivie) : données, finalités, **accès de l’administrateur** (agrégats ; détail seulement sur motif, tracé), possibilité de suspension, export, conservation. À compléter par une **politique de confidentialité** rédigée avec un juriste (contact, droits, durée).

## Droits des personnes

- **Export** : Paramètres → Données (JSON + CSV).
- **Suppression / anonymisation** d’une boutique ou d’un client sur demande : procédure SQL manuelle réalisée par l’administrateur et **tracée** dans le journal d’audit. Les tables de mouvements étant en ajout seulement, l’anonymisation passe par un script documenté et daté (désactiver temporairement le déclencheur concerné, tracer l’opération).
- **Conservation par défaut** proposée : suppression définitive 12 mois après la fin du contrat (à valider).

## Localisation des données

Région Supabase : ______ ; région Vercel : ______. Un transfert hors du Burkina Faso peut être soumis à des règles : **à vérifier auprès de la CIL**.

## Accès de l’administrateur

Agrégats par défaut. Toute consultation détaillée exige un **motif** non vide, une **MFA récente**, et est inscrite dans le journal d’audit non modifiable.
