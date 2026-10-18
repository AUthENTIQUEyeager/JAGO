import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'lg'

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900',
  accent: 'bg-accent-400 text-brand-900 hover:bg-accent-500 active:bg-accent-600',
  secondary: 'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900',
  ghost: 'text-brand-800 hover:bg-brand-50',
}

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-14 px-6 text-lg',
}

/** Classes d’un bouton, réutilisables pour un lien qui doit ressembler à un bouton. */
export function buttonStyles(options: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}): string {
  const { variant = 'primary', size = 'md', fullWidth = false } = options
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full')
}
