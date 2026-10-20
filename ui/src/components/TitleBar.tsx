import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import logoUrl from '@/assets/logo.svg'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import {
  closeWindow,
  isTauri,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from '@/lib/tauri'

/**
 * Custom window chrome: the native frame is disabled in `tauri.conf.json` (and in the
 * recreated window in `main.rs`), so this bar owns dragging and the window controls.
 * `data-tauri-drag-region="deep"` lets Tauri drag from the brand/spacer while buttons
 * stay clickable and double-click toggles maximize.
 */
export function TitleBar() {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isTauri) return

    let disposed = false
    let unlisten: (() => void) | undefined

    void (async () => {
      const initial = await isWindowMaximized()
      if (!disposed) setMaximized(initial)

      const stop = await onWindowResized(async () => {
        const next = await isWindowMaximized()
        if (!disposed) setMaximized(next)
      })
      if (disposed) stop()
      else unlisten = stop
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const maximizeLabel = maximized ? t('window.restore') : t('window.maximize')

  return (
    <div
      data-tauri-drag-region="deep"
      className="flex h-9 shrink-0 select-none items-center gap-2 bg-background pr-2 pl-3"
    >
      <img src={logoUrl} alt="" aria-hidden className="size-4 shrink-0" />
      <h1 className="text-xs font-semibold tracking-tight">Steam Auto Status</h1>
      <Badge variant="outline" className="h-4 px-1.5 font-mono text-[10px] text-muted-foreground">
        v{__APP_VERSION__}
      </Badge>

      <div className="flex-1" />

      {isTauri && (
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={minimizeWindow}
            aria-label={t('window.minimize')}
            title={t('window.minimize')}
          >
            <Minus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={toggleMaximizeWindow}
            aria-label={maximizeLabel}
            title={maximizeLabel}
          >
            {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            onClick={closeWindow}
            aria-label={t('window.close')}
            title={t('window.close')}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
