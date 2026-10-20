/** Télécharge un texte (CSV, JSON) sans serveur : fichier créé dans le navigateur. */
export function downloadText(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}
