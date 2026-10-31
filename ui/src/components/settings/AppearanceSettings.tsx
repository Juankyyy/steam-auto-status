import { SegmentedControl } from '@/components/settings/SegmentedControl'
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsSection'
import type { TranslationKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import {
  cmd,
  type AppBackground,
  type AppState,
  type CountdownPrecision,
} from '@/lib/tauri'

const COUNTDOWN_OPTIONS: { value: CountdownPrecision; key: TranslationKey }[] = [
  { value: 'hours', key: 'settings.appearance.countdownHours' },
  { value: 'minutes', key: 'settings.appearance.countdownMinutes' },
  { value: 'seconds', key: 'settings.appearance.countdownSeconds' },
]

const BACKGROUND_OPTIONS: { value: AppBackground; key: TranslationKey }[] = [
  { value: 'full', key: 'settings.appearance.backgroundFull' },
  { value: 'static', key: 'settings.appearance.backgroundStatic' },
  { value: 'none', key: 'settings.appearance.backgroundOff' },
]

/** Settings › Appearance: countdown and app background. */
export function AppearanceSettings({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  const cfg = state?.config
  const countdownOptions = COUNTDOWN_OPTIONS.map(({ value, key }) => ({
    value,
    label: t(key),
  }))
  const backgroundOptions = BACKGROUND_OPTIONS.map(({ value, key }) => ({
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

      <SettingsRow
        label={t('settings.appearance.background')}
        hint={t('settings.appearance.backgroundHint')}
        control={
          <SegmentedControl
            options={backgroundOptions}
            value={cfg?.appBackground}
            onChange={(value) => void cmd('setConfig', { appBackground: value })}
            ariaLabel={t('settings.appearance.background')}
            disabled={!cfg}
          />
        }
      />
    </SettingsSection>
  )
}
