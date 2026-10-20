import NumberFlow from '@number-flow/react'
import { LANGUAGE_LOCALES } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'

/** Splits a duration into the pair of units the countdown displays. */
function durationSegments(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  if (days > 0) return { first: days, firstUnit: 'duration.dayShort', second: hours, secondUnit: 'duration.hourShort' } as const
  if (hours > 0) return { first: hours, firstUnit: 'duration.hourShort', second: minutes, secondUnit: 'duration.minuteShort' } as const
  if (minutes > 0) return { first: minutes, firstUnit: 'duration.minuteShort', second: seconds, secondUnit: 'duration.secondShort' } as const
  return { first: seconds, firstUnit: 'duration.secondShort', second: null, secondUnit: null } as const
}

/**
 * Countdown with rolling digits. NumberFlow respects the system reduced-motion
 * preference on its own, so CSS only has to style the surrounding units.
 */
export function Countdown({ ms }: { ms: number }) {
  const { t, lang } = useI18n()
  const { first, firstUnit, second, secondUnit } = durationSegments(ms)
  const locales = LANGUAGE_LOCALES[lang]

  return (
    <span className="inline-flex items-baseline justify-end gap-1.5 tabular-nums">
      <span className="inline-flex items-baseline gap-1">
        <NumberFlow value={first} locales={locales} className="font-semibold" />
        <span className="text-sm font-medium text-muted-foreground/80">{t(firstUnit)}</span>
      </span>
      {second !== null && secondUnit !== null && (
        <span className="inline-flex items-baseline gap-1">
          <NumberFlow value={second} locales={locales} className="font-semibold" />
          <span className="text-sm font-medium text-muted-foreground/80">{t(secondUnit)}</span>
        </span>
      )}
    </span>
  )
}
