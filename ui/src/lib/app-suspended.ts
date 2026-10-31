import { useSyncExternalStore } from 'react'

/**
 * Global "panel suspended" flag. The Rust shell sets it when the window is minimized or
 * hidden and WebView2 stops painting; the UI then stops its timers and CSS loops so the
 * renderer stays idle behind an invisible window. The attribute in `<html>` drives the CSS
 * side (see `index.css`).
 */
let suspended = false
const listeners = new Set<() => void>()

export function setAppSuspended(next: boolean): void {
  if (next === suspended) return
  suspended = next
  document.documentElement.toggleAttribute('data-suspended', next)
  for (const listener of listeners) listener()
}

export function isAppSuspended(): boolean {
  return suspended
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React binding for components that must pause their own work while suspended. */
export function useAppSuspended(): boolean {
  return useSyncExternalStore(subscribe, isAppSuspended, () => false)
}
