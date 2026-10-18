import type { Config, Day } from '@/lib/tauri'

/** Weekday order (Monday first) used across the schedule UI. */
export const DAY_ORDER: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_LABELS: { id: Day; label: string }[] = [
  { id: 'mon', label: 'Lun' },
  { id: 'tue', label: 'Mar' },
  { id: 'wed', label: 'Mié' },
  { id: 'thu', label: 'Jue' },
  { id: 'fri', label: 'Vie' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
]

const DAY_MINUTES = 24 * 60

function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

/** Length of the Online window in minutes (end <= start wraps to the next day). */
export function windowMinutes(from: string, until: string): number {
  return (toMinutes(until) - toMinutes(from) + DAY_MINUTES) % DAY_MINUTES
}

/** Human-readable window length: "7 h 30 min", "45 min" or "sin franja". */
export function formatWindowLength(from: string, until: string): string {
  const total = windowMinutes(from, until)
  if (total === 0) return 'sin franja'
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function summarizeDays(days: Day[]): string {
  const set = new Set(days)
  const sorted = DAY_ORDER.filter((d) => set.has(d))
  if (sorted.length === 0) return 'Ningún día'
  if (sorted.length === 7) return 'Todos los días'
  if (sorted.join(',') === 'mon,tue,wed,thu,fri') return 'Lun–Vie'
  if (sorted.join(',') === 'sat,sun') return 'Sáb y Dom'
  return sorted.map((d) => DAY_LABELS.find((x) => x.id === d)?.label ?? d).join(', ')
}

/** One-line summary like "Lun–Vie · 17:30 → 01:00 · 7 h 30 min". */
export function formatSchedule(cfg: Config): string {
  return `${summarizeDays(cfg.days)} · ${cfg.onlineFrom} → ${cfg.onlineUntil} · ${formatWindowLength(cfg.onlineFrom, cfg.onlineUntil)}`
}
