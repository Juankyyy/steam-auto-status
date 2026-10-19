import { ScheduleCard } from '@/components/ScheduleCard'
import { StatusPanel } from '@/components/StatusPanel'
import { useAppContext } from '@/lib/app-context'

/** Dashboard module: current client status and schedule summary. */
export function Dashboard() {
  const { state } = useAppContext()

  return (
    <div className="grid gap-6">
      <StatusPanel state={state} />
      <ScheduleCard state={state} />
    </div>
  )
}
