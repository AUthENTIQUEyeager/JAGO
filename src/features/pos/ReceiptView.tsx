import { Printer, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import {
  browserPrinter,
  receiptLines,
  receiptText,
  whatsappUrl,
  type ReceiptData,
} from '@/lib/receipt'

/** Aperçu et impression du ticket (texte uniquement : aucun HTML injecté). */
export function ReceiptView({
  data,
  customerPhone,
}: {
  data: ReceiptData
  customerPhone?: string | null
}) {
  const [phone, setPhone] = useState(customerPhone ?? '')
  const url = whatsappUrl(phone, receiptText(data))
  return (
    <div className="space-y-3">
      <div
        className="receipt-print overflow-x-auto rounded-xl border border-neutral-300 bg-white p-3"
        style={{ width: data.paper === 58 ? '58mm' : '80mm', maxWidth: '100%' }}
      >
        <pre className="whitespace-pre font-mono text-[11px] leading-tight text-black">
          {receiptLines(data).join('\n')}
        </pre>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void browserPrinter.print(data)}>
          <Printer className="h-5 w-5" aria-hidden="true" />
          Imprimer
        </Button>
      </div>
      <div className="space-y-2 rounded-xl bg-neutral-100 p-3">
        <Input
          label="Envoyer par WhatsApp au numéro"
          inputMode="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value)
          }}
          placeholder="70 12 34 56"
        />
        {url ? (
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-400 px-4 text-base font-semibold text-brand-900"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
            Ouvrir WhatsApp
          </a>
        ) : phone ? (
          <p className="text-sm text-red-800">Numéro invalide (8 chiffres attendus).</p>
        ) : null}
      </div>
    </div>
  )
}
