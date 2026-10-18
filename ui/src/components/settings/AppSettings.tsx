import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/lib/i18n-context'
import { cmd, setAutostart, type AppState } from '@/lib/tauri'

/** Settings › App: Windows startup, notifications and developer mode. */
export function AppSettings({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  const cfg = state?.config

  const setFlag = (key: 'startWithWindows' | 'notifications' | 'devMode') => (checked: boolean) => {
    if (key === 'startWithWindows') void setAutostart(checked)
    void cmd('setConfig', { [key]: checked })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.app.title')}</CardTitle>
        <CardDescription>{t('settings.app.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="autostart">{t('settings.app.autostart')}</Label>
            <p className="text-xs text-muted-foreground">{t('settings.app.autostartHint')}</p>
          </div>
          <Switch
            id="autostart"
            checked={cfg?.startWithWindows ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('startWithWindows')}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notifications">{t('settings.app.notifications')}</Label>
            <p className="text-xs text-muted-foreground">{t('settings.app.notificationsHint')}</p>
          </div>
          <Switch
            id="notifications"
            checked={cfg?.notifications ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('notifications')}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="devmode">{t('settings.app.devMode')}</Label>
            <p className="text-xs text-muted-foreground">{t('settings.app.devModeHint')}</p>
          </div>
          <Switch
            id="devmode"
            checked={cfg?.devMode ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('devMode')}
          />
        </div>
      </CardContent>
    </Card>
  )
}
