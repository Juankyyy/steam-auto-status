import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ScheduleWindowBar } from '@/components/settings/ScheduleWindowBar'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { TimeField } from '@/components/settings/TimeField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/lib/i18n-context'
import { DAY_ORDER, formatDayRange, windowMinutes } from '@/lib/schedule'
import { cmd, type AppState, type Day, type ScheduleWindow } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const FALLBACK_WINDOW: ScheduleWindow = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  from: '17:30',
  until: '01:00',
}

type ScheduleSettingsProps = {
  state: AppState | null
}

/** Settings › Schedule: a list of independent Online windows. */
export function ScheduleSettings({ state }: ScheduleSettingsProps) {
  const { t } = useI18n()
  const cfg = state?.config
  const [draft, setDraft] = useState<ScheduleWindow[] | null>(null)
  const enabled = !!cfg && !cfg.paused

  // Optimistic list: controls follow the draft while the core saves, so dragging a
  // window end never flashes back to the previous config.
  const windows = draft ?? cfg?.windows ?? [FALLBACK_WINDOW]

  const updateWindow = (
    index: number,
    changes: Partial<ScheduleWindow>,
    persist: boolean,
  ) => {
    if (!enabled) return
    const next = windows.map((window, i) =>
      i === index ? { ...window, ...changes } : window,
    )
    setDraft(next)
    if (persist) void cmd('setConfig', { windows: next })
  }

  const toggleDay = (index: number, day: Day) => {
    const window = windows[index]
    if (!enabled || !window) return
    const has = window.days.includes(day)
    const days = DAY_ORDER.filter((d) => (d === day ? !has : window.days.includes(d)))
    updateWindow(index, { days }, true)
  }

  const addWindow = () => {
    if (!enabled) return
    const used = new Set(windows.flatMap((window) => window.days))
    const unused = DAY_ORDER.filter((day) => !used.has(day))
    // With no schedules yet, start from the app's weekday default; afterwards, pick
    // the days no other schedule uses (a weekday block makes the next one Sat–Sun).
    const days =
      unused.length === DAY_ORDER.length
        ? DAY_ORDER.filter((day) => day !== 'sat' && day !== 'sun')
        : unused
    const last = windows[windows.length - 1]
    const next: ScheduleWindow = {
      days,
      from: last?.from ?? FALLBACK_WINDOW.from,
      until: last?.until ?? FALLBACK_WINDOW.until,
    }
    setDraft([...windows, next])
    void cmd('setConfig', { windows: [...windows, next] })
  }

  const removeWindow = (index: number) => {
    if (!enabled) return
    const next = windows.filter((_, i) => i !== index)
    setDraft(next)
    void cmd('setConfig', { windows: next })
  }

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
      {windows.length === 0 ? (
        <p
          className={cn(
            'rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground transition-opacity duration-200',
            !enabled && 'opacity-50',
          )}
        >
          {t('settings.schedule.empty')}
        </p>
      ) : (
        <div className="grid gap-3">
          {windows.map((window, index) => (
            <ScheduleCard
              key={index}
              index={index}
              window={window}
              enabled={enabled}
              onChange={(changes, persist) => updateWindow(index, changes, persist)}
              onToggleDay={(day) => toggleDay(index, day)}
              onRemove={() => removeWindow(index)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p
          className={cn(
            'text-xs text-muted-foreground transition-opacity duration-200',
            !enabled && 'opacity-50',
          )}
        >
          {t('settings.schedule.daysHint')}
        </p>
        <Button type="button" size="sm" variant="outline" disabled={!enabled} onClick={addWindow}>
          <Plus aria-hidden="true" />
          {t('settings.schedule.add')}
        </Button>
      </div>
    </SettingsSection>
  )
}

type ScheduleCardProps = {
  index: number
  window: ScheduleWindow
  enabled: boolean
  onChange: (changes: Partial<ScheduleWindow>, persist: boolean) => void
  onToggleDay: (day: Day) => void
  onRemove: () => void
}

/** One schedule block: its days, hours and draggable 24 h strip. */
function ScheduleCard({
  index,
  window,
  enabled,
  onChange,
  onToggleDay,
  onRemove,
}: ScheduleCardProps) {
  const { t } = useI18n()
  const titleId = `schedule-window-${index}`
  const dayRange = formatDayRange(window.days, t)
  const noDays = window.days.length === 0
  const noWindow = windowMinutes(window.from, window.until) === 0

  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          id={titleId}
          className={cn(
            'text-sm font-medium transition-opacity duration-200',
            !enabled && 'opacity-50',
            noDays && 'text-muted-foreground',
          )}
        >
          {dayRange}
        </h3>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          aria-label={t('settings.schedule.remove', { days: dayRange })}
          title={t('settings.schedule.remove', { days: dayRange })}
          disabled={!enabled}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TimeField
          id={`schedule-${index}-from`}
          label={t('settings.schedule.from')}
          value={window.from}
          disabled={!enabled}
          onCommit={(value) => onChange({ from: value }, true)}
        />
        <TimeField
          id={`schedule-${index}-until`}
          label={t('settings.schedule.until')}
          value={window.until}
          disabled={!enabled}
          onCommit={(value) => onChange({ until: value }, true)}
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

      <ScheduleWindowBar
        from={window.from}
        until={window.until}
        disabled={!enabled}
        onDraft={(from, until) => onChange({ from, until }, false)}
        onCommit={(from, until) => onChange({ from, until }, true)}
      />

      <div className="grid gap-2">
        <Label className={cn('transition-opacity duration-200', !enabled && 'opacity-50')}>
          {t('settings.schedule.days')}
        </Label>
        <div className="flex flex-wrap gap-2">
          {DAY_ORDER.map((day) => {
            const active = window.days.includes(day)
            return (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={cn('w-12', !active && 'text-muted-foreground')}
                disabled={!enabled}
                aria-pressed={active}
                onClick={() => onToggleDay(day)}
              >
                {t(`day.${day}`)}
              </Button>
            )
          })}
        </div>
      </div>

      {noDays && (
        <p
          className={cn(
            'text-xs text-status-starting transition-opacity duration-200',
            !enabled && 'opacity-50',
          )}
        >
          {t('settings.schedule.noDaysWarning')}
        </p>
      )}
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
    </section>
  )
}
