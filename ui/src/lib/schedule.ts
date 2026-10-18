import { formatClock, type Translate } from '@/lib/i18n'
import type { Config, Day, Language } from '@/lib/tauri'

/** Weekday order (Monday first) used across the schedule UI. */
export const DAY_ORDER: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DAY_MINUTES = 24 * 60

function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

/** Length of the Online window in minutes (end <= start wraps to the next day). */
export function windowMinutes(from: string, until: string): number {
  return (toMinutes(until) - toMinutes(from) + DAY_MINUTES) % DAY_MINUTES
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

function summarizeDays(days: Day[], t: Translate): string {
  const set = new Set(days)
  const sorted = DAY_ORDER.filter((d) => set.has(d))
  if (sorted.length === 0) return t('schedule.noDays')
  if (sorted.length === 7) return t('schedule.everyDay')
  if (sorted.join(',') === 'mon,tue,wed,thu,fri') return t('schedule.weekdays')
  if (sorted.join(',') === 'sat,sun') return t('schedule.weekend')
  return sorted.map((d) => t(`day.${d}`)).join(', ')
}

/** One-line summary like "Lun–Vie · 17:30 → 01:00 · 7 h 30 min" in the active language. */
export function formatSchedule(cfg: Config, t: Translate, lang: Language): string {
  return `${summarizeDays(cfg.days, t)} · ${formatClock(cfg.onlineFrom, lang)} → ${formatClock(cfg.onlineUntil, lang)} · ${formatWindowLength(cfg.onlineFrom, cfg.onlineUntil, t)}`
}
