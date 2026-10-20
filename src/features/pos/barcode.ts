/** L'API BarcodeDetector n'existe pas partout : on la détecte, sinon un message clair est affiché. */
export function barcodeScanSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}
