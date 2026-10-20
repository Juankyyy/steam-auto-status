import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type Persona = 'online' | 'invisible'
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type Language = 'es' | 'en'
/** Smallest unit shown by the dashboard countdown. */
export type CountdownPrecision = 'hours' | 'minutes' | 'seconds'

export interface Config {
  days: Day[]
  onlineFrom: string
  onlineUntil: string
  paused: boolean
  startWithWindows: boolean
  notifications: boolean
  devMode: boolean
  language: Language
  countdownPrecision: CountdownPrecision
}

export interface AppState {
  /** The official Steam client process is running. */
  steamRunning: boolean
  /** The client just started; the first status commands are being retried. */
  steamStarting: boolean
  /** Last presence successfully sent to the client (null until the first send). */
  persona: Persona | null
  desired: Persona
  inWindow: boolean
  paused: boolean
  forced: { persona: Persona; until: number } | null
  lastAppliedAt: number | null
  lastApplyError: string | null
  /** Files from the old login-based version are still in the data folder. */
  legacyDataPresent: boolean
  nextTransition: { at: number; to: Persona } | null
  config: Config
  tooltip: string
  nowMs: number
  dataDir: string
}

/** Event payload emitted by the Rust core (`sidecar-message` is a compatibility name). */
export interface SidecarMessage {
  type: 'event' | 'res'
  event?: string
  data?: unknown
  id?: string
  result?: unknown
  error?: string
}

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Sends a command to the Rust core (fire-and-forget; state arrives via events). */
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

/** Opens the app data folder (config, logs) in the system file manager. */
export async function openDataFolder(): Promise<void> {
  if (isTauri) await invoke('open_data_folder')
}

/** Asks Windows to open the Steam client (or focus it if it is already running). */
export async function openSteam(): Promise<void> {
  if (isTauri) await invoke('open_steam')
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

// ---------------------------------------------------------------- window controls
// The custom titlebar replaces the native frame (`decorations: false`), so the UI owns
// minimize/maximize/close. Closing destroys the window only; the app stays in the tray.

export function minimizeWindow(): void {
  if (isTauri) void getCurrentWindow().minimize()
}

export function toggleMaximizeWindow(): void {
  if (isTauri) void getCurrentWindow().toggleMaximize()
}

export function closeWindow(): void {
  if (isTauri) void getCurrentWindow().close()
}

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri) return false
  return await getCurrentWindow().isMaximized()
}

/** Subscribes to window resize events (used to refresh the maximize/restore icon). */
export async function onWindowResized(handler: () => void): Promise<() => void> {
  if (!isTauri) return () => {}
  return await getCurrentWindow().onResized(() => handler())
}
