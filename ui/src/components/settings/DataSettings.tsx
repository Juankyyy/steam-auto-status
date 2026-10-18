import { useState } from 'react'
import { ClipboardCopy, Eraser, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAppContext } from '@/lib/app-context'
import { buildDiagnostics } from '@/lib/diagnostics'
import { useI18n } from '@/lib/i18n-context'
import { cmd, copyText, openDataFolder, type AppState } from '@/lib/tauri'

/** Settings › Data: folder location, logs and support diagnostics. */
export function DataSettings({ state }: { state: AppState | null }) {
  const { t, lang } = useI18n()
  const { logs } = useAppContext()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCopy = async () => {
    setError(null)
    try {
      await copyText(await buildDiagnostics(state, logs, t, lang))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleClearLog = () => {
    const ok = window.confirm(t('settings.data.clearConfirm'))
    if (ok) void cmd('clearLog')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.data.title')}</CardTitle>
        <CardDescription>{t('settings.data.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label>{t('settings.data.folder')}</Label>
          <div className="break-all rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs">
            {state?.dataDir ?? '—'}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void openDataFolder()}>
            <FolderOpen />
            {t('settings.data.open')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            <ClipboardCopy />
            {copied ? t('settings.data.copied') : t('settings.data.copy')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClearLog}>
            <Eraser />
            {t('settings.data.clear')}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">{t('settings.data.hint')}</p>
        {error && <p className="text-xs text-red-400">{t('settings.data.copyError', { error })}</p>}
      </CardContent>
    </Card>
  )
}
