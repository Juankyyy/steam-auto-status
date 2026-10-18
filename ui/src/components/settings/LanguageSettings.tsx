import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import type { Language } from '@/lib/tauri'
import { cn } from '@/lib/utils'

/** Settings › Language: interface language, applied instantly (persisted in config.json). */
export function LanguageSettings() {
  const { t, lang, setLanguage } = useI18n()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.language.title')}</CardTitle>
        <CardDescription>{t('settings.language.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-fit gap-1 rounded-lg border border-border/60 p-1" role="radiogroup">
          {(Object.keys(LANGUAGE_NAMES) as Language[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={lang === value}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm transition-colors',
                lang === value
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setLanguage(value)}
            >
              {LANGUAGE_NAMES[value]}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
