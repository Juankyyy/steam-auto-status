import { SegmentedControl } from '@/components/settings/SegmentedControl'
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsSection'
import type { TranslationKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, type AppState, type CountdownPrecision } from '@/lib/tauri'

const COUNTDOWN_OPTIONS: { value: CountdownPrecision; key: TranslationKey }[] = [
  { value: 'hours', key: 'settings.appearance.countdownHours' },
  { value: 'minutes', key: 'settings.appearance.countdownMinutes' },
  { value: 'seconds', key: 'settings.appearance.countdownSeconds' },
]

/** Settings › Appearance: how much detail the dashboard countdown shows. */
export function AppearanceSettings({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  const cfg = state?.config
  const countdownOptions = COUNTDOWN_OPTIONS.map(({ value, key }) => ({
    value,
    label: t(key),
  }))

  return (
    <SettingsSection
      title={t('settings.appearance.title')}
      description={t('settings.appearance.description')}
      contentClassName="gap-0"
    >
      <SettingsRow
        label={t('settings.appearance.countdown')}
        hint={t('settings.appearance.countdownHint')}
        control={
          <SegmentedControl
            options={countdownOptions}
            value={cfg?.countdownPrecision}
            onChange={(value) => void cmd('setConfig', { countdownPrecision: value })}
            ariaLabel={t('settings.appearance.countdown')}
            disabled={!cfg}
          />
        }
      />
    </SettingsSection>
  )
}
