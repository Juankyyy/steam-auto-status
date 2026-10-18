import { Link } from 'react-router'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatSchedule } from '@/lib/schedule'
import { cmd, type AppState } from '@/lib/tauri'

/** Dashboard quick view of the schedule: summary, pause switch and link to Settings. */
export function ScheduleCard({ state }: { state: AppState | null }) {
  const cfg = state?.config

  return (
    <Card>
      <CardHeader>
        <CardTitle>Programación</CardTitle>
        <CardDescription>{cfg ? formatSchedule(cfg) : 'Cargando…'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="quick-pause">Automatización activa</Label>
            <p className="text-xs text-muted-foreground">Al pausarla, tu sesión pasa a Invisible y no cambia sola.</p>
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
            Editar en Ajustes
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
