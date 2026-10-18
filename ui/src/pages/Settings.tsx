import { AboutSettings } from '@/components/settings/AboutSettings'
import { AccountSettings } from '@/components/settings/AccountSettings'
import { AppSettings } from '@/components/settings/AppSettings'
import { DataSettings } from '@/components/settings/DataSettings'
import { LanguageSettings } from '@/components/settings/LanguageSettings'
import { ScheduleSettings } from '@/components/settings/ScheduleSettings'
import { useAppContext } from '@/lib/app-context'

/** Settings module: schedule, Steam account, app options, language, data and about. */
export function Settings() {
  const { state } = useAppContext()

  return (
    <div className="grid gap-6">
      <ScheduleSettings state={state} />
      <AccountSettings state={state} />
      <AppSettings state={state} />
      <LanguageSettings />
      <DataSettings state={state} />
      <AboutSettings />
    </div>
  )
}
