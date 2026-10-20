import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { formatClockAt } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, openSteam, openUrl, type AppState } from '@/lib/tauri'
import { cn } from '@/lib/utils'

/**
 * Settings › Steam client.
 *
 * There is no account session anymore: the app controls the official client that is
 * already open. This card explains that, shows the client state, and offers the cleanup
 * for the files left behind by the old login-based version.
 */
export function SteamClientSettings({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()

  const deleteLegacyData = () => {
    if (window.confirm(t('steamClient.legacyConfirm'))) void cmd('deleteLegacyData')
  }

  const clientState = !state
    ? t('common.loading')
    : !state.steamRunning
      ? t('steamClient.closed')
      : state.steamStarting
        ? t('steamClient.starting')
        : t('steamClient.running')

  const statusTone = !state
    ? 'text-muted-foreground'
    : state.steamStarting
      ? 'text-status-starting'
      : state.steamRunning
        ? 'text-status-online'
        : 'text-status-closed'

  const lastApplied = state?.lastAppliedAt
    ? t('steamClient.lastAppliedValue', {
        state: t(state.persona === 'online' ? 'common.online' : 'common.invisible'),
        time: formatClockAt(state.lastAppliedAt, lang),
      })
    : t('steamClient.never')

  return (
    <SettingsSection title={t('steamClient.title')} description={t('steamClient.description')}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <div className={cn('flex items-center gap-2', statusTone)}>
            <span
              className={cn(
                'status-dot',
                state?.steamRunning && !state.steamStarting
                  ? 'status-dot--pulse'
                  : 'status-dot--blink',
              )}
              aria-hidden="true"
            />
            <p className="text-sm font-medium">{clientState}</p>
          </div>
          <p className="text-xs text-muted-foreground">{t('steamClient.requirement')}</p>
          <p className="text-xs text-muted-foreground">
            {t('steamClient.lastApplied')}: {lastApplied}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state && !state.steamRunning && (
            <Button size="sm" variant="outline" onClick={() => void openSteam()}>
              {t('steamClient.open')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => void cmd('reapply')}>
            {t('steamClient.reapply')}
          </Button>
        </div>
      </div>

      {state?.legacyDataPresent && (
        <div className="grid gap-3 rounded-lg border border-status-starting/30 bg-status-starting/5 p-4">
          <div className="grid gap-1">
            <p className="text-sm font-medium">{t('steamClient.legacyTitle')}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('steamClient.legacyDescription')}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('steamClient.legacyHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onClick={deleteLegacyData}>
              {t('steamClient.legacyDelete')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openUrl('https://store.steampowered.com/account/authorizeddevices')}
            >
              {t('steamClient.revoke')}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
