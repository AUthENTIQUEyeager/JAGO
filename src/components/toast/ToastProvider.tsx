import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fr } from '@/i18n/fr'
import { cn } from '@/lib/cn'
import { ToastContext, type ToastApi, type ToastKind } from './context'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const DURATION_MS: Record<ToastKind, number> = { success: 4000, info: 4000, error: 7000 }
const MAX_VISIBLE = 3

const styles: Record<ToastKind, string> = {
  success: 'bg-brand-800 text-white',
  error: 'bg-red-700 text-white',
  info: 'bg-neutral-800 text-white',
}

const icons = { success: CircleCheck, error: CircleAlert, info: Info } as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, kind, message }])
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id)
        }, DURATION_MS[kind]),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const registry = timers.current
    return () => {
      registry.forEach((timer) => {
        clearTimeout(timer)
      })
      registry.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => {
        push('success', message)
      },
      error: (message) => {
        push('error', message)
      },
      info: (message) => {
        push('info', message)
      },
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.kind]
          return (
            <div
              key={toast.id}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 shadow-lg',
                styles[toast.kind],
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-base font-medium">{toast.message}</p>
              <button
                type="button"
                aria-label={fr.common.close}
                onClick={() => {
                  dismiss(toast.id)
                }}
                className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
