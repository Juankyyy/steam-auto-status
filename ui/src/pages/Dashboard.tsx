import { LoginPanel } from '@/components/LoginPanel'
import { ScheduleCard } from '@/components/ScheduleCard'
import { StatusPanel } from '@/components/StatusPanel'
import { useAppContext } from '@/lib/app-context'

/** Dashboard module: status, first-time login and schedule summary. */
export function Dashboard() {
  const { state, needLogin, loginReason } = useAppContext()

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

      <ScheduleCard state={state} />
    </div>
  )
}
