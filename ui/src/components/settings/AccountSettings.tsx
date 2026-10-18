import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Translate } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { cmd, type AppState } from '@/lib/tauri'

function connectionText(connection: AppState['connection'], t: Translate): string {
  switch (connection) {
    case 'connected':
      return t('connection.connected')
    case 'connecting':
      return t('common.connecting')
    default:
      return t('common.offline')
  }
}

/** Settings › Steam account: active session, machine name and logout. */
export function AccountSettings({ state }: { state: AppState | null }) {
  const { t } = useI18n()
  const cfg = state?.config

  const logout = () => {
    const ok = window.confirm(t('settings.account.logoutConfirm'))
    if (ok) void cmd('logout')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.account.title')}</CardTitle>
        <CardDescription>{t('settings.account.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <p className="text-sm font-medium">
              {state?.account?.name ?? (state?.authPresent ? t('settings.account.saved') : t('settings.account.none'))}
            </p>
            <p className="text-xs text-muted-foreground">
              {state?.account
                ? <span className="font-mono">{state.account.steamID}</span>
                : connectionText(state?.connection ?? 'disconnected', t)}
            </p>
          </div>
          {state?.connection !== 'connected' && (
            <Button
              size="sm"
              variant="outline"
              disabled={!state?.authPresent}
              onClick={() => void cmd('reconnect')}
            >
              {t('settings.account.reconnect')}
            </Button>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="machine">{t('settings.account.machine')}</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-muted-foreground">
                  ?
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{t('settings.account.machineTooltip')}</TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="machine"
            value={cfg?.machineName ?? ''}
            maxLength={32}
            disabled={!cfg}
            onChange={(e) => void cmd('setConfig', { machineName: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{t('settings.account.machineHint')}</p>
        </div>

        {state?.authPresent && (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">{t('settings.account.logoutHint')}</p>
            <Button variant="destructive" size="sm" onClick={logout}>
              {t('settings.account.logout')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
