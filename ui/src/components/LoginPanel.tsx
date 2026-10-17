import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cmd } from '@/lib/tauri'

interface Props {
  guard: { domain: string | null; lastCodeWrong: boolean } | null
  connecting: boolean
  error: string | null
  reason: string | null
}

export function LoginPanel({ guard, connecting, error, reason }: Props) {
  const [accountName, setAccountName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')

  const submitCredentials = () => {
    if (!accountName.trim() || !password) return
    void cmd('login', { accountName: accountName.trim(), password })
    setPassword('')
  }

  const submitCode = () => {
    if (!code.trim()) return
    void cmd('login', { code: code.trim(), codeType: guard?.domain ? 'email' : 'mobile' })
    setCode('')
  }

  return (
    <Card className="border-sky-500/30">
      <CardHeader>
        <CardTitle>{guard ? 'Código de Steam Guard' : 'Inicia sesión en Steam'}</CardTitle>
        <CardDescription>
          {guard
            ? guard.domain
              ? `Introduce el código que Steam acaba de enviar a tu correo (termina en ${guard.domain}).`
              : 'Introduce el código actual de la app móvil de Steam.'
            : 'Credenciales solo para Steam: se usan una vez para obtener un token de sesión; la contraseña no se guarda.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {reason && !guard && (
          <Alert>
            <AlertTitle>Se necesita iniciar sesión</AlertTitle>
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}
        {guard?.lastCodeWrong && (
          <Alert variant="destructive">
            <AlertTitle>Código incorrecto</AlertTitle>
            <AlertDescription>Espera a que la app móvil genere un código nuevo e inténtalo otra vez.</AlertDescription>
          </Alert>
        )}
        {error && !guard && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {guard ? (
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              submitCode()
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="guard-code">Código</Label>
              <Input
                id="guard-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXXX"
                autoFocus
                disabled={connecting}
              />
            </div>
            <Button type="submit" disabled={connecting || !code.trim()}>
              {connecting ? 'Comprobando…' : 'Enviar'}
            </Button>
          </form>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submitCredentials()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="account">Usuario de Steam</Label>
              <Input
                id="account"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                autoComplete="off"
                disabled={connecting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                disabled={connecting}
              />
            </div>
            <Button type="submit" disabled={connecting || !accountName.trim() || !password}>
              {connecting ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
