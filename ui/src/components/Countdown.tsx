import NumberFlow from '@number-flow/react'
import { useAppContext } from '@/lib/app-context'
import { LANGUAGE_LOCALES } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import type { CountdownPrecision } from '@/lib/tauri'

type Segment = {
  value: number
  unit: 'duration.dayShort' | 'duration.hourShort' | 'duration.minuteShort' | 'duration.secondShort'
}

const PRECISION_INDEX: Record<CountdownPrecision, number> = { hours: 1, minutes: 2, seconds: 3 }

/**
 * Splits a duration into the units the countdown displays. The configured precision is
 * the smallest unit shown: hours → "5 h", minutes → "5 h 30 min", seconds → "5 h 30 min 12 s".
 * The first nonzero unit is always kept (a 30 min countdown never renders "0 h"), and days
 * stay in front when the next change is more than a day away.
 */
function durationSegments(ms: number, precision: CountdownPrecision): Segment[] {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  const units: Segment[] = [
    { value: days, unit: 'duration.dayShort' },
    { value: hours, unit: 'duration.hourShort' },
    { value: minutes, unit: 'duration.minuteShort' },
    { value: seconds, unit: 'duration.secondShort' },
  ]

  const firstNonZero = units.findIndex((segment) => segment.value > 0)
  const start = firstNonZero === -1 ? units.length - 1 : firstNonZero
  const end = Math.max(start, PRECISION_INDEX[precision])

  return units.slice(start, end + 1)
}

/**
 * Countdown with rolling digits. NumberFlow respects the system reduced-motion
 * preference on its own, so CSS only has to style the surrounding units.
 */
export function Countdown({ ms }: { ms: number }) {
  const { t, lang } = useI18n()
  const { state } = useAppContext()
  const precision = state?.config.countdownPrecision ?? 'seconds'
  const segments = durationSegments(ms, precision)
  const locales = LANGUAGE_LOCALES[lang]

  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-1 tabular-nums">
      {segments.map(({ value, unit }) => (
        <span key={unit} className="inline-flex items-baseline gap-1">
          <NumberFlow value={value} locales={locales} className="font-semibold" />
          <span className="text-sm font-medium text-muted-foreground/80">{t(unit)}</span>
        </span>
      ))}
    </span>
  )
}
