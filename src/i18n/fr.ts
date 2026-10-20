/** Dictionnaire central des textes visibles (français simple). Prêt pour d’autres langues plus tard. */
export const fr = {
  common: {
    loading: 'Chargement…',
    retry: 'Réessayer',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    close: 'Fermer',
    back: 'Retour',
  },
  nav: {
    cashier: 'Caisse',
    products: 'Produits',
    stock: 'Stock',
    customers: 'Clients',
    more: 'Plus',
    dashboard: 'Tableau de bord',
    sales: 'Ventes',
    suppliers: 'Fournisseurs',
    expenses: 'Dépenses',
    reports: 'Rapports',
    settings: 'Paramètres',
    control: 'Contrôle',
  },
  methods: {
    cash: 'Espèces',
    orange_money: 'Orange Money',
    moov_money: 'Moov Money',
    wave: 'Wave',
    other: 'Autre',
  },
  movements: {
    opening: 'Stock de départ',
    purchase: 'Entrée (achat)',
    sale: 'Vente',
    sale_void: 'Vente annulée',
    return_in: 'Retour',
    adjustment: 'Ajustement',
    loss: 'Perte',
  },
  ledger: { credit_sale: 'Vente à crédit', payment: 'Remboursement', adjustment: 'Ajustement' },
  shell: {
    mainNav: 'Navigation principale',
    skipToContent: 'Aller au contenu',
    moreHint: 'Les autres écrans de l’application.',
  },
  upcoming: {
    title: 'Cet écran n’est pas encore disponible',
    description:
      'Il sera ajouté dans une prochaine mise à jour. Le reste de l’application fonctionne.',
  },
  notFound: {
    title: 'Page introuvable',
    description: 'Cette adresse n’existe pas. Retournez à la caisse pour continuer.',
    action: 'Retour à la caisse',
  },
  errors: {
    boundaryTitle: 'Un problème est survenu sur cet écran',
    boundaryBody:
      'Les données enregistrées sur cet appareil ne sont pas touchées. Essayez de réafficher l’écran.',
    boundaryRetry: 'Réafficher l’écran',
    boundaryReload: 'Recharger l’application',
    envTitle: 'Configuration incomplète',
    envBody:
      'L’application ne peut pas démarrer, car des réglages sont manquants ou incorrects. Vérifiez le fichier .env (modèle : .env.example) :',
  },
} as const
