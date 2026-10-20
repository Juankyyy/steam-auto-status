import { useEffect, useState } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Countdown } from '@/components/Countdown'
import { StatusOrb, type StatusOrbStatus } from '@/components/StatusOrb'
import { formatClock, formatClockAt, type Translate } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, openSteam, type AppState } from '@/lib/tauri'

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

/** Maps the core state to the visual state of the indicator. */
function orbStatus(state: AppState | null): StatusOrbStatus {
  if (!state) return 'loading'
  if (!state.steamRunning) return 'closed'
  if (state.steamStarting) return 'starting'
  if (state.persona === 'online') return 'online'
  return 'invisible'
}

export function StatusPanel({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  const [badgesRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' })
  const [alertsRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' })

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const countdownMs = state?.paused ? null : state?.nextTransition ? state.nextTransition.at - now : null
  const next = state?.nextTransition ?? null
  const cfg = state?.config ?? null
  const orb = orbStatus(state)
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
      <div className="status-aura" aria-hidden="true" />
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
          {next && cfg && (
            <span className="text-xs text-muted-foreground">
              {t(cfg.days.length === 1 ? 'status.scheduleSummary.one' : 'status.scheduleSummary.many', {
                count: cfg.days.length,
                from: formatClock(cfg.onlineFrom, lang),
                until: formatClock(cfg.onlineUntil, lang),
              })}
            </span>
          )}
        </div>

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
