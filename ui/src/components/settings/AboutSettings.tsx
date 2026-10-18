import { Bug, Download, ExternalLink } from 'lucide-react'
import logoUrl from '@/assets/logo.svg'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n-context'
import { openUrl } from '@/lib/tauri'

const REPO_URL = 'https://github.com/Juankyyy/steam-auto-status'

/** Settings › About: version and links to the project. */
export function AboutSettings() {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader>
        <img src={logoUrl} alt="" aria-hidden className="size-10" />
        <CardTitle>{t('settings.about.title')}</CardTitle>
        <CardDescription>Steam Auto Status v{__APP_VERSION__}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">{t('settings.about.blurb')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void openUrl(REPO_URL)}>
            <ExternalLink />
            {t('settings.about.repo')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openUrl(`${REPO_URL}/releases/latest`)}>
            <Download />
            {t('settings.about.latest')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openUrl(`${REPO_URL}/issues`)}>
            <Bug />
            {t('settings.about.report')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.about.updates')}</p>
      </CardContent>
    </Card>
  )
}
