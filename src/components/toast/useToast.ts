import { useContext } from 'react'
import { ToastContext, type ToastApi } from './context'

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast doit être utilisé à l’intérieur de <ToastProvider>.')
  return api
}
