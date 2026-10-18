import { createContext, useContext, useEffect, useMemo } from 'react'
import { useAppContext } from '@/lib/app-context'
import { detectLanguage, translate, type Translate } from '@/lib/i18n'
import { cmd, type Language } from '@/lib/tauri'

/** Everything a module needs to render in the active language. */
export interface I18nValue {
  /** Active language: from config.json once the sidecar state arrives, detected before that. */
  lang: Language
  /** Looks up a key and replaces its `{param}` placeholders. */
  t: Translate
  /** Switches the app language (persisted through the sidecar config). */
  setLanguage: (lang: Language) => void
}

export const I18nContext = createContext<I18nValue | null>(null)

/**
 * Computes the i18n value from the shared app state; the source of truth is
 * `config.language`, so the window, the tray and notifications follow one setting.
 */
export function useI18nValue(): I18nValue {
  const { state } = useAppContext()
  const lang: Language = state?.config.language ?? detectLanguage()

  // Keep the document language attribute in sync (screen readers, hyphenation, spellcheck).
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return useMemo<I18nValue>(
    () => ({
      lang,
      t: (key, params) => translate(lang, key, params),
      setLanguage: (next) => void cmd('setConfig', { language: next }),
    }),
    [lang],
  )
}

/** Returns the active language and translator; throws if used outside the provider. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside the i18n provider')
  return value
}
