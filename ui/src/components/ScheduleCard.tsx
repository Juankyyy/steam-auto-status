import { Link } from 'react-router'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/lib/i18n-context'
import { formatSchedule } from '@/lib/schedule'
import { cmd, type AppState } from '@/lib/tauri'

/** Dashboard quick view of the schedule: summary, pause switch and link to Settings. */
export function ScheduleCard({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const cfg = state?.config

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('schedule.title')}</CardTitle>
        <CardDescription>{cfg ? formatSchedule(cfg, t, lang) : t('common.loading')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="quick-pause">{t('schedule.quickLabel')}</Label>
            <p className="text-xs text-muted-foreground">{t('schedule.quickHint')}</p>
          </div>
          <Switch
            id="quick-pause"
            checked={cfg ? !cfg.paused : false}
            disabled={!cfg}
            onCheckedChange={(checked) => void cmd('setConfig', { paused: !checked })}
          />
        </div>

        <Button variant="outline" size="sm" asChild className="justify-self-start">
          <Link to="/settings">
            <Pencil />
            {t('schedule.editInSettings')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
