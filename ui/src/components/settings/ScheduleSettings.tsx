import { useState } from 'react'
import { ScheduleWindowBar } from '@/components/settings/ScheduleWindowBar'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { TimeField } from '@/components/settings/TimeField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/lib/i18n-context'
import { DAY_ORDER, windowMinutes } from '@/lib/schedule'
import { cmd, type AppState, type Day } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const FALLBACK_WINDOW = {
  onlineFrom: '17:30',
  onlineUntil: '01:00',
} as const

type WindowDraft = {
  onlineFrom: string
  onlineUntil: string
}

/** Settings › Schedule: Online window (hours and weekdays). */
export function ScheduleSettings({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  const cfg = state?.config
  const patch = (params: Record<string, unknown>) => void cmd('setConfig', params)
  const [draft, setDraft] = useState<WindowDraft | null>(null)
  const enabled = !!cfg && !cfg.paused

  // Optimistic values: the controls follow the draft while the core saves, so a
  // drag never flashes back to the previous config.
  const onlineFrom = draft?.onlineFrom ?? cfg?.onlineFrom ?? FALLBACK_WINDOW.onlineFrom
  const onlineUntil = draft?.onlineUntil ?? cfg?.onlineUntil ?? FALLBACK_WINDOW.onlineUntil

  const commitWindow = (next: Partial<WindowDraft>) => {
    const value: WindowDraft = {
      onlineFrom: next.onlineFrom ?? onlineFrom,
      onlineUntil: next.onlineUntil ?? onlineUntil,
    }
    setDraft(value)
    patch(value)
  }

  const toggleDay = (day: Day) => {
    if (!cfg || cfg.paused) return
    const has = cfg.days.includes(day)
    const next = DAY_ORDER.filter((d) => (d === day ? !has : cfg.days.includes(d)))
    patch({ days: next })
  }

  const noWindow = !!cfg && windowMinutes(onlineFrom, onlineUntil) === 0

  return (
    <SettingsSection
      title={t('settings.schedule.title')}
      description={t('settings.schedule.description')}
      contentClassName="gap-5"
      action={
        <Switch
          id="schedule-enabled"
          aria-label={t('settings.schedule.toggle')}
          title={t('settings.schedule.enabledHint')}
          checked={enabled}
          disabled={!cfg}
          onCheckedChange={(checked) => void cmd(checked ? 'resume' : 'pause')}
          className="mt-0.5"
        />
      }
    >
      <div className="grid gap-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField
            id="from"
            label={t('settings.schedule.from')}
            value={onlineFrom}
            disabled={!enabled}
            onCommit={(value) => commitWindow({ onlineFrom: value })}
          />
          <TimeField
            id="until"
            label={t('settings.schedule.until')}
            value={onlineUntil}
            disabled={!enabled}
            onCommit={(value) => commitWindow({ onlineUntil: value })}
          />
        </div>
        <p
          className={cn(
            'text-xs text-muted-foreground transition-opacity duration-200',
            !enabled && 'opacity-50',
          )}
        >
          {t('settings.schedule.timeHint')}
        </p>
      </div>

      <ScheduleWindowBar
        from={onlineFrom}
        until={onlineUntil}
        disabled={!enabled}
        onDraft={(nextFrom, nextUntil) =>
          setDraft({ onlineFrom: nextFrom, onlineUntil: nextUntil })
        }
        onCommit={(nextFrom, nextUntil) =>
          commitWindow({ onlineFrom: nextFrom, onlineUntil: nextUntil })
        }
      />

      <div className="grid gap-2">
        <Label className={cn('transition-opacity duration-200', !enabled && 'opacity-50')}>
          {t('settings.schedule.days')}
        </Label>
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
                disabled={!enabled}
                onClick={() => toggleDay(day)}
              >
                {t(`day.${day}`)}
              </Button>
            )
          })}
        </div>
      </div>

      {noWindow && (
        <p
          className={cn(
            'text-xs text-status-starting transition-opacity duration-200',
            !enabled && 'opacity-50',
          )}
        >
          {t('settings.schedule.noWindowWarning')}
        </p>
      )}
    </SettingsSection>
  )
}
