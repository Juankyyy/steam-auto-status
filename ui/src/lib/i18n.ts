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
  'common.connecting': 'Conectando…',
  'common.offline': 'Sin conexión',
  'common.online': 'Conectado',
  'common.invisible': 'Invisible',
  'common.noSchedule': 'Sin programación',
  'common.cancel': 'Cancelar',

  'connection.connected': 'Conectado a Steam',

  // ---------------------------------------------------------------- header
  'nav.dashboard': 'Panel de control',
  'nav.settings': 'Ajustes',
  'nav.dev': 'Desarrollador',
  'nav.label': 'Módulos',
  'nav.signIn': 'Iniciar sesión',

  // ---------------------------------------------------------------- dashboard › status
  'status.scheduleSummary.one': 'Horario: 1 día · {from}–{until}',
  'status.scheduleSummary.many': 'Horario: {count} días · {from}–{until}',
  'status.noSession': 'Sin sesión',
  'status.activeAs': 'Sesión activa como {name}',
  'status.activeSession': 'Sesión activa en Steam',
  'status.connectingSteam': 'Conectando con Steam…',
  'status.noSteam': 'Sin conexión con Steam',
  'status.nextChange': 'Próximo cambio',
  'status.nextAt': '{state} a las {time}',
  'status.inDuration': 'en {duration}',
  'status.now': 'ahora',
  'status.paused': 'Automatización en pausa',
  'status.inWindow': 'Dentro de la franja',
  'status.outOfWindow': 'Fuera de la franja',
  'status.forcedUntil': 'Forzado {state} hasta las {time}',
  'status.connError': 'Error de conexión con Steam',
  'status.retry': 'Reintentar',

  // ---------------------------------------------------------------- dashboard › schedule card
  'schedule.title': 'Programación',
  'schedule.quickLabel': 'Automatización activa',
  'schedule.quickHint': 'Al pausarla, tu sesión pasa a Invisible y no cambia sola.',
  'schedule.editInSettings': 'Editar en Ajustes',

  // ---------------------------------------------------------------- schedule summaries (lib/schedule.ts)
  'schedule.noWindow': 'sin franja',
  'schedule.noDays': 'Ningún día',
  'schedule.everyDay': 'Todos los días',
  'schedule.weekdays': 'Lun–Vie',
  'schedule.weekend': 'Sáb y Dom',
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

  // ---------------------------------------------------------------- login panel
  'login.title': 'Conectar con Steam',
  'login.description':
    'Elige el método: código QR con la app móvil (recomendado) o tu usuario y contraseña.',
  'login.tabQr': 'Código QR',
  'login.tabCreds': 'Usuario y contraseña',
  'login.reasonTitle': 'Se necesita iniciar sesión',
  'login.errorTitle': 'Error',
  'login.qrAlt': 'Código QR de inicio de sesión de Steam',
  'login.qrScanned': 'Código escaneado ✓ — confirma la solicitud en la app móvil de Steam.',
  'login.qrApproved': 'Aprobado ✓ — conectando con Steam…',
  'login.qrExpired': 'El código caducó. Genera uno nuevo.',
  'login.qrHint': 'Abre la app de Steam en tu móvil, escanea el código y confirma la solicitud.',
  'login.qrExpiredBox': 'El código caducó',
  'login.generating': 'Generando código…',
  'login.generateAnother': 'Generar otro código',
  'login.guardEmail': 'Steam envió un código a tu correo (termina en {domain}).',
  'login.guardMobile':
    'Introduce el código actual que muestra la app móvil de Steam (sección Steam Guard), o aprueba la solicitud si te aparece en el móvil.',
  'login.wrongCodeTitle': 'Código incorrecto',
  'login.wrongCodeBody':
    'Espera ~30 s a que la app genere un código nuevo e inténtalo otra vez.',
  'login.codeLabel': 'Código',
  'login.checking': 'Comprobando…',
  'login.submit': 'Enviar',
  'login.approveTitle': 'Aprueba el inicio de sesión',
  'login.approveBody':
    'Steam te está pidiendo confirmación. Abre la app móvil de Steam y toca «Aceptar» en la solicitud de inicio de sesión; esta ventana se conectará sola.',
  'login.accountLabel': 'Usuario de Steam',
  'login.passwordLabel': 'Contraseña',
  'login.credsHint':
    'Las credenciales se envían directamente a Steam; la contraseña no se guarda (solo un token de sesión).',
  'login.submitting': 'Iniciando sesión…',
  'login.signIn': 'Iniciar sesión',

  // ---------------------------------------------------------------- account chip
  'account.aria': 'Cuenta de Steam: {name}',

  // ---------------------------------------------------------------- developer › tests
  'dev.title': 'Pruebas y registro',
  'dev.description':
    'Fuerza un estado temporal para comprobar cómo te ven tus amigos; al terminar vuelve solo al horario.',
  'dev.forceOnline': 'Conectado {minutes} min',
  'dev.forceInvisible': 'Invisible {minutes} min',
  'dev.cancelForce': 'Cancelar forzado',
  'dev.noLogs': 'Sin registros todavía…',

  // ---------------------------------------------------------------- settings › schedule
  'settings.schedule.title': 'Horario',
  'settings.schedule.description':
    'Horario en hora local. Si la hora de fin es anterior a la de inicio, la franja termina al día siguiente (p. ej. 17:30 → 01:00).',
  'settings.schedule.from': 'Conectado desde',
  'settings.schedule.until': 'Hasta',
  'settings.schedule.days': 'Días',
  'settings.schedule.noWindowWarning':
    'La hora de inicio y la de fin coinciden: ahora mismo no habría ninguna franja Conectado.',
  'settings.schedule.restore': 'Restaurar por defecto',

  // ---------------------------------------------------------------- settings › account
  'settings.account.title': 'Cuenta de Steam',
  'settings.account.description': 'Sesión que reporta tu presencia en Steam.',
  'settings.account.saved': 'Sesión guardada',
  'settings.account.none': 'Sin cuenta conectada',
  'settings.account.reconnect': 'Reconectar',
  'settings.account.machine': 'Nombre de máquina',
  'settings.account.machineTooltip':
    'Nombre que reporta esta sesión a Steam. Visible solo para ti en tus dispositivos.',
  'settings.account.machineHint': 'Se aplica en la próxima conexión con Steam.',
  'settings.account.logoutHint':
    'Cerrar sesión elimina el token guardado; para volver a conectarte tendrás que iniciar sesión de nuevo.',
  'settings.account.logout': 'Cerrar sesión',
  'settings.account.logoutConfirm':
    '¿Cerrar sesión de Steam? Se borrará el token guardado y tendrás que iniciar sesión de nuevo.',

  // ---------------------------------------------------------------- settings › app
  'settings.app.title': 'Aplicación',
  'settings.app.description': 'Arranque con Windows, avisos y herramientas internas.',
  'settings.app.autostart': 'Iniciar con Windows',
  'settings.app.autostartHint': 'Arranca minimizada, solo en la bandeja.',
  'settings.app.notifications': 'Notificaciones',
  'settings.app.notificationsHint': 'Aviso de Windows al cambiar de estado.',
  'settings.app.devMode': 'Modo desarrollador',
  'settings.app.devModeHint':
    'Muestra una pestaña extra con herramientas internas (forzar estados, registro en vivo).',

  // ---------------------------------------------------------------- settings › language
  'settings.language.title': 'Idioma',
  'settings.language.description':
    'Idioma de la aplicación. Cambia al momento en toda la interfaz, la bandeja y las notificaciones.',

  // ---------------------------------------------------------------- settings › data
  'settings.data.title': 'Datos y registros',
  'settings.data.description':
    'Configuración, token y registro se guardan en local, en esta carpeta.',
  'settings.data.folder': 'Carpeta de datos',
  'settings.data.open': 'Abrir carpeta',
  'settings.data.copy': 'Copiar diagnóstico',
  'settings.data.copied': 'Copiado',
  'settings.data.clear': 'Vaciar registro',
  'settings.data.clearConfirm':
    '¿Vaciar el registro? Se borrarán las líneas actuales de status.log.',
  'settings.data.hint':
    'El diagnóstico incluye la versión, el estado de la conexión y las últimas líneas del registro: útil si abres un incidente en GitHub. Desinstalar la app no borra esta carpeta.',
  'settings.data.copyError': 'No se pudo copiar: {error}',

  // ---------------------------------------------------------------- settings › about
  'settings.about.title': 'Acerca de',
  'settings.about.blurb':
    'Cambia tu presencia de Steam según el horario configurado. Nada sale de tu equipo salvo lo necesario para hablar con Steam.',
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

  // ---------------------------------------------------------------- clipboard diagnostics
  'diag.title': '=== Steam Auto Status — diagnóstico ===',
  'diag.version': 'Versión: {value}',
  'diag.unknown': 'desconocida',
  'diag.dataDir': 'Carpeta de datos: {value}',
  'diag.connection': 'Conexión: {conn} · fase: {phase}',
  'diag.presence':
    'Presencia: {persona} (deseada: {desired}) · en franja: {inWindow} · pausada: {paused}',
  'diag.account': 'Cuenta: {name} ({steamID})',
  'diag.schedule': 'Horario: {days} {from}→{until}',
  'diag.lastError': 'Último error: {value}',
  'diag.none': 'ninguno',
  'diag.noState': 'Estado: aún no recibido',
  'diag.logHeader': '--- Registro reciente ---',
}

/** The same key set as `es`, in English. A missing or unknown key fails the build. */
const en: Record<keyof typeof es, string> = {
  'common.loading': 'Loading…',
  'common.connecting': 'Connecting…',
  'common.offline': 'Offline',
  'common.online': 'Online',
  'common.invisible': 'Invisible',
  'common.noSchedule': 'No schedule',
  'common.cancel': 'Cancel',

  'connection.connected': 'Connected to Steam',

  'nav.dashboard': 'Dashboard',
  'nav.settings': 'Settings',
  'nav.dev': 'Developer',
  'nav.label': 'Modules',
  'nav.signIn': 'Sign in',

  'status.scheduleSummary.one': 'Schedule: 1 day · {from}–{until}',
  'status.scheduleSummary.many': 'Schedule: {count} days · {from}–{until}',
  'status.noSession': 'No session',
  'status.activeAs': 'Signed in as {name}',
  'status.activeSession': 'Active session on Steam',
  'status.connectingSteam': 'Connecting to Steam…',
  'status.noSteam': 'No connection to Steam',
  'status.nextChange': 'Next change',
  'status.nextAt': '{state} at {time}',
  'status.inDuration': 'in {duration}',
  'status.now': 'now',
  'status.paused': 'Automation paused',
  'status.inWindow': 'Within schedule',
  'status.outOfWindow': 'Outside schedule',
  'status.forcedUntil': 'Forced {state} until {time}',
  'status.connError': 'Steam connection error',
  'status.retry': 'Retry',

  'schedule.title': 'Schedule',
  'schedule.quickLabel': 'Automation active',
  'schedule.quickHint': 'When paused, your session goes Invisible and stops changing on its own.',
  'schedule.editInSettings': 'Edit in Settings',

  'schedule.noWindow': 'no window',
  'schedule.noDays': 'No days',
  'schedule.everyDay': 'Every day',
  'schedule.weekdays': 'Mon–Fri',
  'schedule.weekend': 'Sat & Sun',
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

  'login.title': 'Connect to Steam',
  'login.description':
    'Choose a method: QR code with the mobile app (recommended), or your username and password.',
  'login.tabQr': 'QR code',
  'login.tabCreds': 'Username & password',
  'login.reasonTitle': 'Sign-in required',
  'login.errorTitle': 'Error',
  'login.qrAlt': 'Steam sign-in QR code',
  'login.qrScanned': 'Code scanned ✓ — confirm the request in the Steam mobile app.',
  'login.qrApproved': 'Approved ✓ — connecting to Steam…',
  'login.qrExpired': 'The code expired. Generate a new one.',
  'login.qrHint': 'Open the Steam app on your phone, scan the code and confirm the request.',
  'login.qrExpiredBox': 'The code expired',
  'login.generating': 'Generating code…',
  'login.generateAnother': 'Generate another code',
  'login.guardEmail': 'Steam emailed a code to you (ends in {domain}).',
  'login.guardMobile':
    'Enter the current code shown in the Steam mobile app (Steam Guard section), or approve the request if it appears on your phone.',
  'login.wrongCodeTitle': 'Wrong code',
  'login.wrongCodeBody': 'Wait ~30 s for the app to generate a new code, then try again.',
  'login.codeLabel': 'Code',
  'login.checking': 'Checking…',
  'login.submit': 'Submit',
  'login.approveTitle': 'Approve the sign-in',
  'login.approveBody':
    'Steam is asking for confirmation. Open the Steam mobile app and tap "Accept" on the sign-in request; this window will connect by itself.',
  'login.accountLabel': 'Steam account name',
  'login.passwordLabel': 'Password',
  'login.credsHint':
    'Credentials are sent straight to Steam; the password is never stored (only a session token).',
  'login.submitting': 'Signing in…',
  'login.signIn': 'Sign in',

  'account.aria': 'Steam account: {name}',

  'dev.title': 'Tests & log',
  'dev.description':
    'Force a temporary state to check how your friends see you; it returns to the schedule on its own when done.',
  'dev.forceOnline': 'Online {minutes} min',
  'dev.forceInvisible': 'Invisible {minutes} min',
  'dev.cancelForce': 'Cancel override',
  'dev.noLogs': 'No log entries yet…',

  'settings.schedule.title': 'Schedule',
  'settings.schedule.description':
    'Local time. If the end time is earlier than the start time, the window ends the next day (e.g. 5:30 PM → 1:00 AM).',
  'settings.schedule.from': 'Online from',
  'settings.schedule.until': 'Until',
  'settings.schedule.days': 'Days',
  'settings.schedule.noWindowWarning':
    'Start and end time are the same: there would be no Online window right now.',
  'settings.schedule.restore': 'Restore defaults',

  'settings.account.title': 'Steam account',
  'settings.account.description': 'The session that reports your presence on Steam.',
  'settings.account.saved': 'Saved session',
  'settings.account.none': 'No account connected',
  'settings.account.reconnect': 'Reconnect',
  'settings.account.machine': 'Machine name',
  'settings.account.machineTooltip':
    'The name this session reports to Steam. Visible only to you, on your devices.',
  'settings.account.machineHint': 'Applies on the next Steam connection.',
  'settings.account.logoutHint':
    'Signing out deletes the saved token; you will have to sign in again to reconnect.',
  'settings.account.logout': 'Sign out',
  'settings.account.logoutConfirm':
    'Sign out of Steam? The saved token will be deleted and you will have to sign in again.',

  'settings.app.title': 'Application',
  'settings.app.description': 'Windows startup, notifications and internal tools.',
  'settings.app.autostart': 'Start with Windows',
  'settings.app.autostartHint': 'Starts minimized, in the tray only.',
  'settings.app.notifications': 'Notifications',
  'settings.app.notificationsHint': 'Windows notification when the status changes.',
  'settings.app.devMode': 'Developer mode',
  'settings.app.devModeHint':
    'Shows an extra tab with internal tools (force states, live log).',

  'settings.language.title': 'Language',
  'settings.language.description':
    'App language. Changes instantly across the interface, the tray and notifications.',

  'settings.data.title': 'Data & logs',
  'settings.data.description': 'Settings, token and log are stored locally, in this folder.',
  'settings.data.folder': 'Data folder',
  'settings.data.open': 'Open folder',
  'settings.data.copy': 'Copy diagnostics',
  'settings.data.copied': 'Copied',
  'settings.data.clear': 'Clear log',
  'settings.data.clearConfirm': 'Clear the log? The current status.log lines will be deleted.',
  'settings.data.hint':
    'The diagnostics include the version, connection state and the latest log lines: useful when you open a GitHub issue. Uninstalling the app does not delete this folder.',
  'settings.data.copyError': 'Could not copy: {error}',

  'settings.about.title': 'About',
  'settings.about.blurb':
    'Switches your Steam presence on the configured schedule. Nothing leaves your machine except what is needed to talk to Steam.',
  'settings.about.repo': 'Repository',
  'settings.about.latest': 'Latest release',
  'settings.about.report': 'Report an issue',
  'settings.about.updates':
    'Updates are manual: install the latest version over this one and your data is preserved.',

  'duration.days': '{d}d {h}h',
  'duration.hours': '{h}h {m}m',
  'duration.minutes': '{m}m {s}s',
  'duration.seconds': '{s}s',

  'diag.title': '=== Steam Auto Status — diagnostics ===',
  'diag.version': 'Version: {value}',
  'diag.unknown': 'unknown',
  'diag.dataDir': 'Data folder: {value}',
  'diag.connection': 'Connection: {conn} · phase: {phase}',
  'diag.presence': 'Presence: {persona} (desired: {desired}) · in window: {inWindow} · paused: {paused}',
  'diag.account': 'Account: {name} ({steamID})',
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

/** Best-effort guess for the first frames, before the sidecar reports the saved language. */
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
