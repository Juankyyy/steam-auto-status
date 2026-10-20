import { RotateCcw } from 'lucide-react'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n-context'
import { DAY_ORDER, formatSchedule, windowMinutes } from '@/lib/schedule'
import { cmd, type AppState, type Day } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const DEFAULT_SCHEDULE = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'] as Day[],
  onlineFrom: '17:30',
  onlineUntil: '01:00',
}

/** Settings › Schedule: Online window (hours and weekdays). */
export function ScheduleSettings({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const cfg = state?.config
  const patch = (params: Record<string, unknown>) => void cmd('setConfig', params)

  const toggleDay = (day: Day) => {
    if (!cfg) return
    const has = cfg.days.includes(day)
    const next = DAY_ORDER.filter((d) => (d === day ? !has : cfg.days.includes(d)))
    patch({ days: next })
  }

  const noWindow = !!cfg && windowMinutes(cfg.onlineFrom, cfg.onlineUntil) === 0

  return (
    <SettingsSection
      title={t('settings.schedule.title')}
      description={t('settings.schedule.description')}
      contentClassName="gap-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="from">{t('settings.schedule.from')}</Label>
          <Input
            id="from"
            type="time"
            value={cfg?.onlineFrom ?? '17:30'}
            disabled={!cfg}
            onChange={(e) => patch({ onlineFrom: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="until">{t('settings.schedule.until')}</Label>
          <Input
            id="until"
            type="time"
            value={cfg?.onlineUntil ?? '01:00'}
            disabled={!cfg}
            onChange={(e) => patch({ onlineUntil: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>{t('settings.schedule.days')}</Label>
        <div className="flex flex-wrap gap-2">
          {DAY_ORDER.map((day) => {
            const active = cfg?.days.includes(day) ?? false
            return (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={cn('w-12', !active && 'text-muted-foreground')}
                disabled={!cfg}
                onClick={() => toggleDay(day)}
              >
                {t(`day.${day}`)}
              </Button>
            )
          })}
        </div>
      </div>

      {noWindow && <p className="text-xs text-status-starting">{t('settings.schedule.noWindowWarning')}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">
          {cfg ? formatSchedule(cfg, t, lang) : t('common.loading')}
        </p>
        <Button variant="ghost" size="sm" disabled={!cfg} onClick={() => patch(DEFAULT_SCHEDULE)}>
          <RotateCcw />
          {t('settings.schedule.restore')}
        </Button>
      </div>
    </SettingsSection>
  )
}
