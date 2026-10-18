import { Bug, Download, ExternalLink } from 'lucide-react'
import logoUrl from '@/assets/logo.svg'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { openUrl } from '@/lib/tauri'

const REPO_URL = 'https://github.com/Juankyyy/steam-auto-status'

/** Settings › About: version and links to the project. */
export function AboutSettings() {
  return (
    <Card>
      <CardHeader>
        <img src={logoUrl} alt="" aria-hidden className="size-10" />
        <CardTitle>Acerca de</CardTitle>
        <CardDescription>Steam Auto Status v{__APP_VERSION__}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          Cambia tu presencia de Steam según el horario configurado. Nada sale de tu equipo salvo lo necesario para
          hablar con Steam.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void openUrl(REPO_URL)}>
            <ExternalLink />
            Repositorio
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openUrl(`${REPO_URL}/releases/latest`)}>
            <Download />
            Última versión
          </Button>
          <Button variant="outline" size="sm" onClick={() => void openUrl(`${REPO_URL}/issues`)}>
            <Bug />
            Reportar un problema
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Las actualizaciones son manuales: instala la última versión encima y tus datos se conservan.
        </p>
      </CardContent>
    </Card>
  )
}
