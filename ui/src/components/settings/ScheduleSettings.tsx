import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DAY_LABELS, formatSchedule, windowMinutes } from '@/lib/schedule'
import { cmd, type AppState, type Day } from '@/lib/tauri'
import { cn } from '@/lib/utils'

const DEFAULT_SCHEDULE = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'] as Day[],
  onlineFrom: '17:30',
  onlineUntil: '01:00',
}

/** Settings › Schedule: Online window (hours and weekdays). */
export function ScheduleSettings({ state }: { state: AppState | null }) {
  const cfg = state?.config
  const patch = (params: Record<string, unknown>) => void cmd('setConfig', params)

  const toggleDay = (day: Day) => {
    if (!cfg) return
    const has = cfg.days.includes(day)
    const next = DAY_LABELS.map((d) => d.id).filter((d) => (d === day ? !has : cfg.days.includes(d)))
    patch({ days: next })
  }

  const noWindow = !!cfg && windowMinutes(cfg.onlineFrom, cfg.onlineUntil) === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario</CardTitle>
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

        {noWindow && (
          <p className="text-xs text-amber-400">
            La hora de inicio y la de fin coinciden: ahora mismo no habría ninguna franja Conectado.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">{cfg ? formatSchedule(cfg) : 'Cargando…'}</p>
          <Button variant="ghost" size="sm" disabled={!cfg} onClick={() => patch(DEFAULT_SCHEDULE)}>
            <RotateCcw />
            Restaurar por defecto
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
