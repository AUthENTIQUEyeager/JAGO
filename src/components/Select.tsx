import { useId, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}

export function Select({ label, options, onChange, className, id, ...rest }: SelectProps) {
  const auto = useId()
  const selectId = id ?? auto
  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-base font-semibold text-neutral-900">
        {label}
      </label>
      <select
        id={selectId}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className={cn(
          'min-h-12 w-full rounded-xl border border-neutral-400 bg-white px-3 text-base text-neutral-900',
          className,
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
