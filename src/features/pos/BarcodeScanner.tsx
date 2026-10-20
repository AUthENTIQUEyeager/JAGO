import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { barcodeScanSupported } from './barcode'

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}
type DetectorCtor = new (options?: { formats?: string[] }) => Detector

export function BarcodeScanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!barcodeScanSupported()) {
      setError(
        'Le scan par caméra n’est pas disponible sur cet appareil. Utilisez un lecteur ou tapez le code.',
      )
      return
    }
    let stream: MediaStream | null = null
    let stopped = false
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
    const detector = new Ctor()
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s
        if (!video.current) return
        video.current.srcObject = s
        await video.current.play()
        const loop = async () => {
          if (stopped || !video.current) return
          try {
            const found = await detector.detect(video.current)
            const code = found[0]?.rawValue
            if (code) {
              onDetect(code)
              return
            }
          } catch {
            /* image pas prête : on réessaie */
          }
          setTimeout(() => void loop(), 300)
        }
        void loop()
      })
      .catch(() => {
        setError('Impossible d’utiliser la caméra. Autorisez-la dans les réglages du navigateur.')
      })
    return () => {
      stopped = true
      stream?.getTracks().forEach((t) => {
        t.stop()
      })
    }
  }, [onDetect])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex justify-end p-3">
        <Button variant="secondary" onClick={onClose}>
          <X className="h-5 w-5" aria-hidden="true" />
          Fermer
        </Button>
      </div>
      {error ? (
        <p role="alert" className="m-4 rounded-xl bg-white p-4 text-base">
          {error}
        </p>
      ) : (
        <video ref={video} className="min-h-0 flex-1 object-cover" playsInline muted />
      )}
    </div>
  )
}
