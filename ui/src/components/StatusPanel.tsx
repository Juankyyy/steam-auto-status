import { useEffect, useState } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Countdown } from '@/components/Countdown'
import { StatusOrb } from '@/components/StatusOrb'
import { useAppSuspended } from '@/lib/app-suspended'
import { formatClock, formatClockAt, type Translate } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { formatDayRange } from '@/lib/schedule'
import { steamStatus } from '@/lib/status'
import { cmd, openSteam, type AppState } from '@/lib/tauri'

/** Maps the core state to the label shown next to the orb. */
function statusText(state: AppState | null, t: Translate): string {
  if (!state) return t('common.loading')
  if (!state.steamRunning) return t('steamClient.closed')
  if (state.steamStarting) return t('steamClient.starting')
  if (state.persona === 'online') return t('common.online')
  if (state.persona === 'invisible') return t('common.invisible')
  if (state.paused) return t('status.pausedTitle')
  return t('status.waiting')
}

function statusSubtitle(state: AppState | null, t: Translate, lang: 'es' | 'en'): string {
  if (!state) return ''
  if (!state.steamRunning) return t('status.steamClosedBody')
  if (state.steamStarting) return t('status.steamStarting')
  if (state.paused && !state.persona) return t('status.pausedBody')
  if (state.lastAppliedAt) {
    return t('status.lastApplied', {
      state: t(state.persona === 'online' ? 'common.online' : 'common.invisible'),
      time: formatClockAt(state.lastAppliedAt, lang),
    })
  }
  return t('status.waiting')
}

export function StatusPanel({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const suspended = useAppSuspended()
  const [now, setNow] = useState(() => Date.now())
  const [badgesRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' })
  const [alertsRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' })

  // The countdown only ticks while the panel is visible: a suspended window would keep
  // waking the renderer every second for nothing. Resuming refreshes it immediately.
  useEffect(() => {
    if (suspended) return
    const tick = () => setNow(Date.now())
    // Refresh as soon as the panel comes back, without waiting for the first interval.
    const first = setTimeout(tick, 0)
    const interval = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [suspended])

  const countdownMs = state?.paused ? null : state?.nextTransition ? state.nextTransition.at - now : null
  const next = state?.nextTransition ?? null
  const cfg = state?.config ?? null
  const orb = steamStatus(state)
  const label = statusText(state, t)
  // The label is composed here (not in the core) so it follows the UI language and
  // time format, and the "no schedule" case is a real state check, not a string match.
  const nextLabel = !state
    ? '—'
    : next
      ? t('status.nextAt', {
          state: t(next.to === 'online' ? 'common.online' : 'common.invisible'),
          time: formatClockAt(next.at, lang),
        })
      : t('common.noSchedule')

  return (
    <Card className="relative overflow-hidden" data-status={orb}>
      <CardContent className="relative z-10 flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <StatusOrb status={orb} />
          <div key={label} className="status-swap min-w-40">
            <div className="text-3xl font-semibold tracking-tight">{label}</div>
            <div className="text-sm text-muted-foreground">{statusSubtitle(state, t, lang)}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('status.nextChange')}</div>
            <div className="text-sm font-medium">{nextLabel}</div>
            {countdownMs !== null && (
              <div className="flex items-baseline justify-end gap-1.5 text-2xl font-semibold tabular-nums text-muted-foreground">
                {countdownMs > 0 ? (
                  <>
                    <span className="text-sm font-medium text-muted-foreground/80">{t('status.in')}</span>
                    <Countdown ms={countdownMs} />
                  </>
                ) : (
                  t('status.now')
                )}
              </div>
            )}
          </div>
        </div>

        <div ref={badgesRef} className="flex flex-wrap items-center gap-2">
          {state?.paused && <Badge variant="secondary">{t('status.paused')}</Badge>}
          {!state?.paused && state?.inWindow && (
            <Badge variant="outline" className="border-status-online/40 text-status-online">
              {t('status.inWindow')}
            </Badge>
          )}
          {!state?.paused && state && !state.inWindow && (
            <Badge variant="outline" className="border-status-invisible/40 text-status-invisible">
              {t('status.outOfWindow')}
            </Badge>
          )}
          {state?.forced && (
            <Badge variant="outline" className="border-sky-500/40 text-sky-400">
              {t('status.forcedUntil', {
                state: t(state.forced.persona === 'online' ? 'common.online' : 'common.invisible'),
                time: formatClockAt(state.forced.until, lang),
              })}
            </Badge>
          )}
        </div>

        {cfg && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span className="font-medium">{t('status.scheduleLabel')}</span>
            {cfg.windows.length === 0 ? (
              <span>{t('common.noSchedule')}</span>
            ) : (
              <span className="grid gap-0.5">
                {cfg.windows.map((window, index) => (
                  <span key={index}>
                    {t('status.scheduleSummary', {
                      days: formatDayRange(window.days, t),
                      from: formatClock(window.from, lang),
                      until: formatClock(window.until, lang),
                    })}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}

        <div ref={alertsRef} className="grid gap-3 empty:hidden">
          {state && !state.steamRunning && (
            <Alert variant="destructive">
              <AlertTitle>{t('status.steamClosedTitle')}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{t('status.steamClosedBody')}</span>
                <Button size="sm" variant="outline" onClick={() => void openSteam()}>
                  {t('steamClient.open')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {state?.steamStarting && (
            <Alert>
              <AlertTitle>{t('steamClient.starting')}</AlertTitle>
              <AlertDescription>{t('status.steamStarting')}</AlertDescription>
            </Alert>
          )}

          {state?.lastApplyError && (
            <Alert variant="destructive">
              <AlertTitle>{t('status.applyError')}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{state.lastApplyError}</span>
                <Button size="sm" variant="outline" onClick={() => void cmd('reapply')}>
                  {t('steamClient.reapply')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
