import type { StatusOrbStatus } from '@/components/StatusOrb'
import type { AppState } from '@/lib/tauri'

/**
 * Maps the core state to the visual presence state shared by the orb and the app background.
 * Pure so both the shell and the dashboard can use the same source.
 */
export function steamStatus(state: AppState | null): StatusOrbStatus {
  if (!state) return 'loading'
  if (!state.steamRunning) return 'closed'
  if (state.steamStarting) return 'starting'
  if (state.persona === 'online') return 'online'
  return 'invisible'
}
