import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n-context'
import type { TranslationKey } from '@/lib/i18n'
import { cmd, type AppState, type CountdownPrecision } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const OPTIONS: { value: CountdownPrecision; key: TranslationKey }[] = [
  { value: 'hours', key: 'settings.appearance.countdownHours' },
  { value: 'minutes', key: 'settings.appearance.countdownMinutes' },
  { value: 'seconds', key: 'settings.appearance.countdownSeconds' },
]

/** Settings › Appearance: how much detail the dashboard countdown shows. */
export function AppearanceSettings({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  const cfg = state?.config

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.appearance.title')}</CardTitle>
        <CardDescription>{t('settings.appearance.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div>
          <p className="text-sm font-medium">{t('settings.appearance.countdown')}</p>
          <p className="text-xs text-muted-foreground">{t('settings.appearance.countdownHint')}</p>
        </div>

        <div
          role="radiogroup"
          aria-label={t('settings.appearance.countdown')}
          className="flex w-fit flex-wrap gap-1 rounded-lg border border-border/60 p-1"
        >
          {OPTIONS.map(({ value, key }) => {
            const active = cfg?.countdownPrecision === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!cfg}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => void cmd('setConfig', { countdownPrecision: value })}
              >
                {t(key)}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
