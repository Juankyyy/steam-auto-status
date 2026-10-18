import { useState } from 'react'
import { ClipboardCopy, Eraser, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAppContext } from '@/lib/app-context'
import { buildDiagnostics } from '@/lib/diagnostics'
import { cmd, copyText, openDataFolder, type AppState } from '@/lib/tauri'

/** Settings › Data: folder location, logs and support diagnostics. */
export function DataSettings({ state }: { state: AppState | null }) {
  const { logs } = useAppContext()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCopy = async () => {
    setError(null)
    try {
      await copyText(await buildDiagnostics(state, logs))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleClearLog = () => {
    const ok = window.confirm('¿Vaciar el registro? Se borrarán las líneas actuales de status.log.')
    if (ok) void cmd('clearLog')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos y registros</CardTitle>
        <CardDescription>Configuración, token y registro se guardan en local, en esta carpeta.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label>Carpeta de datos</Label>
          <div className="break-all rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs">
            {state?.dataDir ?? '—'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void openDataFolder()}>
            <FolderOpen />
            Abrir carpeta
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            <ClipboardCopy />
            {copied ? 'Copiado' : 'Copiar diagnóstico'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClearLog}>
            <Eraser />
            Vaciar registro
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          El diagnóstico incluye la versión, el estado de la conexión y las últimas líneas del registro: útil si
          abres un incidente en GitHub. Desinstalar la app no borra esta carpeta.
        </p>
        {error && <p className="text-xs text-red-400">No se pudo copiar: {error}</p>}
      </CardContent>
    </Card>
  )
}
