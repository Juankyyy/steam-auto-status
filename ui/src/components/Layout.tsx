import { LayoutDashboard, Settings, Terminal } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { TitleBar } from '@/components/TitleBar'
import { Badge } from '@/components/ui/badge'
import { useAppContext } from '@/lib/app-context'
import { useI18n } from '@/lib/i18n-context'
import type { AppState } from '@/lib/tauri'
import { cn } from '@/lib/utils'

/** Navigation targets of the app shell: one entry per module (`key` is a translation key). */
const NAV_ITEMS = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/settings', key: 'nav.settings', icon: Settings, end: false },
] as const

/** Extra tab, only listed while developer mode is enabled in settings. */
const DEV_NAV_ITEM = { to: '/dev', key: 'nav.dev', icon: Terminal, end: false } as const

/** Steam client badge: the app no longer has an account of its own. */
function SteamClientBadge({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  if (!state) return <Badge variant="outline">{t('common.loading')}</Badge>
  if (!state.steamRunning) {
    return (
      <Badge variant="outline" className="border-red-500/40 text-red-400">
        {t('steamClient.closed')}
      </Badge>
    )
  }
  if (state.steamStarting) {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-400">
        {t('steamClient.starting')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
      {t('steamClient.running')}
    </Badge>
  )
}

/** Application shell: custom titlebar, module navigation and Steam status + routed module. */
export function Layout() {
  const { state } = useAppContext()
  const { t } = useI18n()
  const navItems = state?.config.devMode ? [...NAV_ITEMS, DEV_NAV_ITEM] : NAV_ITEMS

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Window chrome and module header stay fixed; only the module content scrolls. */}
      <div className="shrink-0 bg-background">
        <TitleBar />

        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/60 px-6 py-3">
          <nav aria-label={t('nav.label')} className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {navItems.map(({ to, key, icon: Icon, end }) => (
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
                {t(key)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            <SteamClientBadge state={state} />
          </div>
        </header>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
