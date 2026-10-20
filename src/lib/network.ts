const NETWORK_RE = /fetch|network|timeout|timed out|failed to load|load failed|abort|connection/i

/** Une erreur de connexion (pas de réseau) se distingue d'une réponse explicite du serveur. */
export function isNetworkError(
  error: { message?: string; status?: number; code?: string | null } | null | undefined,
): boolean {
  if (!error) return false
  if (error.status === 0) return true
  return !error.code && NETWORK_RE.test(error.message ?? '')
}
