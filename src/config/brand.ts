/**
 * Identité de la marque : le seul endroit à modifier pour changer le nom ou les couleurs.
 * Utilisé par l’interface, Tailwind (couleurs) et index.html (nom, couleur de thème).
 */
export const brand = {
  name: 'Jago',
  tagline: 'Votre commerce, même sans internet',
  description:
    'Caisse, stock, crédits clients et rapports pour les commerçants. Fonctionne sans connexion.',
  colors: {
    themeColor: '#155c43',
    backgroundColor: '#f4f7f3',
    surface: '#f4f7f3',
    /** Vert profond */
    primary: {
      50: '#effaf3',
      100: '#d7f1e0',
      200: '#b1e2c6',
      300: '#7fcba5',
      400: '#4aae80',
      500: '#2a9066',
      600: '#1b7452',
      700: '#155c43',
      800: '#134a37',
      900: '#113d2f',
    },
    /** Ambre */
    accent: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    },
  },
} as const
