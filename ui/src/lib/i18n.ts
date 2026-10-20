import type { Language } from '@/lib/tauri'

/**
 * Lightweight i18n core, without runtime dependencies: a typed dictionary pair where `es`
 * is the source of truth for the key set — `en` must mirror it key by key or the build
 * fails. Values are templates with `{param}` placeholders, which keeps them plain and
 * readable for anyone translating or reviewing them.
 *
 * This module is pure (no React): the provider and the `useI18n` hook live in
 * `i18n-context.ts`.
 */
const es = {
  // ---------------------------------------------------------------- common
  'common.loading': 'Cargando…',
  'common.online': 'Conectado',
  'common.invisible': 'Invisible',
  'common.noSchedule': 'Sin programación',
  'common.cancel': 'Cancelar',

  // ---------------------------------------------------------------- header
  'nav.dashboard': 'Panel de control',
  'nav.settings': 'Ajustes',
  'nav.dev': 'Desarrollador',
  'nav.label': 'Módulos',

  // ---------------------------------------------------------------- window controls
  'window.minimize': 'Minimizar',
  'window.maximize': 'Maximizar',
  'window.restore': 'Restaurar',
  'window.close': 'Cerrar',

  // ---------------------------------------------------------------- dashboard › status
  'status.scheduleSummary.one': 'Horario: 1 día · {from}–{until}',
  'status.scheduleSummary.many': 'Horario: {count} días · {from}–{until}',
  'status.nextChange': 'Próximo cambio',
  'status.nextAt': '{state} a las {time}',
  'status.in': 'en',
  'status.now': 'ahora',
  'status.paused': 'Automatización en pausa',
  'status.inWindow': 'Dentro de la franja',
  'status.outOfWindow': 'Fuera de la franja',
  'status.forcedUntil': 'Forzado {state} hasta las {time}',
  'status.waiting': 'Esperando a Steam',
  'status.pausedTitle': 'En pausa',
  'status.pausedBody': 'La app no cambiará tu estado mientras esté en pausa.',
  'status.steamClosedTitle': 'Steam no está abierto',
  'status.steamClosedBody': 'Abre Steam para que la app pueda cambiar tu estado.',
  'status.steamStarting': 'Steam está iniciando; el estado se aplicará en unos segundos.',
  'status.lastApplied': 'Último cambio: {state} a las {time}',
  'status.applyError': 'No se pudo cambiar el estado',

  // ---------------------------------------------------------------- schedule summaries (lib/schedule.ts)
  'schedule.noWindow': 'sin franja',
  'schedule.hours': '{h} h',
  'schedule.hoursMinutes': '{h} h {m} min',
  'schedule.minutes': '{m} min',

  'day.mon': 'Lun',
  'day.tue': 'Mar',
  'day.wed': 'Mié',
  'day.thu': 'Jue',
  'day.fri': 'Vie',
  'day.sat': 'Sáb',
  'day.sun': 'Dom',

  // ---------------------------------------------------------------- developer › tests
  'dev.title': 'Pruebas y registro',
  'dev.description':
    'Fuerza un estado temporal para comprobar cómo te ven tus amigos; al terminar vuelve solo al horario.',
  'dev.forceOnline': 'Conectado {minutes} min',
  'dev.forceInvisible': 'Invisible {minutes} min',
  'dev.cancelForce': 'Cancelar forzado',
  'dev.reapply': 'Reaplicar ahora',
  'dev.noLogs': 'Sin registros todavía…',

  // ---------------------------------------------------------------- settings
  'settings.nav.label': 'Secciones de ajustes',

  // ---------------------------------------------------------------- settings › schedule
  'settings.schedule.title': 'Horario',
  'settings.schedule.description':
    'Elige los días y las horas en las que quieres que tu estado de Steam sea Conectado. Fuera de ese horario, la app cambiará tu estado a Invisible.',
  'settings.schedule.from': 'Conectado desde',
  'settings.schedule.until': 'Hasta',
  'settings.schedule.hours': 'Horas',
  'settings.schedule.minutes': 'Minutos',
  'settings.schedule.timeHint': 'Escribe o usa ↑ ↓ para ajustar la hora',
  'settings.schedule.windowLabel': 'Ventana de conexión',
  'settings.schedule.windowStart': 'Inicio de la ventana',
  'settings.schedule.windowEnd': 'Fin de la ventana',
  'settings.schedule.windowHint': 'Arrastra los extremos o edita las horas',
  'settings.schedule.crossesMidnight': 'Cruza medianoche',
  'settings.schedule.onlineFor': '{duration} conectado',
  'settings.schedule.days': 'Días',
  'settings.schedule.toggle': 'Activar horario',
  'settings.schedule.enabledHint':
    'Cuando está desactivado, la app deja de cambiar tu estado; el actual se mantiene.',
  'settings.schedule.noWindowWarning':
    'La hora de inicio y la de fin coinciden: ahora mismo no habría ninguna franja Conectado.',

  // ---------------------------------------------------------------- settings › steam client
  'steamClient.title': 'Cliente de Steam',
  'steamClient.description':
    'La app no inicia sesión: envía al cliente de Steam el mismo cambio que el menú Amigos → Estado.',
  'steamClient.requirement': 'Requiere Steam abierto y con sesión iniciada',
  'steamClient.running': 'Steam abierto',
  'steamClient.starting': 'Steam iniciando…',
  'steamClient.closed': 'Steam cerrado',
  'steamClient.open': 'Abrir Steam',
  'steamClient.reapply': 'Reaplicar ahora',
  'steamClient.lastApplied': 'Último estado aplicado',
  'steamClient.lastAppliedValue': '{state} a las {time}',
  'steamClient.never': 'Todavía no se ha aplicado',
  'steamClient.legacyTitle': 'Credenciales antiguas',
  'steamClient.legacyDescription':
    'Esta versión ya no usa tu cuenta. Puedes borrar los datos de la sesión anterior.',
  'steamClient.legacyHint':
    'Borrar los archivos no invalida el token: revócalo también en Steam con «Gestionar dispositivos de Steam».',
  'steamClient.legacyDelete': 'Borrar datos antiguos',
  'steamClient.legacyConfirm':
    'Se borrarán auth.json, profile.json y steam-data. No se puede deshacer. ¿Continuar?',
  'steamClient.revoke': 'Gestionar dispositivos de Steam',

  // ---------------------------------------------------------------- settings › app
  'settings.app.title': 'Aplicación',
  'settings.app.description': 'Arranque con Windows, idioma, avisos y herramientas internas.',
  'settings.app.autostart': 'Iniciar con Windows',
  'settings.app.autostartHint': 'Arranca minimizada, solo en la bandeja.',
  'settings.app.notifications': 'Notificaciones',
  'settings.app.notificationsHint': 'Aviso de Windows al cambiar de estado.',
  'settings.app.devMode': 'Modo desarrollador',
  'settings.app.devModeHint':
    'Muestra una pestaña extra con herramientas internas (forzar estados, registro en vivo).',
  'settings.app.advanced': 'Avanzado',

  // ---------------------------------------------------------------- settings › appearance
  'settings.appearance.title': 'Apariencia',
  'settings.appearance.description': 'Detalle de la cuenta atrás del panel.',
  'settings.appearance.countdown': 'Cuenta atrás',
  'settings.appearance.countdownHint': 'Unidades que se muestran en el contador del panel.',
  'settings.appearance.countdownHours': 'Horas',
  'settings.appearance.countdownMinutes': 'Horas y minutos',
  'settings.appearance.countdownSeconds': 'Horas, minutos y segundos',

  // ---------------------------------------------------------------- settings › language
  'settings.language.title': 'Idioma',
  'settings.language.description':
    'Idioma de la aplicación. Cambia al momento en toda la interfaz, la bandeja y las notificaciones.',

  // ---------------------------------------------------------------- settings › data
  'settings.data.title': 'Datos y registros',
  'settings.data.description': 'La configuración y el registro se guardan en local, en esta carpeta.',
  'settings.data.folder': 'Carpeta de datos',
  'settings.data.open': 'Abrir carpeta',
  'settings.data.copy': 'Copiar diagnóstico',
  'settings.data.copied': 'Copiado',
  'settings.data.clear': 'Vaciar registro',
  'settings.data.clearTitle': 'Registro',
  'settings.data.clearHint':
    'Borra las líneas actuales de status.log. No afecta a la configuración.',
  'settings.data.clearConfirm':
    '¿Vaciar el registro? Se borrarán las líneas actuales de status.log.',
  'settings.data.maintenance': 'Mantenimiento',
  'settings.data.hint':
    'El diagnóstico incluye la versión, el estado del cliente y las últimas líneas del registro: útil si abres un incidente en GitHub. Desinstalar la app no borra esta carpeta.',
  'settings.data.copyError': 'No se pudo copiar: {error}',

  // ---------------------------------------------------------------- settings › about
  'settings.about.title': 'Acerca de',
  'settings.about.blurb':
    'Cambia tu presencia de Steam según el horario configurado. La app no inicia sesión: controla el cliente que ya tienes abierto.',
  'settings.about.repo': 'Repositorio',
  'settings.about.latest': 'Última versión',
  'settings.about.report': 'Reportar un problema',
  'settings.about.updates':
    'Las actualizaciones son manuales: instala la última versión encima y tus datos se conservan.',

  // ---------------------------------------------------------------- durations (formatDuration)
  'duration.days': '{d} d {h} h',
  'duration.hours': '{h} h {m} min',
  'duration.minutes': '{m} min {s} s',
  'duration.seconds': '{s} s',
  'duration.dayShort': 'd',
  'duration.hourShort': 'h',
  'duration.minuteShort': 'min',
  'duration.secondShort': 's',

  // ---------------------------------------------------------------- clipboard diagnostics
  'diag.title': '=== Steam Auto Status — diagnóstico ===',
  'diag.version': 'Versión: {value}',
  'diag.unknown': 'desconocida',
  'diag.dataDir': 'Carpeta de datos: {value}',
  'diag.steamClient': 'Cliente de Steam: {state}',
  'diag.presence':
    'Presencia: {persona} (deseada: {desired}) · en franja: {inWindow} · pausada: {paused}',
  'diag.lastApplied': 'Último estado aplicado: {value}',
  'diag.schedule': 'Horario: {days} {from}→{until}',
  'diag.lastError': 'Último error: {value}',
  'diag.none': 'ninguno',
  'diag.noState': 'Estado: aún no recibido',
  'diag.logHeader': '--- Registro reciente ---',
}

/** The same key set as `es`, in English. A missing or unknown key fails the build. */
const en: Record<keyof typeof es, string> = {
  'common.loading': 'Loading…',
  'common.online': 'Online',
  'common.invisible': 'Invisible',
  'common.noSchedule': 'No schedule',
  'common.cancel': 'Cancel',

  'nav.dashboard': 'Dashboard',
  'nav.settings': 'Settings',
  'nav.dev': 'Developer',
  'nav.label': 'Modules',
  'window.minimize': 'Minimize',
  'window.maximize': 'Maximize',
  'window.restore': 'Restore',
  'window.close': 'Close',

  'status.scheduleSummary.one': 'Schedule: 1 day · {from}–{until}',
  'status.scheduleSummary.many': 'Schedule: {count} days · {from}–{until}',
  'status.nextChange': 'Next change',
  'status.nextAt': '{state} at {time}',
  'status.in': 'in',
  'status.now': 'now',
  'status.paused': 'Automation paused',
  'status.inWindow': 'Within schedule',
  'status.outOfWindow': 'Outside schedule',
  'status.forcedUntil': 'Forced {state} until {time}',
  'status.waiting': 'Waiting for Steam',
  'status.pausedTitle': 'Paused',
  'status.pausedBody': "The app won't change your status while paused.",
  'status.steamClosedTitle': 'Steam is not running',
  'status.steamClosedBody': 'Open Steam so the app can change your status.',
  'status.steamStarting': 'Steam is starting; the status will be applied in a few seconds.',
  'status.lastApplied': 'Last change: {state} at {time}',
  'status.applyError': 'Could not change the status',

  'schedule.noWindow': 'no window',
  'schedule.hours': '{h}h',
  'schedule.hoursMinutes': '{h}h {m}m',
  'schedule.minutes': '{m}m',

  'day.mon': 'Mon',
  'day.tue': 'Tue',
  'day.wed': 'Wed',
  'day.thu': 'Thu',
  'day.fri': 'Fri',
  'day.sat': 'Sat',
  'day.sun': 'Sun',

  'dev.title': 'Tests & log',
  'dev.description':
    'Force a temporary state to check how your friends see you; it returns to the schedule on its own when done.',
  'dev.forceOnline': 'Online {minutes} min',
  'dev.forceInvisible': 'Invisible {minutes} min',
  'dev.cancelForce': 'Cancel override',
  'dev.reapply': 'Reapply now',
  'dev.noLogs': 'No log entries yet…',

  'settings.nav.label': 'Settings sections',

  'settings.schedule.title': 'Schedule',
  'settings.schedule.description':
    'Choose the days and times when you want your Steam status to be Online. Outside that schedule, the app switches your status to Invisible.',
  'settings.schedule.from': 'Online from',
  'settings.schedule.until': 'Until',
  'settings.schedule.hours': 'Hours',
  'settings.schedule.minutes': 'Minutes',
  'settings.schedule.timeHint': 'Type or use ↑ ↓ to adjust the time',
  'settings.schedule.windowLabel': 'Online window',
  'settings.schedule.windowStart': 'Window start',
  'settings.schedule.windowEnd': 'Window end',
  'settings.schedule.windowHint': 'Drag the ends or edit the times',
  'settings.schedule.crossesMidnight': 'Crosses midnight',
  'settings.schedule.onlineFor': '{duration} online',
  'settings.schedule.days': 'Days',
  'settings.schedule.toggle': 'Enable schedule',
  'settings.schedule.enabledHint':
    'When off, the app stops changing your status; it stays as it is.',
  'settings.schedule.noWindowWarning':
    'Start and end time are the same: there would be no Online window right now.',

  'steamClient.title': 'Steam client',
  'steamClient.description':
    'The app does not sign in: it sends the Steam client the same change as the Friends → Status menu.',
  'steamClient.requirement': 'Requires Steam open and signed in',
  'steamClient.running': 'Steam open',
  'steamClient.starting': 'Steam starting…',
  'steamClient.closed': 'Steam closed',
  'steamClient.open': 'Open Steam',
  'steamClient.reapply': 'Reapply now',
  'steamClient.lastApplied': 'Last applied state',
  'steamClient.lastAppliedValue': '{state} at {time}',
  'steamClient.never': 'Not applied yet',
  'steamClient.legacyTitle': 'Old credentials',
  'steamClient.legacyDescription':
    'This version no longer uses your account. You can delete the data from the previous session.',
  'steamClient.legacyHint':
    'Deleting the files does not invalidate the token: also revoke it in Steam with "Manage Steam devices".',
  'steamClient.legacyDelete': 'Delete old data',
  'steamClient.legacyConfirm':
    'auth.json, profile.json and steam-data will be deleted. This cannot be undone. Continue?',
  'steamClient.revoke': 'Manage Steam devices',

  'settings.app.title': 'Application',
  'settings.app.description': 'Windows startup, language, notifications and internal tools.',
  'settings.app.autostart': 'Start with Windows',
  'settings.app.autostartHint': 'Starts minimized, in the tray only.',
  'settings.app.notifications': 'Notifications',
  'settings.app.notificationsHint': 'Windows notification when the status changes.',
  'settings.app.devMode': 'Developer mode',
  'settings.app.devModeHint':
    'Shows an extra tab with internal tools (force states, live log).',
  'settings.app.advanced': 'Advanced',

  'settings.appearance.title': 'Appearance',
  'settings.appearance.description': 'Dashboard countdown detail.',
  'settings.appearance.countdown': 'Countdown',
  'settings.appearance.countdownHint': 'Units shown in the dashboard countdown.',
  'settings.appearance.countdownHours': 'Hours',
  'settings.appearance.countdownMinutes': 'Hours & minutes',
  'settings.appearance.countdownSeconds': 'Hours, minutes & seconds',

  'settings.language.title': 'Language',
  'settings.language.description':
    'App language. Changes instantly across the interface, the tray and notifications.',

  'settings.data.title': 'Data & logs',
  'settings.data.description': 'Settings and log are stored locally, in this folder.',
  'settings.data.folder': 'Data folder',
  'settings.data.open': 'Open folder',
  'settings.data.copy': 'Copy diagnostics',
  'settings.data.copied': 'Copied',
  'settings.data.clear': 'Clear log',
  'settings.data.clearTitle': 'Log',
  'settings.data.clearHint': 'Deletes the current status.log lines. Settings are not affected.',
  'settings.data.clearConfirm': 'Clear the log? The current status.log lines will be deleted.',
  'settings.data.maintenance': 'Maintenance',
  'settings.data.hint':
    'The diagnostics include the version, the client state and the latest log lines: useful when you open a GitHub issue. Uninstalling the app does not delete this folder.',
  'settings.data.copyError': 'Could not copy: {error}',

  'settings.about.title': 'About',
  'settings.about.blurb':
    'Switches your Steam presence on the configured schedule. The app does not sign in: it controls the client you already have open.',
  'settings.about.repo': 'Repository',
  'settings.about.latest': 'Latest release',
  'settings.about.report': 'Report an issue',
  'settings.about.updates':
    'Updates are manual: install the latest version over this one and your data is preserved.',

  'duration.days': '{d}d {h}h',
  'duration.hours': '{h}h {m}m',
  'duration.minutes': '{m}m {s}s',
  'duration.seconds': '{s}s',
  'duration.dayShort': 'd',
  'duration.hourShort': 'h',
  'duration.minuteShort': 'm',
  'duration.secondShort': 's',

  'diag.title': '=== Steam Auto Status — diagnostics ===',
  'diag.version': 'Version: {value}',
  'diag.unknown': 'unknown',
  'diag.dataDir': 'Data folder: {value}',
  'diag.steamClient': 'Steam client: {state}',
  'diag.presence': 'Presence: {persona} (desired: {desired}) · in window: {inWindow} · paused: {paused}',
  'diag.lastApplied': 'Last applied state: {value}',
  'diag.schedule': 'Schedule: {days} {from}→{until}',
  'diag.lastError': 'Last error: {value}',
  'diag.none': 'none',
  'diag.noState': 'State: not received yet',
  'diag.logHeader': '--- Recent log ---',
}

export type TranslationKey = keyof typeof es
export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number | boolean>,
) => string

/** Name of each language shown in Settings, always written in that language. */
export const LANGUAGE_NAMES: Record<Language, string> = { es: 'Español', en: 'English' }

/** BCP-47 locales used for Intl date/time formatting. */
export const LANGUAGE_LOCALES: Record<Language, string> = { es: 'es-ES', en: 'en-US' }

const twelveHourClocks = new Map<Language, boolean>()

/** Whether clocks in `lang` use AM/PM instead of a 24-hour cycle (English does). */
export function uses12HourClock(lang: Language): boolean {
  const cached = twelveHourClocks.get(lang)
  if (cached !== undefined) return cached
  const value = new Intl.DateTimeFormat(LANGUAGE_LOCALES[lang], { hour: 'numeric' })
    .resolvedOptions().hour12 === true
  twelveHourClocks.set(lang, value)
  return value
}

/** Looks up `key` in the given language and replaces its `{param}` placeholders. */
export function translate(
  lang: Language,
  key: TranslationKey,
  params?: Record<string, string | number | boolean>,
): string {
  let s: string = lang === 'en' ? en[key] : es[key]
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** Best-effort guess for the first frames, before the core reports the saved language. */
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'es'
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** Timestamp rendered as a clock time in the app language (24h in Spanish, 12h in English). */
export function formatClockAt(ms: number, lang: Language): string {
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[lang], {
    // `numeric` keeps Spanish at "17:30" and reads naturally in English ("5:30 PM").
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
}

/** Stored "HH:MM" value rendered per language (e.g. "17:30" → "5:30 PM" in English). */
export function formatClock(time: string, lang: Language): string {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  return formatClockAt(new Date(2000, 0, 1, h, m).getTime(), lang)
}

/** Human-readable countdown length: "2 h 14 min" (es) / "2h 14m" (en). */
export function formatDuration(ms: number, t: Translate): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return t('duration.days', { d, h })
  if (h > 0) return t('duration.hours', { h, m })
  if (m > 0) return t('duration.minutes', { m, s: sec })
  return t('duration.seconds', { s: sec })
}
