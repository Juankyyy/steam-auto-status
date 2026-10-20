import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LayoutDashboard, Settings, Terminal } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
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
  if (!state) {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <span className="status-dot status-dot--blink" aria-hidden="true" />
        {t('common.loading')}
      </Badge>
    )
  }
  if (!state.steamRunning) {
    return (
      <Badge variant="outline" className="gap-1.5 border-status-closed/40 text-status-closed">
        <span className="status-dot status-dot--blink" aria-hidden="true" />
        {t('steamClient.closed')}
      </Badge>
    )
  }
  if (state.steamStarting) {
    return (
      <Badge variant="outline" className="gap-1.5 border-status-starting/40 text-status-starting">
        <span className="status-dot status-dot--blink" aria-hidden="true" />
        {t('steamClient.starting')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1.5 border-status-online/40 text-status-online">
      <span className="status-dot status-dot--pulse" aria-hidden="true" />
      {t('steamClient.running')}
    </Badge>
  )
}

/** Application shell: custom titlebar, module navigation and Steam status + routed module. */
export function Layout() {
  const { state } = useAppContext()
  const { t } = useI18n()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const navItems = state?.config.devMode ? [...NAV_ITEMS, DEV_NAV_ITEM] : NAV_ITEMS

  // Only the module area scrolls, so the frosted header follows that container
  // (not window.scrollY, which stays at 0 inside the fixed app shell).
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 8)
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Start every module at the top; the scroll event also clears the frosted state.
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Window chrome stays fixed; only the module content scrolls. */}
      <div className="shrink-0 bg-background">
        <TitleBar />
      </div>

      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <header
          className={cn(
            'sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-6 py-3 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300',
            scrolled
              ? 'border-border/60 bg-background/85 shadow-sm backdrop-blur-xl'
              : 'border-border/60 bg-background',
          )}
        >
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

        <div className="p-6">
          {/* Keyed by route so the module content plays its entrance transition;
              the titlebar and sticky header stay in place. */}
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
