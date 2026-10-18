import { LoginPanel } from '@/components/LoginPanel'
import { ScheduleCard } from '@/components/ScheduleCard'
import { StatusPanel } from '@/components/StatusPanel'
import { TestsPanel } from '@/components/TestsPanel'
import { useAppContext } from '@/lib/app-context'

/** Dashboard module: status, first-time login, configuration and quick tests. */
export function Dashboard() {
  const { state, logs, needLogin, loginReason } = useAppContext()

  const showLogin =
    !!state && state.connection !== 'connected' && (!state.authPresent || !!state.guardNeeded || needLogin)

  return (
    <div className="grid gap-6">
      <StatusPanel state={state} />

      {showLogin && (
        <LoginPanel
          guard={state?.guardNeeded ?? null}
          phase={state?.loginPhase ?? 'idle'}
          qrDataUrl={state?.qrDataUrl ?? null}
          error={state?.lastError?.message ?? null}
          reason={loginReason}
        />
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ScheduleCard state={state} />
        <TestsPanel state={state} logs={logs} />
      </div>
    </div>
  )
}
