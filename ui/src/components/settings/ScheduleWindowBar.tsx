import { Moon } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { Badge } from '@/components/ui/badge'
import { formatClock } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import {
  DAY_MINUTES,
  formatWindowLength,
  minutesToTime,
  timeToMinutes,
  windowCrossesMidnight,
  windowMinutes,
  windowSegments,
} from '@/lib/schedule'
import { cn } from '@/lib/utils'

type WindowUnit = 'from' | 'until'

type ScheduleWindowBarProps = {
  from: string
  until: string
  disabled?: boolean
  /** Live value while dragging (updates the fields and the summary too). */
  onDraft: (from: string, until: string) => void
  /** Persisted value when the drag ends or a keyboard step is made. */
  onCommit: (from: string, until: string) => void
}

const STEP_MINUTES = 5
const MAX_MINUTE = DAY_MINUTES - 1

function labelStyle(percent: number): CSSProperties {
  if (percent < 8) return { left: `${percent}%`, transform: 'translateX(0)' }
  if (percent > 92) return { left: `${percent}%`, transform: 'translateX(-100%)' }
  return { left: `${percent}%`, transform: 'translateX(-50%)' }
}

/**
 * 24-hour track for the Online window. The ends can be dragged (5-minute
 * snap) or moved with the keyboard; a window that crosses midnight is drawn as
 * two segments. The exact minute stays editable in the TimeFields above.
 */
export function ScheduleWindowBar({
  from,
  until,
  disabled = false,
  onDraft,
  onCommit,
}: ScheduleWindowBarProps) {
  const { t, lang } = useI18n()
  const hintId = useId()
  const trackRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ from, until })
  const onDraftRef = useRef(onDraft)
  const onCommitRef = useRef(onCommit)
  const dragPointer = useRef<{ unit: WindowUnit; pointerId: number } | null>(null)
  const dragCleanup = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState<WindowUnit | null>(null)

  useEffect(() => {
    latest.current = { from, until }
  }, [from, until])

  const fromMinutes = timeToMinutes(from)
  const untilMinutes = timeToMinutes(until)
  const total = windowMinutes(from, until)
  const crosses = windowCrossesMidnight(from, until)
  const segments = windowSegments(from, until)
  const startPct = (fromMinutes / DAY_MINUTES) * 100
  const endPct = (untilMinutes / DAY_MINUTES) * 100
  const labelsCollide = Math.abs(startPct - endPct) < 12

  const setValue = (unit: WindowUnit, minutes: number, persist: boolean) => {
    const normalized = ((Math.trunc(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
    const next = {
      from: unit === 'from' ? minutesToTime(normalized) : latest.current.from,
      until: unit === 'until' ? minutesToTime(normalized) : latest.current.until,
    }
    latest.current = next
    onDraftRef.current(next.from, next.until)
    if (persist) onCommitRef.current(next.from, next.until)
  }

  useEffect(() => {
    onDraftRef.current = onDraft
    onCommitRef.current = onCommit
  })

  useEffect(() => () => dragCleanup.current?.(), [])

  const minuteAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const snapped = Math.round((ratio * DAY_MINUTES) / STEP_MINUTES) * STEP_MINUTES
    return Math.min(MAX_MINUTE, snapped)
  }

  const beginDrag = (unit: WindowUnit, event: PointerEvent<HTMLElement>, jump: boolean) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    // Keep receiving pointerup if the drag leaves the window; the global
    // listeners still see the captured events.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is unavailable for some synthetic/edge pointer events.
    }
    if (event.currentTarget instanceof HTMLButtonElement) {
      event.currentTarget.focus({ preventScroll: true })
    }

    dragCleanup.current?.()
    dragPointer.current = { unit, pointerId: event.pointerId }
    const start = { ...latest.current }

    function cleanup() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      dragCleanup.current = null
    }

    function move(moveEvent: globalThis.PointerEvent) {
      const active = dragPointer.current
      if (!active || moveEvent.pointerId !== active.pointerId) return
      setValue(active.unit, minuteAt(moveEvent.clientX), false)
    }

    function finish(finishEvent: globalThis.PointerEvent) {
      const active = dragPointer.current
      if (!active || finishEvent.pointerId !== active.pointerId) return
      dragPointer.current = null
      setDragging(null)
      cleanup()
      if (latest.current.from !== start.from || latest.current.until !== start.until) {
        onCommitRef.current(latest.current.from, latest.current.until)
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    dragCleanup.current = cleanup

    setDragging(unit)
    if (jump) setValue(unit, minuteAt(event.clientX), false)
  }

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return
    const minutes = minuteAt(event.clientX)
    const distanceFrom = Math.abs(minutes - fromMinutes)
    const distanceUntil = Math.abs(minutes - untilMinutes)
    beginDrag(distanceFrom <= distanceUntil ? 'from' : 'until', event, true)
  }

  const handleKeyDown = (unit: WindowUnit, event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setValue(unit, event.key === 'Home' ? 0 : MAX_MINUTE, true)
      return
    }

    let delta: number
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = 1
    else if (event.key === 'PageDown') delta = -12
    else if (event.key === 'PageUp') delta = 12
    else return

    event.preventDefault()
    const current = timeToMinutes(unit === 'from' ? latest.current.from : latest.current.until)
    const step = (event.shiftKey ? 1 : STEP_MINUTES) * delta
    setValue(unit, (current + step + DAY_MINUTES) % DAY_MINUTES, true)
  }

  const startLabelStyle = labelStyle(startPct)
  const endLabelStyle = labelStyle(endPct)

  return (
    <div
      role="group"
      aria-label={t('settings.schedule.windowLabel')}
      aria-describedby={hintId}
      className={cn('grid gap-2 transition-opacity duration-200', disabled && 'opacity-50')}
    >
      <div className="relative mx-2 pt-6">
        {labelsCollide ? (
          <span
            aria-hidden="true"
            className="absolute top-0 right-0 rounded border border-border/60 bg-card px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
          >
            {formatClock(from, lang)} → {formatClock(until, lang)}
          </span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="absolute top-0 rounded border border-border/60 bg-card px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              style={startLabelStyle}
            >
              {formatClock(from, lang)}
            </span>
            <span
              aria-hidden="true"
              className="absolute top-0 rounded border border-border/60 bg-card px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              style={endLabelStyle}
            >
              {formatClock(until, lang)}
            </span>
          </>
        )}

        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          className={cn(
            'relative h-2.5 touch-none rounded-full bg-muted',
            disabled ? 'cursor-default' : 'cursor-pointer',
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          >
            {segments.map((segment, index) => (
              <span
                key={index}
                className="absolute inset-y-0 rounded-full bg-status-online"
                style={{
                  left: `${segment.left}%`,
                  width: `${segment.width}%`,
                  minWidth: 2,
                }}
              />
            ))}
          </span>

          <button
            type="button"
            role="slider"
            aria-label={t('settings.schedule.windowStart')}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={MAX_MINUTE}
            aria-valuenow={fromMinutes}
            aria-valuetext={formatClock(from, lang)}
            disabled={disabled}
            onPointerDown={(event) => beginDrag('from', event, false)}
            onKeyDown={(event) => handleKeyDown('from', event)}
            style={{ left: `${startPct}%` }}
            className={cn(
              'absolute top-1/2 z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed',
              !disabled && 'cursor-grab',
              dragging === 'from' && 'cursor-grabbing',
            )}
          >
            <span
              aria-hidden="true"
              className="size-4 rounded-full border-2 border-card bg-foreground shadow-sm"
            />
          </button>

          <button
            type="button"
            role="slider"
            aria-label={t('settings.schedule.windowEnd')}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={MAX_MINUTE}
            aria-valuenow={untilMinutes}
            aria-valuetext={formatClock(until, lang)}
            disabled={disabled}
            onPointerDown={(event) => beginDrag('until', event, false)}
            onKeyDown={(event) => handleKeyDown('until', event)}
            style={{ left: `${endPct}%` }}
            className={cn(
              'absolute top-1/2 z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed',
              !disabled && 'cursor-grab',
              dragging === 'until' && 'cursor-grabbing',
            )}
          >
            <span
              aria-hidden="true"
              className="size-4 rounded-full border-2 border-card bg-foreground shadow-sm"
            />
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mx-2 flex justify-between text-[10px] tabular-nums text-muted-foreground/70"
      >
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {total > 0 && (
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-online" />
          )}
          {total === 0
            ? t('schedule.noWindow')
            : t('settings.schedule.onlineFor', {
                duration: formatWindowLength(from, until, t),
              })}
        </span>
        <span
          id={hintId}
          className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          {crosses && (
            <Badge
              variant="outline"
              className="h-4 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              <Moon aria-hidden="true" />
              {t('settings.schedule.crossesMidnight')}
            </Badge>
          )}
          {t('settings.schedule.windowHint')}
        </span>
      </div>
    </div>
  )
}
