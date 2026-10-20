import { cn } from '@/lib/utils'

/** Visual state of the presence indicator, including the transient client states. */
export type StatusOrbStatus = 'loading' | 'online' | 'invisible' | 'starting' | 'closed'

/**
 * Decorative status indicator. The label next to it is the accessible source of
 * truth; the orb only reinforces it with colour and motion.
 */
export function StatusOrb({ status, className }: { status: StatusOrbStatus; className?: string }) {
  return (
    <span className={cn('status-orb', className)} data-status={status} aria-hidden="true">
      <span className="status-orb__halo" />
      <span className="status-orb__ping" />
      <span className="status-orb__core" />
    </span>
  )
}
