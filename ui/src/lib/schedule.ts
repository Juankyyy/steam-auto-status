import type { Translate } from '@/lib/i18n'
import type { Day } from '@/lib/tauri'

/** Weekday order (Monday first) used across the schedule UI. */
export const DAY_ORDER: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_MINUTES = 24 * 60

/** Parses "HH:MM" into minutes since midnight, wrapping out-of-range values. */
export function timeToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  const total = h * 60 + m
  return Number.isFinite(total) ? ((total % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES : 0
}

/** Formats minutes since midnight as "HH:MM", wrapping at 24 h. */
export function minutesToTime(minutes: number): string {
  const normalized = ((Math.trunc(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Length of the Online window in minutes (end <= start wraps to the next day). */
export function windowMinutes(from: string, until: string): number {
  return (timeToMinutes(until) - timeToMinutes(from) + DAY_MINUTES) % DAY_MINUTES
}

/** Whether the window includes midnight (end <= start, excluding the zero window). */
export function windowCrossesMidnight(from: string, until: string): boolean {
  return windowMinutes(from, until) > 0 && timeToMinutes(until) <= timeToMinutes(from)
}

export type WindowSegment = {
  /** Left edge as a percentage of the 24 h track. */
  left: number
  /** Width as a percentage of the 24 h track. */
  width: number
}

/**
 * Visual segments of the Online window on a 24 h track. A window that crosses
 * midnight becomes two segments, one at each end of the day; the zero window
 * has no segments.
 */
export function windowSegments(from: string, until: string): WindowSegment[] {
  const start = timeToMinutes(from)
  const end = timeToMinutes(until)
  if (start === end) return []

  const startPct = (start / DAY_MINUTES) * 100
  const endPct = (end / DAY_MINUTES) * 100
  if (end < start) {
    return [
      { left: startPct, width: 100 - startPct },
      { left: 0, width: endPct },
    ].filter((segment) => segment.width > 0)
  }
  return [{ left: startPct, width: endPct - startPct }]
}

/** Human-readable window length: "7 h 30 min" / "7h 30m", or the "no window" label. */
export function formatWindowLength(from: string, until: string, t: Translate): string {
  const total = windowMinutes(from, until)
  if (total === 0) return t('schedule.noWindow')
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return t('schedule.minutes', { m })
  return m === 0 ? t('schedule.hours', { h }) : t('schedule.hoursMinutes', { h, m })
}

/**
 * Compact day summary for cards and the dashboard: consecutive selected days become a
 * range ("Lun–Vie", "Sáb–Dom") and the rest stay as a comma-separated list.
 */
export function formatDayRange(days: Day[], t: Translate): string {
  const selected = DAY_ORDER.filter((day) => days.includes(day))
  if (selected.length === 0) return t('schedule.noDays')

  const groups: Day[][] = []
  for (const day of selected) {
    const lastGroup = groups[groups.length - 1]
    const lastDay = lastGroup?.[lastGroup.length - 1]
    if (lastDay && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(lastDay) + 1) {
      lastGroup.push(day)
    } else {
      groups.push([day])
    }
  }

  return groups
    .map((group) => {
      const first = group[0]
      const last = group[group.length - 1]
      if (!first || !last) return ''
      if (group.length === 1) return t(`day.${first}`)
      return t('schedule.dayRange', { from: t(`day.${first}`), to: t(`day.${last}`) })
    })
    .join(t('schedule.daySeparator'))
}
