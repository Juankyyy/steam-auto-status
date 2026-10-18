import { createContext, useContext } from 'react'
import type { AppState } from '@/lib/tauri'

/** Sidecar data shared by every module (the provider lives in App.tsx). */
export interface AppContextValue {
  state: AppState | null
  logs: string[]
  needLogin: boolean
  loginReason: string | null
}

export const AppContext = createContext<AppContextValue | null>(null)

/** Returns the shared sidecar data; throws if used outside the app shell. */
export function useAppContext(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useAppContext must be used inside <AppContext.Provider>')
  return value
}
