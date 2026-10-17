import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cmd, setAutostart, type AppState, type Day } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const DAY_LABELS: { id: Day; label: string }[] = [
  { id: 'mon', label: 'Lun' },
  { id: 'tue', label: 'Mar' },
  { id: 'wed', label: 'Mié' },
  { id: 'thu', label: 'Jue' },
  { id: 'fri', label: 'Vie' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
]

export function ConfigPanel({ state }: { state: AppState | null }) {
  const cfg = state?.config

  const patch = (params: Record<string, unknown>) => void cmd('setConfig', params)

  const toggleDay = (day: Day) => {
    if (!cfg) return
    const has = cfg.days.includes(day)
    const next = DAY_LABELS.map((d) => d.id).filter((d) => (d === day ? !has : cfg.days.includes(d)))
    patch({ days: next })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración</CardTitle>
        <CardDescription>
          Horario en hora local. Si la hora de fin es anterior a la de inicio, la franja termina al día siguiente
          (p. ej. 17:30 → 01:00).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="from">Conectado desde</Label>
            <Input
              id="from"
              type="time"
              value={cfg?.onlineFrom ?? '17:30'}
              disabled={!cfg}
              onChange={(e) => patch({ onlineFrom: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="until">Hasta</Label>
            <Input
              id="until"
              type="time"
              value={cfg?.onlineUntil ?? '01:00'}
              disabled={!cfg}
              onChange={(e) => patch({ onlineUntil: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Días</Label>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((d) => {
              const active = cfg?.days.includes(d.id) ?? false
              return (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className={cn('w-14', !active && 'text-muted-foreground')}
                  disabled={!cfg}
                  onClick={() => toggleDay(d.id)}
                >
                  {d.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="active">Automatización activa</Label>
              <p className="text-xs text-muted-foreground">Al pausarla, tu sesión pasa a Invisible y no cambia sola.</p>
            </div>
            <Switch
              id="active"
              checked={cfg ? !cfg.paused : false}
              disabled={!cfg}
              onCheckedChange={(checked) => patch({ paused: !checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="autostart">Iniciar con Windows</Label>
              <p className="text-xs text-muted-foreground">Arranca minimizada, solo en la bandeja.</p>
            </div>
            <Switch
              id="autostart"
              checked={cfg?.startWithWindows ?? false}
              disabled={!cfg}
              onCheckedChange={(checked) => {
                void setAutostart(checked)
                patch({ startWithWindows: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="notifications">Notificaciones</Label>
              <p className="text-xs text-muted-foreground">Aviso de Windows al cambiar de estado.</p>
            </div>
            <Switch
              id="notifications"
              checked={cfg?.notifications ?? false}
              disabled={!cfg}
              onCheckedChange={(checked) => patch({ notifications: checked })}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="machine">Nombre de máquina</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-muted-foreground">
                  ?
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Nombre que reporta esta sesión a Steam. Visible solo para ti en tus dispositivos.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="machine"
            value={cfg?.machineName ?? ''}
            maxLength={32}
            disabled={!cfg}
            onChange={(e) => patch({ machineName: e.target.value })}
          />
        </div>

        {state?.authPresent && (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              Cerrar sesión elimina el token guardado; para volver a conectarte tendrás que iniciar sesión de nuevo.
            </p>
            <Button variant="destructive" size="sm" onClick={() => void cmd('logout')}>
              Cerrar sesión
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
