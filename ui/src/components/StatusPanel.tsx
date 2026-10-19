import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatClock, formatClockAt, formatDuration, type Translate } from '@/lib/i18n'
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

export function StatusPanel({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const countdownMs = state?.paused ? null : state?.nextTransition ? state.nextTransition.at - now : null
  const next = state?.nextTransition ?? null
  const cfg = state?.config ?? null
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

  const dotClass = !state
    ? 'bg-zinc-500 ring-zinc-500/20'
    : !state.steamRunning
      ? 'bg-red-500/70 ring-red-500/20'
      : state.steamStarting
        ? 'bg-amber-400 ring-amber-500/20'
        : state.persona === 'online'
          ? 'bg-emerald-400 ring-emerald-500/20'
          : 'bg-zinc-500 ring-zinc-500/20'

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <span className={'size-4 rounded-full ring-4 ' + dotClass} />
          <div className="min-w-40">
            <div className="text-3xl font-semibold tracking-tight">{statusText(state, t)}</div>
            <div className="text-sm text-muted-foreground">{statusSubtitle(state, t, lang)}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('status.nextChange')}</div>
            <div className="text-sm font-medium">{nextLabel}</div>
            {countdownMs !== null && (
              <div className="text-2xl font-semibold tabular-nums text-muted-foreground">
                {countdownMs > 0 ? t('status.inDuration', { duration: formatDuration(countdownMs, t) }) : t('status.now')}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state?.paused && <Badge variant="secondary">{t('status.paused')}</Badge>}
          {!state?.paused && state?.inWindow && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
              {t('status.inWindow')}
            </Badge>
          )}
          {!state?.paused && state && !state.inWindow && (
            <Badge variant="outline" className="border-zinc-500/40 text-zinc-400">
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
      </CardContent>
    </Card>
  )
}
