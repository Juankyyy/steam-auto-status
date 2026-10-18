import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AppState } from '@/lib/tauri'
import { cn } from '@/lib/utils'

function statusLabel(state: AppState | null): string {
  if (!state) return 'Cargando…'
  if (state.connection === 'connecting') return 'Conectando…'
  if (state.connection !== 'connected') return 'Sin conexión'
  return state.persona === 'online' ? 'Conectado' : 'Invisible'
}

function statusDotClass(state: AppState | null): string {
  if (!state || state.connection === 'disconnected') return 'bg-red-500/70'
  if (state.connection === 'connecting') return 'bg-amber-400'
  return state.persona === 'online' ? 'bg-emerald-400' : 'bg-zinc-500'
}

/**
 * Account chip shown at the top-right of the header: rounded-square avatar
 * (iOS icon style) with a live status dot, plus the display name to its right.
 */
export function AccountChip({ state }: { state: AppState | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const account = state?.account
  if (!account) return null

  const displayName = account.name ?? account.steamID
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'
  const showImage = !!account.avatarUrl && account.avatarUrl !== failedUrl

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta de Steam: ${displayName}`}
          className="flex cursor-default items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="relative inline-flex">
            {showImage ? (
              <img
                src={account.avatarUrl!}
                alt=""
                onError={() => setFailedUrl(account.avatarUrl)}
                className="size-8 rounded-[22%] object-cover ring-1 ring-border/60"
              />
            ) : (
              <span className="grid size-8 place-items-center rounded-[22%] bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-border/60">
                {initial}
              </span>
            )}
            <span
              className={cn(
                'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background',
                statusDotClass(state),
              )}
            />
          </span>
          <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="grid gap-0.5">
          <span className="font-medium">{displayName}</span>
          <span className="font-mono text-xs opacity-80">{account.steamID}</span>
          <span className="text-xs opacity-80">{statusLabel(state)}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
