import { Navigate } from 'react-router'
import { TestsPanel } from '@/components/TestsPanel'
import { useAppContext } from '@/lib/app-context'

/** Developer module: internal tools (force states, live log). Only reachable with developer mode on. */
export function Dev() {
  const { state, logs } = useAppContext()

  // Guard: without developer mode the module is not reachable, not even by typing the hash
  if (state && !state.config.devMode) return <Navigate to="/" replace />

  return (
    <div className="grid gap-6">
      <TestsPanel state={state} logs={logs} />
    </div>
  )
}
