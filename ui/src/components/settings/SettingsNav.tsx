import { Fragment } from 'react'
import { Clock, Database, Gamepad2, Info, Palette, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'

export type SettingsSectionId = 'schedule' | 'steam' | 'app' | 'appearance' | 'data' | 'about'

type Section = {
  id: SettingsSectionId
  labelKey: TranslationKey
  icon: LucideIcon
}

const SECTIONS: Section[] = [
  { id: 'schedule', labelKey: 'settings.schedule.title', icon: Clock },
  { id: 'steam', labelKey: 'steamClient.title', icon: Gamepad2 },
  { id: 'app', labelKey: 'settings.app.title', icon: SlidersHorizontal },
  { id: 'appearance', labelKey: 'settings.appearance.title', icon: Palette },
  { id: 'data', labelKey: 'settings.data.title', icon: Database },
  { id: 'about', labelKey: 'settings.about.title', icon: Info },
]

type SettingsNavProps = {
  active: SettingsSectionId
  onChange: (section: SettingsSectionId) => void
}

/** Settings section rail: vertical on desktop, horizontal pills on narrow windows. */
export function SettingsNav({ active, onChange }: SettingsNavProps) {
  const { t } = useI18n()

  return (
    <nav
      aria-label={t('settings.nav.label')}
      className="flex gap-1 overflow-x-auto rounded-xl bg-muted/30 p-1.5 min-[700px]:flex-col min-[700px]:overflow-visible"
    >
      {SECTIONS.map(({ id, labelKey, icon: Icon }, index) => (
        <Fragment key={id}>
          {index === 4 && (
            <div
              className="mx-2 my-1 hidden h-px bg-border/60 min-[700px]:block"
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            aria-current={active === id ? 'true' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 min-[700px]:w-full',
              active === id && 'bg-background text-foreground shadow-sm dark:bg-input/30',
            )}
            onClick={() => onChange(id)}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {t(labelKey)}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}
