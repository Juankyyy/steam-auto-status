import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type Persona = 'online' | 'invisible'
export type LoginPhase =
  | 'idle'
  | 'connecting'
  | 'awaiting_guard'
  | 'awaiting_qr'
  | 'awaiting_approval'
  | 'qr_expired'
export type ConnectionState = 'connected' | 'connecting' | 'disconnected'
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Config {
  days: Day[]
  onlineFrom: string
  onlineUntil: string
  paused: boolean
  startWithWindows: boolean
  notifications: boolean
  machineName: string
}

export interface AppState {
  connection: ConnectionState
  loginPhase: LoginPhase
  qrDataUrl: string | null
  persona: Persona | null
  desired: Persona
  inWindow: boolean
  paused: boolean
  forced: { persona: Persona; until: number } | null
  authPresent: boolean
  account: { steamID: string; name: string | null } | null
  nextTransition: { at: number; to: Persona } | null
  nextTransitionLabel: string
  config: Config
  lastError: { message: string; eresult?: number } | null
  guardNeeded: { domain: string | null; lastCodeWrong: boolean } | null
  tooltip: string
  nowMs: number
  dataDir: string
}

export interface SidecarMessage {
  type: 'event' | 'res'
  event?: string
  data?: unknown
  id?: string
  result?: unknown
  error?: string
}

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Sends a command to the sidecar (fire-and-forget; state arrives via events). */
export async function cmd(method: string, params: Record<string, unknown> = {}): Promise<void> {
  if (!isTauri) return
  await invoke('sidecar_command', { method, params })
}

export async function getCachedState(): Promise<AppState | null> {
  if (!isTauri) return null
  return await invoke<AppState | null>('get_cached_state')
}

export async function showMainWindow(): Promise<void> {
  if (isTauri) await invoke('show_main_window')
}

export async function isHiddenLaunch(): Promise<boolean> {
  if (!isTauri) return false
  return await invoke<boolean>('launch_hidden')
}

export async function setAutostart(enable: boolean): Promise<void> {
  if (isTauri) await invoke('set_autostart', { enable })
}

/** Opens the app data folder (config, token, logs) in the system file manager. */
export async function openDataFolder(): Promise<void> {
  if (isTauri) await invoke('open_data_folder')
}

/** Opens an external http/https link in the default browser. */
export async function openUrl(url: string): Promise<void> {
  if (isTauri) await invoke('open_url', { url })
}

/** Copies text to the system clipboard (settings › copy diagnostics). */
export async function copyText(text: string): Promise<void> {
  if (isTauri) await invoke('copy_text', { text })
}

export async function onSidecarMessage(handler: (msg: SidecarMessage) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  return await listen<SidecarMessage>('sidecar-message', (e) => handler(e.payload))
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${sec} s`
  return `${sec} s`
}
