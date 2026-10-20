import { useId, type ReactNode } from 'react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type SettingsSectionProps = {
  title: string
  description?: string
  children: ReactNode
  contentClassName?: string
  /** Optional control shown at the right of the title (e.g. a Switch). */
  action?: ReactNode
}

/** Standard panel for one settings section: title, short description and content. */
export function SettingsSection({
  title,
  description,
  children,
  contentClassName,
  action,
}: SettingsSectionProps) {
  const titleId = useId()

  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} role="heading" aria-level={2}>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn('grid gap-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

type SettingsRowProps = {
  label: ReactNode
  hint?: ReactNode
  control: ReactNode
  className?: string
}

/** One settings line: label and hint on the left, control on the right. */
export function SettingsRow({ label, hint, control, className }: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border/60 py-3 first:border-t-0 first:pt-0 last:pb-0',
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

type SettingsGroupProps = {
  title?: string
  children: ReactNode
  className?: string
}

/** Sub-block inside a section, separated from the main rows (e.g. Advanced, Maintenance). */
export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <section className={cn('border-t border-border/60 pt-4', className)}>
      {title && (
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="grid gap-0">{children}</div>
    </section>
  )
}
