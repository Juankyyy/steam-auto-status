import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cmd, type LoginPhase } from '@/lib/tauri'
import { cn } from '@/lib/utils'

interface Props {
  guard: { domain: string | null; lastCodeWrong: boolean } | null
  phase: LoginPhase
  qrDataUrl: string | null
  error: string | null
  reason: string | null
}

export function LoginPanel({ guard, phase, qrDataUrl, error, reason }: Props) {
  const [tab, setTab] = useState<'qr' | 'creds'>('qr')
  const [accountName, setAccountName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const autoStarted = useRef(false)

  const busy = phase === 'connecting'

  // Arranca el QR automáticamente la primera vez (si no hay nada en marcha)
  useEffect(() => {
    if (tab !== 'qr' || autoStarted.current) return
    if (phase === 'idle') {
      autoStarted.current = true
      void cmd('startQrLogin')
    }
  }, [tab, phase])

  // Si el flujo pide un código de Steam Guard, pasamos a credenciales
  useEffect(() => {
    if (guard) setTab('creds')
  }, [guard])

  const switchTab = (next: 'qr' | 'creds') => {
    setTab(next)
    if (next === 'creds') void cmd('cancelQrLogin')
  }

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

  const qrStatus = (() => {
    switch (phase) {
      case 'awaiting_approval':
        return 'Código escaneado ✓ — confirma la solicitud en la app móvil de Steam.'
      case 'connecting':
        return 'Aprobado ✓ — conectando con Steam…'
      case 'qr_expired':
        return 'El código caducó. Genera uno nuevo.'
      default:
        return 'Abre la app de Steam en tu móvil, escanea el código y confirma la solicitud.'
    }
  })()

  return (
    <Card className="border-sky-500/30">
      <CardHeader>
        <CardTitle>Conectar con Steam</CardTitle>
        <CardDescription>
          Elige el método: código QR con la app móvil (recomendado) o tu usuario y contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex gap-1 rounded-lg border border-border/60 p-1">
          {(['qr', 'creds'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === t
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => switchTab(t)}
            >
              {t === 'qr' ? 'Código QR' : 'Usuario y contraseña'}
            </button>
          ))}
        </div>

        {reason && (
          <Alert>
            <AlertTitle>Se necesita iniciar sesión</AlertTitle>
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {tab === 'qr' ? (
          <div className="grid justify-items-center gap-3">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Código QR de inicio de sesión de Steam"
                className="size-56 rounded-xl bg-white p-2"
              />
            ) : (
              <div className="flex size-56 items-center justify-center rounded-xl border border-dashed border-border/60 px-4 text-center text-sm text-muted-foreground">
                {phase === 'qr_expired'
                  ? 'El código caducó'
                  : phase === 'connecting'
                    ? 'Conectando…'
                    : 'Generando código…'}
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">{qrStatus}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void cmd('cancelQrLogin')
                  void cmd('startQrLogin')
                }}
              >
                Generar otro código
              </Button>
            </div>
          </div>
        ) : guard ? (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submitCode()
            }}
          >
            <p className="text-sm text-muted-foreground">
              {guard.domain
                ? `Steam envió un código a tu correo (termina en ${guard.domain}).`
                : 'Introduce el código actual que muestra la app móvil de Steam (sección Steam Guard).'}
            </p>
            {guard.lastCodeWrong && (
              <Alert variant="destructive">
                <AlertTitle>Código incorrecto</AlertTitle>
                <AlertDescription>Espera ~30 s a que la app genere un código nuevo e inténtalo otra vez.</AlertDescription>
              </Alert>
            )}
            <div className="flex items-end gap-3">
              <div className="grid flex-1 gap-2">
                <Label htmlFor="guard-code">Código</Label>
                <Input
                  id="guard-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="XXXXX"
                  autoFocus
                  disabled={busy}
                />
              </div>
              <Button type="submit" disabled={busy || !code.trim()}>
                {busy ? 'Comprobando…' : 'Enviar'}
              </Button>
            </div>
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
                disabled={busy}
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
                disabled={busy}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Las credenciales se envían directamente a Steam; la contraseña no se guarda (solo un token de sesión).
            </p>
            <Button type="submit" disabled={busy || !accountName.trim() || !password}>
              {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
