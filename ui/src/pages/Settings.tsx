import { Construction } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Settings module. Placeholder: the actual settings arrive in the next iteration. */
export function Settings() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Ajustes</CardTitle>
          <CardDescription>Configuración de la aplicación.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Construction className="size-6" />
            </span>
            <p className="text-sm font-medium">Módulo en construcción</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Este espacio alojará los ajustes de la aplicación.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
