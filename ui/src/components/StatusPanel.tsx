import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cmd, formatDuration, type AppState } from '@/lib/tauri'

function statusText(state: AppState | null): string {
  if (!state) return 'Cargando…'
  if (state.persona === 'online') return 'Conectado'
  if (state.persona === 'invisible') return 'Invisible'
  return 'Sin sesión'
}

function statusSubtitle(state: AppState | null): string {
  if (!state) return ''
  switch (state.connection) {
    case 'connected':
      return state.account?.name
        ? `Sesión activa como ${state.account.name}`
        : 'Sesión activa en Steam'
    case 'connecting':
      return 'Conectando con Steam…'
    default:
      return 'Sin conexión con Steam'
  }
}

export function StatusPanel({ state }: { state: AppState | null }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const online = state?.persona === 'online'
  const connected = state?.connection === 'connected'

  const countdownMs = state?.nextTransition ? state.nextTransition.at - now : null
  const nextLabel = state?.nextTransitionLabel ?? '—'
  const nextTo = state?.nextTransition?.to

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <span
            className={
              'size-4 rounded-full ring-4 ' +
              (online ? 'bg-emerald-400 ring-emerald-500/20' : connected ? 'bg-zinc-500 ring-zinc-500/20' : 'bg-red-500/70 ring-red-500/20')
            }
          />
          <div className="min-w-40">
            <div className="text-3xl font-semibold tracking-tight">{statusText(state)}</div>
            <div className="text-sm text-muted-foreground">{statusSubtitle(state)}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Próximo cambio</div>
            <div className="text-sm font-medium">{nextLabel}</div>
            {countdownMs !== null && (
              <div className="text-2xl font-semibold tabular-nums text-muted-foreground">
                {countdownMs > 0 ? `en ${formatDuration(countdownMs)}` : 'ahora'}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state?.paused && <Badge variant="secondary">Automatización en pausa</Badge>}
          {!state?.paused && state?.inWindow && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
              Dentro de la franja
            </Badge>
          )}
          {!state?.paused && state && !state.inWindow && (
            <Badge variant="outline" className="border-zinc-500/40 text-zinc-400">
              Fuera de la franja
            </Badge>
          )}
          {state?.forced && (
            <Badge variant="outline" className="border-sky-500/40 text-sky-400">
              Forzado {state.forced.persona === 'online' ? 'Conectado' : 'Invisible'} hasta las{' '}
              {new Date(state.forced.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Badge>
          )}
          {nextTo && nextLabel !== 'Sin programación' && (
            <span className="text-xs text-muted-foreground">
              Horario: {state?.config.days.length ?? 0} días · {state?.config.onlineFrom}–{state?.config.onlineUntil}
            </span>
          )}
        </div>

        {state?.lastError && state.connection !== 'connected' && (
          <Alert variant="destructive">
            <AlertTitle>Error de conexión con Steam</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{state.lastError.message}</span>
              <Button size="sm" variant="outline" onClick={() => void cmd('reconnect')}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
