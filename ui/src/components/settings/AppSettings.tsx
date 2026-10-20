import { SegmentedControl } from '@/components/settings/SegmentedControl'
import { SettingsGroup, SettingsRow, SettingsSection } from '@/components/settings/SettingsSection'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, setAutostart, type AppState, type Language } from '@/lib/tauri'

const LANGUAGE_OPTIONS = (Object.keys(LANGUAGE_NAMES) as Language[]).map((value) => ({
  value,
  label: LANGUAGE_NAMES[value],
}))

/** Settings › Application: Windows startup, language, notifications and developer mode. */
export function AppSettings({ state }: { state: AppState | null }) {
  const { t, lang, setLanguage } = useI18n()
  const cfg = state?.config

  const setFlag = (key: 'startWithWindows' | 'notifications' | 'devMode') => (checked: boolean) => {
    if (key === 'startWithWindows') void setAutostart(checked)
    void cmd('setConfig', { [key]: checked })
  }

  return (
    <SettingsSection
      title={t('settings.app.title')}
      description={t('settings.app.description')}
      contentClassName="gap-0"
    >
      <SettingsRow
        label={<Label htmlFor="autostart">{t('settings.app.autostart')}</Label>}
        hint={t('settings.app.autostartHint')}
        control={
          <Switch
            id="autostart"
            checked={cfg?.startWithWindows ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('startWithWindows')}
          />
        }
      />

      <SettingsRow
        label={<Label htmlFor="notifications">{t('settings.app.notifications')}</Label>}
        hint={t('settings.app.notificationsHint')}
        control={
          <Switch
            id="notifications"
            checked={cfg?.notifications ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('notifications')}
          />
        }
      />

      <SettingsRow
        label={t('settings.language.title')}
        hint={t('settings.language.description')}
        control={
          <SegmentedControl
            options={LANGUAGE_OPTIONS}
            value={lang}
            onChange={setLanguage}
            ariaLabel={t('settings.language.title')}
          />
        }
      />

      <SettingsGroup title={t('settings.app.advanced')} className="mt-1">
        <SettingsRow
          label={<Label htmlFor="devmode">{t('settings.app.devMode')}</Label>}
          hint={t('settings.app.devModeHint')}
          control={
            <Switch
              id="devmode"
              checked={cfg?.devMode ?? false}
              disabled={!cfg}
              onCheckedChange={setFlag('devMode')}
            />
          }
        />
      </SettingsGroup>
    </SettingsSection>
  )
}
