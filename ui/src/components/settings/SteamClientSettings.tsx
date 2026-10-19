import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatClockAt } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, openSteam, openUrl, type AppState } from '@/lib/tauri'

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

  const lastApplied = state?.lastAppliedAt
    ? t('steamClient.lastAppliedValue', {
        state: t(state.persona === 'online' ? 'common.online' : 'common.invisible'),
        time: formatClockAt(state.lastAppliedAt, lang),
      })
    : t('steamClient.never')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('steamClient.title')}</CardTitle>
        <CardDescription>{t('steamClient.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <p className="text-sm font-medium">{clientState}</p>
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
          <div className="grid gap-3 border-t border-border/60 pt-4">
            <div className="grid gap-0.5">
              <p className="text-sm font-medium">{t('steamClient.legacyTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('steamClient.legacyDescription')}</p>
              <p className="text-xs text-muted-foreground">{t('steamClient.legacyHint')}</p>
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
      </CardContent>
    </Card>
  )
}
