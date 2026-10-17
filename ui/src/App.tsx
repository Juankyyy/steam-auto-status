import { useEffect, useState } from 'react'
import { ConfigPanel } from '@/components/ConfigPanel'
import { LoginPanel } from '@/components/LoginPanel'
import { StatusPanel } from '@/components/StatusPanel'
import { TestsPanel } from '@/components/TestsPanel'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cmd, getCachedState, isTauri, onSidecarMessage, showMainWindow, type AppState } from '@/lib/tauri'

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [needLogin, setNeedLogin] = useState(false)
  const [loginReason, setLoginReason] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    void (async () => {
      const initial = await getCachedState()
      if (!disposed && initial) setState(initial)

      if (isTauri) {
        await showMainWindow()
        void cmd('getLogTail', { lines: 200 })

        unlisten = await onSidecarMessage((msg) => {
          if (msg.type === 'event') {
            if (msg.event === 'state') {
              const s = msg.data as AppState
              setState(s)
              if (s.connection === 'connected') setNeedLogin(false)
            } else if (msg.event === 'log') {
              const line = (msg.data as { line?: string } | undefined)?.line
              if (line) setLogs((prev) => [...prev.slice(-400), line])
            } else if (msg.event === 'authRequired') {
              const d = msg.data as { reason?: string } | undefined
              setNeedLogin(true)
              setLoginReason(d?.reason ?? null)
            }
          } else if (msg.type === 'res') {
            const lines = (msg.result as { lines?: string[] } | undefined)?.lines
            if (Array.isArray(lines)) setLogs(lines)
          }
        })
      }
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const showLogin =
    !!state && state.connection !== 'connected' && (!state.authPresent || !!state.guardNeeded || needLogin)

  const connectionBadge = () => {
    if (!state) return <Badge variant="outline">Cargando…</Badge>
    switch (state.connection) {
      case 'connected':
        return (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
            Conectado a Steam
          </Badge>
        )
      case 'connecting':
        return (
          <Badge variant="outline" className="border-amber-500/40 text-amber-400">
            Conectando…
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="border-red-500/40 text-red-400">
            Sin conexión
          </Badge>
        )
    }
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
          <span
            className={
              'size-2.5 rounded-full ' +
              (state?.persona === 'online'
                ? 'bg-emerald-400'
                : state?.connection === 'connected'
                  ? 'bg-zinc-500'
                  : 'bg-red-500/70')
            }
          />
          <h1 className="text-lg font-semibold tracking-tight">Steam Auto Status</h1>
          <span className="text-xs text-muted-foreground">Panel de control</span>
          <div className="ml-auto">{connectionBadge()}</div>
        </header>

        <main className="grid flex-1 gap-6 p-6">
          <StatusPanel state={state} />

          {showLogin && (
            <LoginPanel
              guard={state?.guardNeeded ?? null}
              phase={state?.loginPhase ?? 'idle'}
              qrDataUrl={state?.qrDataUrl ?? null}
              error={state?.lastError?.message ?? null}
              reason={loginReason}
            />
          )}

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <ConfigPanel state={state} />
            <TestsPanel state={state} logs={logs} />
          </div>
        </main>

        <footer className="px-6 pb-5 text-xs text-muted-foreground">
          Datos en <span className="font-mono">{state?.dataDir ?? '—'}</span>
        </footer>
      </div>
    </TooltipProvider>
  )
}
