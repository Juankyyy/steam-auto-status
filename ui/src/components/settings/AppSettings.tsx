import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cmd, setAutostart, type AppState } from '@/lib/tauri'

/** Settings › App: Windows startup and notifications. */
export function AppSettings({ state }: { state: AppState | null }) {
  const cfg = state?.config

  const setFlag = (key: 'startWithWindows' | 'notifications' | 'devMode') => (checked: boolean) => {
    if (key === 'startWithWindows') void setAutostart(checked)
    void cmd('setConfig', { [key]: checked })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aplicación</CardTitle>
        <CardDescription>Arranque con Windows, avisos y herramientas internas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="autostart">Iniciar con Windows</Label>
            <p className="text-xs text-muted-foreground">Arranca minimizada, solo en la bandeja.</p>
          </div>
          <Switch
            id="autostart"
            checked={cfg?.startWithWindows ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('startWithWindows')}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notifications">Notificaciones</Label>
            <p className="text-xs text-muted-foreground">Aviso de Windows al cambiar de estado.</p>
          </div>
          <Switch
            id="notifications"
            checked={cfg?.notifications ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('notifications')}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="devmode">Modo desarrollador</Label>
            <p className="text-xs text-muted-foreground">
              Muestra una pestaña extra con herramientas internas (forzar estados, registro en vivo).
            </p>
          </div>
          <Switch
            id="devmode"
            checked={cfg?.devMode ?? false}
            disabled={!cfg}
            onCheckedChange={setFlag('devMode')}
          />
        </div>
      </CardContent>
    </Card>
  )
}
