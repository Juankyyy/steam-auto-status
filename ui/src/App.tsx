import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from '@/components/Layout'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppContext, type AppContextValue } from '@/lib/app-context'
import { I18nContext, useI18nValue } from '@/lib/i18n-context'
import { cmd, getCachedState, isHiddenLaunch, isTauri, onSidecarMessage, showMainWindow, type AppState } from '@/lib/tauri'
import { Dashboard } from '@/pages/Dashboard'
import { Dev } from '@/pages/Dev'
import { Settings } from '@/pages/Settings'

/** Wraps the modules with the active language (source of truth: config.language). */
function I18nProvider({ children }: { children: ReactNode }) {
  const i18n = useI18nValue()
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    void (async () => {
      try {
        // First, register the listener: even if something fails later, the panel keeps receiving state
        if (isTauri) {
          unlisten = await onSidecarMessage((msg) => {
            if (disposed) return
            if (msg.type === 'event') {
              if (msg.event === 'state') {
                setState(msg.data as AppState)
              } else if (msg.event === 'log') {
                const line = (msg.data as { line?: string } | undefined)?.line
                if (line) setLogs((prev) => [...prev.slice(-400), line])
              } else if (msg.event === 'logsCleared') {
                setLogs([])
              }
            } else if (msg.type === 'res') {
              const lines = (msg.result as { lines?: string[] } | undefined)?.lines
              if (Array.isArray(lines)) setLogs(lines)
            }
          })
        }

        // Initial cached state (it may arrive null right at startup; events fill it in)
        const initial = await getCachedState()
        if (!disposed && initial) setState(initial)

        if (isTauri) {
          void cmd('getLogTail', { lines: 200 })
          try {
            if (!(await isHiddenLaunch())) await showMainWindow()
          } catch (e) {
            console.error('Failed to show window:', e)
          }
        }
      } catch (e) {
        console.error('Failed to initialize panel:', e)
      }
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  // Shared with every module through the app context (see lib/app-context.ts)
  const appData = useMemo<AppContextValue>(() => ({ state, logs }), [state, logs])

  return (
    <TooltipProvider>
      <AppContext.Provider value={appData}>
        {/* Hash routing: works in the Tauri webview and on a static PWA host alike
            (deep links land on index.html, so no server rewrites are needed). */}
        <I18nProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="settings" element={<Settings />} />
                <Route path="dev" element={<Dev />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </I18nProvider>
      </AppContext.Provider>
    </TooltipProvider>
  )
}
