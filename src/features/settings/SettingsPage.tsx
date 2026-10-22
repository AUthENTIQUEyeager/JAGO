import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Input } from '@/components/Input'
import { PageHeader, Card } from '@/components/PageHeader'
import { Select } from '@/components/Select'
import { TabPanel, Tabs } from '@/components/Tabs'
import { useToast } from '@/components/toast/useToast'
import { useAuth, useSession } from '@/auth/context'
import { useLock } from '@/auth/lock-context'
import { createPinRecord, validatePinFormat } from '@/auth/pin'
import { isManager } from '@/db/ctx'
import { exportBackup, exportCsvFiles, exportUnsent } from '@/db/backup'
import { applyTheme } from '@/config/applyTheme'
import { brand } from '@/config/brand'
import { ACCENT_PRESETS, PRIMARY_PRESETS } from '@/config/theme'
import { fr } from '@/i18n/fr'
import { formatDateTime } from '@/lib/dates'
import { downloadText } from '@/lib/download'
import { passwordStrength, validatePassword } from '@/lib/password'
import {
  isIos,
  isStandalone,
  readStorage,
  requestPersistence,
  type StorageInfo,
} from '@/pwa/storage'
import { useSyncEngine, useSyncStatus } from '@/sync/context'
import { APP_VERSION } from '@/sync/version'
import { StaffTab } from './StaffTab'

export default function SettingsPage() {
  const { profile } = useSession()
  const owner = profile.role === 'owner'
  const manager = isManager({ role: profile.role })
  const tabs = [
    ...(owner
      ? [
          { id: 'shop', label: 'Boutique' },
          { id: 'staff', label: 'Personnel' },
        ]
      : []),
    { id: 'security', label: 'Sécurité' },
    { id: 'sync', label: 'Synchronisation' },
    ...(manager ? [{ id: 'data', label: 'Données' }] : []),
    { id: 'device', label: 'Appareil' },
  ]
  const [tab, setTab] = useState(tabs[0]?.id ?? 'security')
  return (
    <div className="space-y-4">
      <PageHeader title={fr.nav.settings} />
      <Tabs
        idPrefix="set"
        ariaLabel="Sections des paramètres"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />
      {owner ? (
        <TabPanel idPrefix="set" id="shop" active={tab === 'shop'}>
          <ShopTab />
        </TabPanel>
      ) : null}
      {owner ? (
        <TabPanel idPrefix="set" id="staff" active={tab === 'staff'}>
          <StaffTab />
        </TabPanel>
      ) : null}
      <TabPanel idPrefix="set" id="security" active={tab === 'security'}>
        <SecurityTab />
      </TabPanel>
      <TabPanel idPrefix="set" id="sync" active={tab === 'sync'}>
        <SyncTab />
      </TabPanel>
      {manager ? (
        <TabPanel idPrefix="set" id="data" active={tab === 'data'}>
          <DataTab />
        </TabPanel>
      ) : null}
      <TabPanel idPrefix="set" id="device" active={tab === 'device'}>
        <DeviceTab />
      </TabPanel>
    </div>
  )
}

function ColorPicker({
  label,
  presets,
  defaultHex,
  value,
  onChange,
}: {
  label: string
  defaultHex: string
  presets: ReadonlyArray<{ name: string; hex: string | null }>
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-base font-semibold">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => {
          const selected = (p.hex ?? '') === value
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange(p.hex ?? '')
              }}
              className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-base ${selected ? 'border-neutral-900 font-bold' : 'border-neutral-300'}`}
            >
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-full border border-neutral-400"
                style={{ backgroundColor: p.hex ?? defaultHex }}
              />
              {p.name}
            </button>
          )
        })}
        <label className="flex min-h-11 items-center gap-2 text-base">
          Autre
          <input
            type="color"
            aria-label={`${label} personnalisée`}
            value={value || defaultHex}
            onChange={(e) => {
              onChange(e.target.value)
            }}
            className="h-11 w-14 rounded-lg border border-neutral-400 bg-white p-1"
          />
        </label>
      </div>
    </fieldset>
  )
}

function ShopTab() {
  const { supabase, refresh } = useAuth()
  const { shop, settings } = useSession()
  const toast = useToast()
  const [f, setF] = useState({
    name: shop.name,
    address: settings.address,
    phone: settings.phone,
    footer: settings.footer,
    paper: String(settings.paper),
    cap: String(settings.discount_cap_pct),
    idle: String(settings.idle_minutes),
    editPrice: settings.cashier_can_edit_price,
    discount: settings.cashier_can_discount,
    managerPin: '',
  })
  const [colors, setColors] = useState({
    primary: settings.theme?.primary ?? '',
    accent: settings.theme?.accent ?? '',
  })
  // Aperçu immédiat ; si on quitte sans enregistrer, les couleurs enregistrées reviennent.
  useEffect(() => {
    applyTheme({ primary: colors.primary || undefined, accent: colors.accent || undefined })
  }, [colors])
  useEffect(
    () => () => {
      applyTheme(settings.theme)
    },
    [settings.theme],
  )
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    let manager_pin = settings.manager_pin
    if (f.managerPin) {
      const problem = validatePinFormat(f.managerPin)
      if (problem) {
        toast.error(problem)
        return setBusy(false)
      }
      manager_pin = await createPinRecord(f.managerPin)
    }
    const next = {
      address: f.address,
      phone: f.phone,
      footer: f.footer,
      paper: f.paper === '80' ? 80 : 58,
      cashier_can_edit_price: f.editPrice,
      cashier_can_discount: f.discount,
      discount_cap_pct: Math.min(100, Math.max(0, Number(f.cap) || 0)),
      idle_minutes: Math.min(120, Math.max(1, Math.round(Number(f.idle) || 5))),
      ...(colors.primary || colors.accent
        ? {
            theme: {
              ...(colors.primary ? { primary: colors.primary } : {}),
              ...(colors.accent ? { accent: colors.accent } : {}),
            },
          }
        : {}),
      ...(manager_pin ? { manager_pin } : {}),
    }
    const { error } = await supabase.rpc('update_shop_settings', {
      p_name: f.name,
      p_settings: next,
    })
    if (error) toast.error('Enregistrement impossible. Vérifiez votre connexion internet.')
    else {
      toast.success('Paramètres enregistrés.')
      await refresh()
    }
    setBusy(false)
  }
  const set = (k: keyof typeof f, v: string | boolean) => {
    setF((p) => ({ ...p, [k]: v }))
  }
  return (
    <Card className="space-y-3">
      <Input
        label="Nom de la boutique"
        value={f.name}
        onChange={(e) => {
          set('name', e.target.value)
        }}
      />
      <Input
        label="Adresse (sur le ticket)"
        value={f.address}
        onChange={(e) => {
          set('address', e.target.value)
        }}
      />
      <Input
        label="Téléphone (sur le ticket)"
        value={f.phone}
        onChange={(e) => {
          set('phone', e.target.value)
        }}
      />
      <Input
        label="Message en bas du ticket"
        value={f.footer}
        onChange={(e) => {
          set('footer', e.target.value)
        }}
      />
      <Select
        label="Largeur du papier"
        value={f.paper}
        onChange={(v) => {
          set('paper', v)
        }}
        options={[
          { value: '58', label: '58 mm' },
          { value: '80', label: '80 mm' },
        ]}
      />
      <h2 className="pt-2 text-lg font-bold">Couleurs du logiciel</h2>
      <ColorPicker
        label="Couleur principale"
        presets={PRIMARY_PRESETS}
        defaultHex={brand.colors.primary[700]}
        value={colors.primary}
        onChange={(v) => {
          setColors((c) => ({ ...c, primary: v }))
        }}
      />
      <ColorPicker
        label="Couleur d’accent"
        presets={ACCENT_PRESETS}
        defaultHex={brand.colors.accent[400]}
        value={colors.accent}
        onChange={(v) => {
          setColors((c) => ({ ...c, accent: v }))
        }}
      />
      <h2 className="pt-2 text-lg font-bold">Droits du caissier</h2>
      <label className="flex min-h-11 items-center gap-3 text-base font-semibold">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={f.editPrice}
          onChange={(e) => {
            set('editPrice', e.target.checked)
          }}
        />
        Peut modifier un prix
      </label>
      <label className="flex min-h-11 items-center gap-3 text-base font-semibold">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={f.discount}
          onChange={(e) => {
            set('discount', e.target.checked)
          }}
        />
        Peut faire une remise
      </label>
      <Input
        label="Remise maximale du caissier (%)"
        inputMode="numeric"
        value={f.cap}
        onChange={(e) => {
          set('cap', e.target.value)
        }}
        hint="Au-delà : code du gérant demandé, ou vente signalée dans « Contrôle »."
      />
      <Input
        label={
          settings.manager_pin
            ? 'Nouveau code gérant (laisser vide pour garder l’actuel)'
            : 'Code gérant (4 à 6 chiffres)'
        }
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={f.managerPin}
        onChange={(e) => {
          set('managerPin', e.target.value.replace(/\D/g, ''))
        }}
        hint="Ce code est vérifié sur l’appareil du caissier, hors ligne."
      />
      <Input
        label="Verrouillage après inactivité (minutes)"
        inputMode="numeric"
        value={f.idle}
        onChange={(e) => {
          set('idle', e.target.value)
        }}
      />
      <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
        Enregistrer
      </Button>
    </Card>
  )
}

function SecurityTab() {
  const { supabase, state } = useAuth()
  const { hasPin, setPin, removePin, lockNow } = useLock()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pin, setPinValue] = useState('')
  const forbidden = state.status === 'ready' ? [state.profile.phone ?? '', state.shop.name] : []
  const problem = pw ? validatePassword(pw, { forbidden }) : null
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Changer mon mot de passe</h2>
        <Input
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value)
          }}
          error={problem ?? undefined}
          hint={pw ? `Solidité : ${passwordStrength(pw)}/4` : undefined}
        />
        <Button
          disabled={!pw || problem !== null}
          onClick={() =>
            void supabase.auth.updateUser({ password: pw }).then(({ error }) => {
              if (error)
                toast.error(
                  'Impossible de changer le mot de passe (connexion internet nécessaire).',
                )
              else {
                toast.success('Mot de passe modifié.')
                setPw('')
              }
            })
          }
        >
          Enregistrer
        </Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">
          Code de verrouillage de l’application{' '}
          {hasPin ? <Badge tone="success">Activé</Badge> : <Badge>Désactivé</Badge>}
        </h2>
        <p className="text-sm text-neutral-700">
          Le code protège l’écran si l’appareil est perdu ou prêté. Il ne chiffre pas les données :
          gardez aussi le verrouillage de votre téléphone.
        </p>
        <Input
          label="Nouveau code (4 à 6 chiffres)"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPinValue(e.target.value.replace(/\D/g, ''))
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const p = validatePinFormat(pin)
              if (p) toast.error(p)
              else
                void setPin(pin).then(() => {
                  setPinValue('')
                  toast.success('Code enregistré.')
                })
            }}
          >
            {hasPin ? 'Changer le code' : 'Activer le code'}
          </Button>
          {hasPin ? (
            <Button variant="secondary" onClick={lockNow}>
              Verrouiller maintenant
            </Button>
          ) : null}
          {hasPin ? (
            <Button variant="ghost" onClick={() => void removePin()}>
              Désactiver
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

function SyncTab() {
  const { db } = useSession()
  const engine = useSyncEngine()
  const status = useSyncStatus()
  const failed = useLiveQuery(() => db.outbox_failed.toArray(), [db])
  const stateLabel = {
    idle: 'Synchronisé',
    syncing: 'En cours…',
    offline: 'Hors ligne',
    error: 'Problème',
    blocked: 'Suspendu',
  }[status.state]
  return (
    <div className="space-y-4">
      <Card className="space-y-2 text-base">
        <p>
          État : <b>{stateLabel}</b>
        </p>
        <p>
          En attente d’envoi : <b>{status.pending}</b> · Rejetés : <b>{status.failed}</b>
        </p>
        <p>
          Dernière synchronisation :{' '}
          <b>{status.lastSyncAt ? formatDateTime(status.lastSyncAt) : 'jamais'}</b>
        </p>
        {status.error ? (
          <p role="alert" className="text-red-800">
            {status.error}
          </p>
        ) : null}
        {status.invalidRows > 0 ? (
          <p className="text-accent-800">
            {status.invalidRows} ligne(s) reçue(s) illisible(s) ont été ignorées.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button loading={status.state === 'syncing'} onClick={() => void engine.syncNow()}>
            Synchroniser maintenant
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void exportUnsent(db).then((d) => {
                downloadText(
                  `non-envoye-${d.exported_at.slice(0, 10)}.json`,
                  JSON.stringify(d, null, 2),
                  'application/json',
                )
              })
            }
          >
            Exporter les données non envoyées
          </Button>
        </div>
      </Card>
      {failed && failed.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-lg font-bold">Éléments rejetés</h2>
          <ul className="divide-y divide-neutral-200 text-base">
            {failed.map((f) => (
              <li key={f.seq} className="py-2">
                <b>{f.table}</b> · {formatDateTime(f.failed_at)}
                <br />
                <span className="text-sm text-red-800">{f.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-neutral-700">
            Exportez ces éléments et contactez le support : ils ne sont jamais supprimés en silence.
          </p>
        </Card>
      ) : null}
    </div>
  )
}

function DataTab() {
  const { db, profile } = useSession()
  const { wipeLocalData } = useAuth()
  const toast = useToast()
  const pending = useLiveQuery(() => db.outbox.count(), [db])
  const [confirm, setConfirm] = useState(false)
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">Sauvegarde</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            void exportBackup(db).then((b) => {
              downloadText(
                `sauvegarde-jago-${b.exported_at.slice(0, 10)}.json`,
                JSON.stringify(b),
                'application/json',
              )
            })
          }
        >
          Sauvegarde complète (JSON)
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            void exportCsvFiles(db).then((files) => {
              files.forEach((f, i) => {
                setTimeout(() => {
                  downloadText(f.name, f.content)
                }, i * 300)
              })
            })
          }
        >
          Tout exporter en CSV (Excel)
        </Button>
      </div>
      <h2 className="pt-2 text-lg font-bold">Appareil partagé</h2>
      <p className="text-sm text-neutral-700">
        Effacer les données de cet appareil est possible seulement quand tout est envoyé.
      </p>
      <Button
        variant="danger"
        disabled={(pending ?? 1) > 0 || profile.role === 'cashier'}
        onClick={() => {
          setConfirm(true)
        }}
      >
        Effacer les données de cet appareil
      </Button>
      {(pending ?? 0) > 0 ? (
        <p className="text-sm text-accent-800">
          {pending} élément(s) pas encore envoyé(s) : effacement bloqué.
        </p>
      ) : null}
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title="Effacer les données de cet appareil ?"
        message="Vos données restent sur le serveur et reviendront à la prochaine connexion."
        confirmLabel="Effacer"
        onCancel={() => {
          setConfirm(false)
        }}
        onConfirm={() =>
          void wipeLocalData().then((m) => {
            if (m) toast.error(m)
          })
        }
      />
    </Card>
  )
}

function DeviceTab() {
  const { signOut } = useAuth()
  const { db, ctx, userId, profile } = useSession()
  const pending = useLiveQuery(() => db.outbox.count(), [db])
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    void requestPersistence().then(readStorage).then(setInfo)
  }, [])
  return (
    <Card className="space-y-3 text-base">
      <p>
        Version de l’application : <b>{APP_VERSION}</b>
      </p>
      <p>
        Nom de l’appareil : <b>{ctx.deviceShort}</b>
      </p>
      <p>
        Connecté : <b>{profile.full_name}</b> (
        {profile.role === 'owner'
          ? 'propriétaire'
          : profile.role === 'manager'
            ? 'gérant'
            : 'caissier'}
        ) <span className="text-sm text-neutral-700">…{userId.slice(-4)}</span>
      </p>
      {info ? (
        <p>
          Stockage : <b>{info.usageMb ?? '?'} Mo</b> utilisés sur {info.quotaMb ?? '?'} Mo · protégé
          : <b>{info.persisted === null ? 'inconnu' : info.persisted ? 'oui' : 'non'}</b>
        </p>
      ) : null}
      {isIos() && !isStandalone() ? (
        <p role="note" className="rounded-xl bg-accent-50 p-3 text-accent-900">
          Sur iPhone, installez l’application sur l’écran d’accueil (Partager → Sur l’écran
          d’accueil) : sinon le navigateur peut effacer vos données.
        </p>
      ) : null}
      <Button
        variant="secondary"
        onClick={() => {
          setConfirm(true)
        }}
      >
        Se déconnecter
      </Button>
      <ConfirmDialog
        open={confirm}
        title="Se déconnecter ?"
        message={
          (pending ?? 0) > 0
            ? `${pending} élément(s) ne sont pas encore envoyés. Ils restent sur cet appareil et seront envoyés après votre prochaine connexion, mais pas avant.`
            : 'Vos données restent sur cet appareil.'
        }
        confirmLabel="Se déconnecter"
        onCancel={() => {
          setConfirm(false)
        }}
        onConfirm={() => void signOut()}
      />
    </Card>
  )
}
