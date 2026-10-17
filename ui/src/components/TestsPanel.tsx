import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cmd, type AppState } from '@/lib/tauri'

export function TestsPanel({ state, logs }: { state: AppState | null; logs: string[] }) {
  const [minutes, setMinutes] = useState(30)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const disabled = state?.connection !== 'connected'

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Pruebas y registro</CardTitle>
        <CardDescription>
          Fuerza un estado temporal para comprobar cómo te ven tus amigos; al terminar vuelve solo al horario.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void cmd('forceState', { state: 'online', minutes })}
          >
            Conectado {minutes} min
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void cmd('forceState', { state: 'invisible', minutes })}
          >
            Invisible {minutes} min
          </Button>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[5, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
          {state?.forced && (
            <Button size="sm" variant="secondary" onClick={() => void cmd('clearForce')}>
              Cancelar forzado
            </Button>
          )}
        </div>

        <div
          ref={scrollRef}
          className="h-56 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs leading-relaxed"
        >
          {logs.length === 0 ? (
            <div className="text-muted-foreground">Sin registros todavía…</div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all text-muted-foreground">
                {line}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
