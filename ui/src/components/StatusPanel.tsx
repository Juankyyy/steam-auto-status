import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatClock, formatClockAt, formatDuration, type Translate } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, type AppState } from '@/lib/tauri'

function statusText(state: AppState | null, t: Translate): string {
  if (!state) return t('common.loading')
  if (state.persona === 'online') return t('common.online')
  if (state.persona === 'invisible') return t('common.invisible')
  return t('status.noSession')
}

function statusSubtitle(state: AppState | null, t: Translate): string {
  if (!state) return ''
  switch (state.connection) {
    case 'connected':
      return state.account?.name
        ? t('status.activeAs', { name: state.account.name })
        : t('status.activeSession')
    case 'connecting':
      return t('status.connectingSteam')
    default:
      return t('status.noSteam')
  }
}

export function StatusPanel({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const online = state?.persona === 'online'
  const connected = state?.connection === 'connected'

  const countdownMs = state?.nextTransition ? state.nextTransition.at - now : null
  const next = state?.nextTransition ?? null
  const cfg = state?.config ?? null
  // The label is composed here (not in the sidecar) so it follows the UI language and
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
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <span
            className={
              'size-4 rounded-full ring-4 ' +
              (online ? 'bg-emerald-400 ring-emerald-500/20' : connected ? 'bg-zinc-500 ring-zinc-500/20' : 'bg-red-500/70 ring-red-500/20')
            }
          />
          <div className="min-w-40">
            <div className="text-3xl font-semibold tracking-tight">{statusText(state, t)}</div>
            <div className="text-sm text-muted-foreground">{statusSubtitle(state, t)}</div>
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

        {state?.lastError && state.connection !== 'connected' && (
          <Alert variant="destructive">
            <AlertTitle>{t('status.connError')}</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{state.lastError.message}</span>
              <Button size="sm" variant="outline" onClick={() => void cmd('reconnect')}>
                {t('status.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
