import { LayoutDashboard, LogIn, Settings, Terminal } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import logoUrl from '@/assets/logo.svg'
import { AccountChip } from '@/components/AccountChip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppContext } from '@/lib/app-context'
import type { AppState } from '@/lib/tauri'
import { cn } from '@/lib/utils'

/** Navigation targets of the app shell: one entry per module. */
const NAV_ITEMS = [
  { to: '/', label: 'Panel de control', icon: LayoutDashboard, end: true },
  { to: '/settings', label: 'Ajustes', icon: Settings, end: false },
]

/** Extra tab, only listed while developer mode is enabled in settings. */
const DEV_NAV_ITEM = { to: '/dev', label: 'Desarrollador', icon: Terminal, end: false }

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

/** Header right side: account chip, connection badge, or a login shortcut when no session exists. */
function accountArea(state: AppState | null) {
  if (state?.account) return <AccountChip state={state} />
  // Loading, connecting, or with a saved session: the connection badge tells the story
  if (!state || state.authPresent || state.connection !== 'disconnected' || state.loginPhase !== 'idle') {
    return connectionBadge(state)
  }
  // No session and nothing in progress: offer the login (the panel lives in the dashboard)
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/">
        <LogIn className="size-4" />
        Iniciar sesión
      </Link>
    </Button>
  )
}

/** Application shell: header (brand, module navigation, Steam status) + routed module. */
export function Layout() {
  const { state } = useAppContext()
  const navItems = state?.config.devMode ? [...NAV_ITEMS, DEV_NAV_ITEM] : NAV_ITEMS

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/60 px-6 py-3">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" aria-hidden className="size-7 shrink-0" />
          <h1 className="text-lg font-semibold tracking-tight">Steam Auto Status</h1>
          <Badge variant="outline" className="font-mono text-muted-foreground">
            v{__APP_VERSION__}
          </Badge>
        </div>

        <nav aria-label="Módulos" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
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

        <div className="ml-auto">{accountArea(state)}</div>
      </header>

      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
