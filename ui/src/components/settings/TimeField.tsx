import { Clock } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { Label } from '@/components/ui/label'
import { uses12HourClock } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { minutesToTime, timeToMinutes } from '@/lib/schedule'
import { cn } from '@/lib/utils'

type TimeUnit = 'hour' | 'minute'

type TimeFieldProps = {
  id: string
  label: string
  value: string
  disabled?: boolean
  /** Called with a normalized "HH:MM" value after the user finishes a segment. */
  onCommit: (value: string) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Segmented HH:MM field backed by two native inputs, so typing, selection and
 * accessibility stay native. Arrow keys and the wheel step the focused segment;
 * in 12-hour locales a small AM/PM button follows the minutes.
 */
export function TimeField({ id, label, value, disabled = false, onCommit }: TimeFieldProps) {
  const { t, lang } = useI18n()
  const labelId = useId()
  const is12h = uses12HourClock(lang)
  const hourRef = useRef<HTMLInputElement>(null)
  const minuteRef = useRef<HTMLInputElement>(null)
  const lastCommitted = useRef<string | null>(null)
  const stepRef = useRef<(unit: TimeUnit, delta: number) => void>(() => {})
  const [hourDraft, setHourDraft] = useState<string | null>(null)
  const [minuteDraft, setMinuteDraft] = useState<string | null>(null)

  const totalMinutes = timeToMinutes(value)
  const hour24 = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  const isPm = hour24 >= 12
  const displayHour = is12h ? hour24 % 12 || 12 : hour24
  const hourText = hourDraft ?? (is12h ? String(displayHour) : String(displayHour).padStart(2, '0'))
  const minuteText = minuteDraft ?? String(minute).padStart(2, '0')

  useEffect(() => {
    lastCommitted.current = null
  }, [value])

  const commit = (next: string) => {
    if (next === value || next === lastCommitted.current) return
    lastCommitted.current = next
    onCommit(next)
  }

  const clampHour = (raw: number) =>
    is12h ? clamp(Math.trunc(raw), 1, 12) : clamp(Math.trunc(raw), 0, 23)

  const to24Hour = (hour: number) => (is12h ? (hour % 12) + (isPm ? 12 : 0) : hour)

  const currentHour24 = () => {
    const raw = hourDraft ?? String(displayHour)
    if (raw.trim() === '') return hour24
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? to24Hour(clampHour(parsed)) : hour24
  }

  const currentMinute = () => {
    const raw = minuteDraft ?? String(minute).padStart(2, '0')
    if (raw.trim() === '') return minute
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clamp(Math.trunc(parsed), 0, 59) : minute
  }

  const commitHour = (raw: string) => {
    setHourDraft(null)
    if (raw.trim() === '') return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    commit(minutesToTime(to24Hour(clampHour(parsed)) * 60 + currentMinute()))
  }

  const commitMinute = (raw: string) => {
    setMinuteDraft(null)
    if (raw.trim() === '') return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    commit(minutesToTime(currentHour24() * 60 + clamp(Math.trunc(parsed), 0, 59)))
  }

  const step = (unit: TimeUnit, delta: number) => {
    const next =
      unit === 'hour'
        ? minutesToTime(((currentHour24() + delta + 24) % 24) * 60 + currentMinute())
        : minutesToTime(currentHour24() * 60 + ((currentMinute() + delta + 60) % 60))
    setHourDraft(null)
    setMinuteDraft(null)
    commit(next)
  }

  useEffect(() => {
    stepRef.current = step
  })

  // Keep the wheel handler attached once; the ref always points at the latest
  // step closure. The wheel only acts while the input is focused, so hovering
  // the field still scrolls the page normally.
  useEffect(() => {
    const inputs: Array<{ element: HTMLInputElement | null; unit: TimeUnit }> = [
      { element: hourRef.current, unit: 'hour' },
      { element: minuteRef.current, unit: 'minute' },
    ]
    const cleanups: Array<() => void> = []
    for (const { element, unit } of inputs) {
      if (!element) continue
      const onWheel = (event: WheelEvent) => {
        if (document.activeElement !== element) return
        event.preventDefault()
        stepRef.current(unit, event.deltaY < 0 ? 1 : -1)
      }
      element.addEventListener('wheel', onWheel, { passive: false })
      cleanups.push(() => element.removeEventListener('wheel', onWheel))
    }
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [])

  const handleHourChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 2)
    setHourDraft(digits)
    if (digits.length !== 2) return
    const parsed = Number(digits)
    if (is12h ? parsed < 1 || parsed > 12 : parsed < 0 || parsed > 23) return
    commitHour(digits)
    minuteRef.current?.focus()
    minuteRef.current?.select()
  }

  const handleMinuteChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 2)
    setMinuteDraft(digits)
    if (digits.length !== 2 || Number(digits) > 59) return
    commitMinute(digits)
  }

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select()
  }

  const handleBlur = (unit: TimeUnit, event: FocusEvent<HTMLInputElement>) => {
    if (unit === 'hour') commitHour(event.currentTarget.value)
    else commitMinute(event.currentTarget.value)
  }

  const handleKeyDown = (unit: TimeUnit, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      step(unit, event.key === 'ArrowUp' ? 1 : -1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const inputClassName =
    'h-full w-6 border-0 bg-transparent p-0 text-center text-sm font-semibold tabular-nums text-foreground outline-none disabled:cursor-not-allowed'

  return (
    <div className="grid gap-2">
      <Label
        id={labelId}
        htmlFor={`${id}-hour`}
        className={cn('transition-opacity duration-200', disabled && 'opacity-50')}
      >
        {label}
      </Label>
      <div
        role="group"
        aria-labelledby={labelId}
        className={cn(
          'flex h-9 w-full items-center gap-0.5 rounded-lg border border-input bg-transparent px-2.5 transition-all duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
          disabled && 'bg-input/50 opacity-50 dark:bg-input/80',
        )}
      >
        <Clock aria-hidden="true" className="mr-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={hourRef}
          id={`${id}-hour`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('settings.schedule.hours')}
          className={inputClassName}
          value={hourText}
          disabled={disabled}
          onChange={handleHourChange}
          onFocus={handleFocus}
          onBlur={(event) => handleBlur('hour', event)}
          onKeyDown={(event) => handleKeyDown('hour', event)}
        />
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          :
        </span>
        <input
          ref={minuteRef}
          id={`${id}-minute`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('settings.schedule.minutes')}
          className={inputClassName}
          value={minuteText}
          disabled={disabled}
          onChange={handleMinuteChange}
          onFocus={handleFocus}
          onBlur={(event) => handleBlur('minute', event)}
          onKeyDown={(event) => handleKeyDown('minute', event)}
        />
        {is12h && (
          <button
            type="button"
            disabled={disabled}
            className="ml-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground disabled:pointer-events-none"
            onClick={() => {
              const baseHour = currentHour24()
              const nextHour = baseHour < 12 ? baseHour + 12 : baseHour - 12
              const next = minutesToTime(nextHour * 60 + currentMinute())
              setHourDraft(null)
              setMinuteDraft(null)
              commit(next)
            }}
          >
            {isPm ? 'PM' : 'AM'}
          </button>
        )}
      </div>
    </div>
  )
}
