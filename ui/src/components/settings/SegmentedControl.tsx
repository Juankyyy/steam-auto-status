import { cn } from '@/lib/utils'

type Option<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  options: Option<T>[]
  value: T | undefined
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
}

/** Compact radio group used for language and countdown precision. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border/60 p-1"
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
