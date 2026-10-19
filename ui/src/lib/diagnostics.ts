import { getVersion } from '@tauri-apps/api/app'
import { formatClock, formatClockAt, type Translate } from '@/lib/i18n'
import { isTauri, type AppState, type Language } from '@/lib/tauri'

/** Text copied by Settings › Data › "Copy diagnostics" (version, state snapshot, recent log). */
export async function buildDiagnostics(
  state: AppState | null,
  logs: string[],
  t: Translate,
  lang: Language,
): Promise<string> {
  let version = t('diag.unknown')
  try {
    if (isTauri) version = await getVersion()
  } catch {
    /* running outside the shell (e.g. browser preview) */
  }

  const out: string[] = [t('diag.title'), t('diag.version', { value: version })]
  if (state) {
    const clientState = !state.steamRunning
      ? t('steamClient.closed')
      : state.steamStarting
        ? t('steamClient.starting')
        : t('steamClient.running')
    out.push(
      t('diag.dataDir', { value: state.dataDir }),
      t('diag.steamClient', { state: clientState }),
      t('diag.presence', {
        persona: state.persona ?? '—',
        desired: state.desired,
        inWindow: state.inWindow,
        paused: state.paused,
      }),
      t('diag.lastApplied', {
        value: state.lastAppliedAt
          ? `${state.persona ?? '—'} · ${formatClockAt(state.lastAppliedAt, lang)}`
          : t('diag.none'),
      }),
      t('diag.schedule', {
        days: state.config.days.join(', '),
        from: formatClock(state.config.onlineFrom, lang),
        until: formatClock(state.config.onlineUntil, lang),
      }),
      t('diag.lastError', { value: state.lastApplyError ?? t('diag.none') }),
    )
  } else {
    out.push(t('diag.noState'))
  }
  out.push('', t('diag.logHeader'), ...logs.slice(-100))
  return out.join('\n')
}
