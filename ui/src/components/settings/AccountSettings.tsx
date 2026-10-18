import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cmd, type AppState } from '@/lib/tauri'

const CONNECTION_TEXT: Record<AppState['connection'], string> = {
  connected: 'Conectado a Steam',
  connecting: 'Conectando…',
  disconnected: 'Sin conexión',
}

/** Settings › Steam account: active session, machine name and logout. */
export function AccountSettings({ state }: { state: AppState | null }) {
  const cfg = state?.config

  const logout = () => {
    const ok = window.confirm(
      '¿Cerrar sesión de Steam? Se borrará el token guardado y tendrás que iniciar sesión de nuevo.',
    )
    if (ok) void cmd('logout')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuenta de Steam</CardTitle>
        <CardDescription>Sesión que reporta tu presencia en Steam.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <p className="text-sm font-medium">
              {state?.account?.name ?? (state?.authPresent ? 'Sesión guardada' : 'Sin cuenta conectada')}
            </p>
            <p className="text-xs text-muted-foreground">
              {state?.account
                ? <span className="font-mono">{state.account.steamID}</span>
                : CONNECTION_TEXT[state?.connection ?? 'disconnected']}
            </p>
          </div>
          {state?.connection !== 'connected' && (
            <Button
              size="sm"
              variant="outline"
              disabled={!state?.authPresent}
              onClick={() => void cmd('reconnect')}
            >
              Reconectar
            </Button>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="machine">Nombre de máquina</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-help text-muted-foreground">
                  ?
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Nombre que reporta esta sesión a Steam. Visible solo para ti en tus dispositivos.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="machine"
            value={cfg?.machineName ?? ''}
            maxLength={32}
            disabled={!cfg}
            onChange={(e) => void cmd('setConfig', { machineName: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Se aplica en la próxima conexión con Steam.</p>
        </div>

        {state?.authPresent && (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              Cerrar sesión elimina el token guardado; para volver a conectarte tendrás que iniciar sesión de nuevo.
            </p>
            <Button variant="destructive" size="sm" onClick={logout}>
              Cerrar sesión
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
