import { getVersion } from '@tauri-apps/api/app'
import { isTauri, type AppState } from '@/lib/tauri'

/** Text copied by Settings › Data › "Copiar diagnóstico" (version, state snapshot, recent log). */
export async function buildDiagnostics(state: AppState | null, logs: string[]): Promise<string> {
  let version = 'desconocida'
  try {
    if (isTauri) version = await getVersion()
  } catch {
    /* running outside the shell (e.g. browser preview) */
  }

  const out: string[] = ['=== Steam Auto Status — diagnóstico ===', `Versión: ${version}`]
  if (state) {
    out.push(
      `Carpeta de datos: ${state.dataDir}`,
      `Conexión: ${state.connection} · fase: ${state.loginPhase}`,
      `Presencia: ${state.persona ?? '—'} (deseada: ${state.desired}) · en franja: ${state.inWindow} · pausada: ${state.paused}`,
      `Cuenta: ${state.account?.name ?? '—'} (${state.account?.steamID ?? '—'})`,
      `Horario: ${state.config.days.join(', ')} ${state.config.onlineFrom}→${state.config.onlineUntil}`,
      `Último error: ${state.lastError?.message ?? 'ninguno'}`,
    )
  } else {
    out.push('Estado: aún no recibido')
  }
  out.push('', '--- Registro reciente ---', ...logs.slice(-100))
  return out.join('\n')
}
