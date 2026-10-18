import { LayoutDashboard, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { useAppContext } from '@/lib/app-context'
import type { AppState } from '@/lib/tauri'
import { cn } from '@/lib/utils'

/** Navigation targets of the app shell: one entry per module. */
const NAV_ITEMS = [
  { to: '/', label: 'Panel de control', icon: LayoutDashboard, end: true },
  { to: '/settings', label: 'Ajustes', icon: Settings, end: false },
]

function connectionBadge(state: AppState | null) {
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

/** Application shell: header (brand, module navigation, Steam status) + routed module. */
export function Layout() {
  const { state } = useAppContext()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'size-2.5 rounded-full',
              state?.persona === 'online'
                ? 'bg-emerald-400'
                : state?.connection === 'connected'
                  ? 'bg-zinc-500'
                  : 'bg-red-500/70',
            )}
          />
          <h1 className="text-lg font-semibold tracking-tight">Steam Auto Status</h1>
        </div>

        <nav aria-label="Módulos" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-background text-foreground shadow-sm dark:bg-input/30'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto">{connectionBadge(state)}</div>
      </header>

      <main className="flex-1 p-6">
        <Outlet />
      </main>

      <footer className="px-6 pb-5 text-xs text-muted-foreground">
        Datos en <span className="font-mono">{state?.dataDir ?? '—'}</span>
      </footer>
    </div>
  )
}
