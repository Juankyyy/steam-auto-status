import { useEffect, useState } from 'react'
import { AboutSettings } from '@/components/settings/AboutSettings'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { AppSettings } from '@/components/settings/AppSettings'
import { DataSettings } from '@/components/settings/DataSettings'
import { ScheduleSettings } from '@/components/settings/ScheduleSettings'
import { SettingsNav, type SettingsSectionId } from '@/components/settings/SettingsNav'
import { SteamClientSettings } from '@/components/settings/SteamClientSettings'
import { useAppContext } from '@/lib/app-context'
import { useI18n } from '@/lib/i18n-context'

/**
 * Settings module: one section at a time.
 *
 * The active section is local state instead of nested routes: Settings opens on Schedule
 * (the dashboard link lands there) and the shell keeps its single page transition.
 */
export function Settings() {
  const { state } = useAppContext()
  const { t } = useI18n()
  const [section, setSection] = useState<SettingsSectionId>('schedule')

  // Switching sections can leave the module scrolled if the previous panel was taller.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [section])

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 min-[700px]:grid-cols-[180px_minmax(0,1fr)] min-[700px]:items-start min-[700px]:gap-6">
      <aside className="grid gap-3">
        <SettingsNav active={section} onChange={setSection} />
        <p className="px-2 text-xs leading-relaxed text-muted-foreground min-[700px]:px-3">
          {t('settings.autosave')}
        </p>
      </aside>

      <div className="min-w-0 max-w-2xl">
        <div key={section} className="page-enter">
          {section === 'schedule' && <ScheduleSettings state={state} />}
          {section === 'steam' && <SteamClientSettings state={state} />}
          {section === 'app' && <AppSettings state={state} />}
          {section === 'appearance' && <AppearanceSettings state={state} />}
          {section === 'data' && <DataSettings state={state} />}
          {section === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  )
}
