# Recette : checklist de tests manuels

Cochez chaque ligne sur un **vrai téléphone Android** (Chrome) et, si possible, un iPhone et un PC. Les tests automatiques ne remplacent pas cette recette.

## A. Installation

- [ ] Android/Chrome : le bouton « Installer l’application » apparaît ; l’icône est correcte sur l’écran d’accueil (y compris en forme ronde).
- [ ] iPhone/Safari : Partager → Sur l’écran d’accueil ; l’encart d’aide s’affiche dans Paramètres → Appareil.
- [ ] Lighthouse (Chrome DevTools → Lighthouse → PWA) : « Installable » et fonctionne hors ligne.

## B. Scénario hors ligne (critère n°2)

1. [ ] Installer, se connecter, attendre « Synchronisé ».
2. [ ] **Couper le réseau** (mode avion).
3. [ ] Faire **10 ventes** dont 2 à crédit (avec un client) et 1 avec paiements multiples (ex. 5 000 espèces + 2 000 Orange Money).
4. [ ] Faire 1 entrée de stock et 1 dépense.
5. [ ] **Fermer complètement l’application puis la rouvrir hors ligne** : tout est là, la caisse fonctionne.
6. [ ] **Rétablir le réseau** : l’indicateur passe à « Synchronisé », « 0 en attente ».
7. [ ] Sur un **second appareil** : mêmes ventes, même stock, mêmes soldes clients, **aucun doublon**.

## C. Blocage par l’administrateur (critère n°3)

- [ ] Le super admin bloque la boutique (motif + message) après une MFA fraîche.
- [ ] Sur le téléphone : écran « Accès suspendu » (téléphone du support, boutons Appeler / WhatsApp, message).
- [ ] Faire des ventes avant le blocage hors ligne : elles sont **conservées** pendant le blocage.
- [ ] Le super admin débloque : l’écran se ferme (au prochain essai ou « Réessayer ») et l’envoi **reprend**, sans doublon.
- [ ] Désactiver un caissier depuis Paramètres → Personnel : il est refusé dès qu’il a du réseau.

## D. Comptes et sécurité

- [ ] Première connexion : changement de mot de passe obligatoire, puis conditions d’utilisation.
- [ ] Mauvais mot de passe : message générique (« Identifiant ou mot de passe incorrect »), délai après plusieurs essais.
- [ ] Code PIN : verrouillage après inactivité ; 10 erreurs → retour à la connexion, **ventes non envoyées conservées**.
- [ ] Caissier : ne voit pas le prix d’achat, ni Rapports/Contrôle/Dépenses ; ne peut pas annuler une vente.
- [ ] Remise du caissier au-delà du plafond : code du gérant demandé, ou vente « signalée » dans Contrôle.
- [ ] Super admin : pas d’accès sans MFA ; consultation détaillée = motif obligatoire, visible dans le journal.

## E. Caisse, stock, clients

- [ ] Recherche sans accents ; code-barres (lecteur USB = saisie clavier ; caméra si disponible, message clair sinon).
- [ ] Quantité décimale (kg), remise par ligne et globale, panier en attente puis repris.
- [ ] Crédit sans client : refusé. Plafond de crédit dépassé : avertissement non bloquant.
- [ ] Annulation d’une vente : stock remis, dette corrigée, vente marquée « annulée » (jamais supprimée).
- [ ] Encaissement d’une dette ; relevé WhatsApp.
- [ ] Inventaire : seuls les écarts créent des ajustements.
- [ ] Import CSV : aperçu, erreurs ligne par ligne ; export CSV ouvert dans Excel (accents, séparateur `;`).

## F. Impression et partage

- [ ] Ticket 58 mm et 80 mm (aperçu d’impression) : largeur correcte, mention « Reçu — ne vaut pas facture certifiée ».
- [ ] Partage du reçu par WhatsApp avec un numéro +226.

## G. Mises à jour et robustesse

- [ ] Déployer une nouvelle version : le bandeau apparaît ; le bouton est inactif pendant une vente en cours.
- [ ] Paramètres → Synchronisation : export des données non envoyées fonctionne.
- [ ] Heure du téléphone décalée de 20 min : avertissement affiché.
- [ ] Console du navigateur : **aucune violation CSP**.
