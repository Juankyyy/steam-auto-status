import { Bug, Download, ExternalLink } from 'lucide-react'
import logoUrl from '@/assets/logo.svg'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { openUrl } from '@/lib/tauri'

const REPO_URL = 'https://github.com/Juankyyy/steam-auto-status'

/** Settings › About: version and links to the project. */
export function AboutSettings() {
  const { t } = useI18n()

  return (
    <SettingsSection
      title={t('settings.about.title')}
      description={`Steam Auto Status v${__APP_VERSION__}`}
    >
      <div className="flex items-start gap-3">
        <img src={logoUrl} alt="" aria-hidden className="size-10 shrink-0" />
        <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.about.blurb')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void openUrl(REPO_URL)}>
          <ExternalLink />
          {t('settings.about.repo')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void openUrl(`${REPO_URL}/releases/latest`)}
        >
          <Download />
          {t('settings.about.latest')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openUrl(`${REPO_URL}/issues`)}>
          <Bug />
          {t('settings.about.report')}
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.about.updates')}</p>
    </SettingsSection>
  )
}
