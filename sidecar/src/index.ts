/**
 * Steam Auto Status — sidecar (core)
 *
 * Keeps a Steam session running 24/7 and switches presence (Online/Invisible)
 * according to the configured schedule. It communicates with the Tauri shell
 * over stdin/stdout with one-line JSON messages.
 *
 * Usage: node dist/sidecar.cjs --data-dir <folder>
 */

import SteamUser from 'steam-user';
import { EAuthSessionGuardType, EAuthTokenPlatformType, LoginSession } from 'steam-session';
import QRCode from 'qrcode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

// ---------------------------------------------------------------- types

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Day = (typeof DAYS)[number];
type Persona = 'online' | 'invisible';
type LoginPhase = 'idle' | 'connecting' | 'awaiting_guard' | 'awaiting_qr' | 'awaiting_approval' | 'qr_expired';

interface Config {
  days: Day[];
  onlineFrom: string;
  onlineUntil: string;
  paused: boolean;
  startWithWindows: boolean;
  startMinimized: boolean;
  notifications: boolean;
  machineName: string;
}

interface AuthFile {
  refreshToken: string;
  steamID?: string;
}

const DEFAULT_CONFIG: Config = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  onlineFrom: '17:30',
  onlineUntil: '01:00',
  paused: false,
  startWithWindows: false,
  startMinimized: true,
  notifications: false,
  machineName: 'AutoStatus',
};

// ---------------------------------------------------------------- arguments and paths

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dataDir = path.resolve(getArg('--data-dir') ?? process.cwd());
const logsDir = path.join(dataDir, 'logs');
const logPath = path.join(logsDir, 'status.log');
const configPath = path.join(dataDir, 'config.json');
const authPath = path.join(dataDir, 'auth.json');
const steamDataDir = path.join(dataDir, 'steam-data');

// ---------------------------------------------------------------- IPC (stdin/stdout)

function send(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
function emit(event: string, data: unknown = {}) {
  send({ type: 'event', event, data });
}
function res(id: unknown, result: unknown) {
  send({ type: 'res', id, result });
}
function ipcError(id: unknown, message: string) {
  send({ type: 'res', id, error: message });
}

// ---------------------------------------------------------------- log

function rotateLogIfNeeded() {
  try {
    const st = fs.statSync(logPath);
    if (st.size > 1_000_000) fs.renameSync(logPath, logPath + '.1');
  } catch {
    /* doesn't exist or can't be rotated: ignore */
  }
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    rotateLogIfNeeded();
    fs.appendFileSync(logPath, line + '\n');
  } catch {
    /* no write permission: the event still goes out over IPC */
  }
  emit('log', { line });
}

function readTail(n: number): string[] {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    return content.split(/\r?\n/).filter(Boolean).slice(-n);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- configuration

let cfg: Config = structuredClone(DEFAULT_CONFIG);

function normTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function sanitizeConfig(raw: Record<string, unknown>): Config {
  const days = Array.isArray(raw.days)
    ? (raw.days.filter((d) => (DAYS as readonly string[]).includes(String(d))) as Day[])
    : [...DEFAULT_CONFIG.days];
  const machineName = typeof raw.machineName === 'string' && raw.machineName.trim()
    ? raw.machineName.trim().slice(0, 32)
    : DEFAULT_CONFIG.machineName;
  return {
    days,
    onlineFrom: normTime(raw.onlineFrom) ?? DEFAULT_CONFIG.onlineFrom,
    onlineUntil: normTime(raw.onlineUntil) ?? DEFAULT_CONFIG.onlineUntil,
    paused: !!raw.paused,
    startWithWindows: !!raw.startWithWindows,
    startMinimized: !!raw.startMinimized,
    notifications: !!raw.notifications,
    machineName,
  };
}

function loadConfig() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    /* ignore */
  }
  if (!fs.existsSync(configPath)) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } catch {
      /* ignore */
    }
  }
  try {
    cfg = sanitizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) });
  } catch (e) {
    log(`config.json inválido, usando valores por defecto (${e})`);
    cfg = structuredClone(DEFAULT_CONFIG);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  } catch (e) {
    log(`No se pudo guardar config.json: ${e}`);
  }
}

// ---------------------------------------------------------------- auth

let auth: AuthFile | null = null;

function loadAuth() {
  try {
    auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as AuthFile;
    if (typeof auth.refreshToken !== 'string' || !auth.refreshToken) auth = null;
  } catch {
    auth = null;
  }
}

function saveAuth(a: AuthFile) {
  auth = a;
  try {
    fs.writeFileSync(authPath, JSON.stringify(a, null, 2));
  } catch (e) {
    log(`No se pudo guardar auth.json: ${e}`);
  }
}

function clearAuth() {
  auth = null;
  try {
    fs.rmSync(authPath, { force: true });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- schedule

const DAY_MS = 86_400_000;

function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 3_600_000 + m * 60_000;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function windowDurationMs(c: Config): number {
  return (parseHM(c.onlineUntil) - parseHM(c.onlineFrom) + DAY_MS) % DAY_MS;
}

/** Are we inside an Online window? (checks today's and yesterday's) */
function inWindowAt(now: Date, c: Config): boolean {
  const dur = windowDurationMs(c);
  if (dur === 0) return false; // from == until → no window
  for (const offset of [0, 1]) {
    const day = startOfDay(new Date(now.getTime() - offset * DAY_MS));
    if (!c.days.includes(DAYS[day.getDay()])) continue;
    const start = day.getTime() + parseHM(c.onlineFrom);
    if (now.getTime() >= start && now.getTime() < start + dur) return true;
  }
  return false;
}

/** Next scheduled state change */
function nextTransition(now: Date, c: Config): { at: number; to: Persona } | null {
  const dur = windowDurationMs(c);
  if (dur === 0) return null;
  const candidates: { at: number; to: Persona }[] = [];
  for (let offset = -1; offset <= 7; offset++) {
    const day = startOfDay(new Date(now.getTime() + offset * DAY_MS));
    if (!c.days.includes(DAYS[day.getDay()])) continue;
    const start = day.getTime() + parseHM(c.onlineFrom);
    candidates.push({ at: start, to: 'online' });
    candidates.push({ at: start + dur, to: 'invisible' });
  }
  return candidates.filter((x) => x.at > now.getTime()).sort((a, b) => a.at - b.at)[0] ?? null;
}

function hmLocal(tsMs: number): string {
  const d = new Date(tsMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- state

let user: SteamUser | null = null;
let steamConnected = false;
let loggingIn = false;
let appliedPersona: Persona | null = null;
let lastError: { message: string; eresult?: number } | null = null;
let guard: { domain: string | null; callback: (code: string) => void; wrong: boolean } | null = null;
let force: { persona: Persona; until: number } | null = null;
let loginPhase: LoginPhase = 'idle';
let qrSession: LoginSession | null = null;
let credsSession: LoginSession | null = null;
let ssGuard: { domain: string | null; lastCodeWrong: boolean } | null = null;
let qrDataUrl: string | null = null;

function eresultName(v: unknown): string {
  const n = Number(v);
  const map = SteamUser.EResult as unknown as Record<number, string>;
  return map && typeof map[n] === 'string' ? `${map[n]} (${n})` : String(v);
}

function desiredPersona(): Persona {
  if (force && Date.now() < force.until) return force.persona;
  if (cfg.paused) return 'invisible';
  return inWindowAt(new Date(), cfg) ? 'online' : 'invisible';
}

function applyPersona(forceApply = false) {
  if (!user || !steamConnected) return;
  const wanted = desiredPersona();
  if (!forceApply && wanted === appliedPersona) return;
  const previous = appliedPersona;
  user.setPersona(wanted === 'online' ? SteamUser.EPersonaState.Online : SteamUser.EPersonaState.Invisible);
  appliedPersona = wanted;
  log(`Presencia → ${wanted === 'online' ? 'Conectado' : 'Invisible'}`);
  if (cfg.notifications && previous && previous !== wanted) {
    emit('notify', {
      title: 'Steam Auto Status',
      body: wanted === 'online' ? 'Ahora apareces como Conectado en Steam' : 'Ahora apareces como Invisible en Steam',
    });
  }
  pushState();
}

function buildState() {
  const now = new Date();
  const nt = nextTransition(now, cfg);
  const ntLabel = nt ? `${nt.to === 'online' ? 'Conectado' : 'Invisible'} a las ${hmLocal(nt.at)}` : 'Sin programación';
  const persona: Persona | null = appliedPersona ?? (steamConnected ? 'invisible' : null);

  let tooltip = 'Steam Auto Status';
  if (!auth) tooltip += ' — Inicia sesión';
  else if (!steamConnected) tooltip += loggingIn ? ' — Conectando…' : ' — Sin conexión';
  else tooltip += ` — ${persona === 'online' ? 'Conectado' : 'Invisible'} (${ntLabel})`;

  return {
    connection: steamConnected ? 'connected' : loggingIn ? 'connecting' : 'disconnected',
    loginPhase,
    qrDataUrl: loginPhase === 'awaiting_qr' || loginPhase === 'awaiting_approval' ? qrDataUrl : null,
    persona,
    desired: desiredPersona(),
    inWindow: inWindowAt(now, cfg),
    paused: cfg.paused,
    forced: force && Date.now() < force.until ? { persona: force.persona, until: force.until } : null,
    authPresent: !!auth,
    account: user && user.steamID ? { steamID: user.steamID.toString(), name: user.accountInfo?.name ?? null } : null,
    nextTransition: nt,
    nextTransitionLabel: ntLabel,
    config: cfg,
    lastError,
    guardNeeded: guard ? { domain: guard.domain, lastCodeWrong: guard.wrong } : ssGuard,
    tooltip,
    nowMs: Date.now(),
    dataDir,
  };
}

function pushState() {
  emit('state', buildState());
}

// ---------------------------------------------------------------- Steam client

function newClient(): SteamUser {
  const u = new SteamUser({ autoRelogin: true, renewRefreshTokens: true, dataDirectory: steamDataDir });

  u.on('loggedOn', () => {
    steamConnected = true;
    loggingIn = false;
    loginPhase = 'idle';
    qrDataUrl = null;
    guard = null;
    lastError = null;
    log(`Conectado a Steam como ${u.steamID ?? '?'}`);
    applyPersona(true);
    pushState();
  });

  u.on('accountInfo', (info: { name?: string }) => {
    if (info && info.name) log(`Cuenta: ${info.name}`);
    pushState();
  });

  u.on('refreshToken', (token: string) => {
    const steamID = u.steamID ? u.steamID.toString() : auth?.steamID;
    saveAuth({ refreshToken: token, steamID });
    log('Token de sesión guardado/actualizado');
    pushState();
  });

  u.on('steamGuard', (domain: string | null, callback: (code: string) => void, lastCodeWrong: boolean) => {
    loggingIn = false;
    loginPhase = 'awaiting_guard';
    guard = { domain: domain ?? null, callback, wrong: !!lastCodeWrong };
    log(domain ? `Steam Guard: se necesita código del email (…${domain})` : 'Steam Guard: se necesita código de la app móvil');
    pushState();
    emit('authRequired', { kind: 'guard', domain: domain ?? null, lastCodeWrong: !!lastCodeWrong });
  });

  u.on('error', (e: Error & { eresult?: number }) => {
    loggingIn = false;
    steamConnected = false;
    guard = null;
    loginPhase = 'idle';
    lastError = { message: e.message ?? String(e), eresult: e.eresult };
    log(`Error de Steam: ${lastError.message}${e.eresult !== undefined ? ` [${eresultName(e.eresult)}]` : ''}`);
    pushState();
    const needLogin = [
      SteamUser.EResult.InvalidPassword,
      SteamUser.EResult.AccountLogonDenied,
      SteamUser.EResult.AccountLoginDeniedNeedTwoFactor,
      SteamUser.EResult.InvalidLoginAuthCode,
      SteamUser.EResult.TwoFactorCodeMismatch,
      SteamUser.EResult.AccessDenied,
      SteamUser.EResult.LogonSessionReplaced,
    ].includes(e.eresult ?? -1);
    if (needLogin) emit('authRequired', { kind: 'login', reason: lastError.message });
  });

  u.on('disconnected', (eresult: number, msg?: string) => {
    steamConnected = false;
    log(`Desconectado de Steam (${eresultName(eresult)}${msg ? `: ${msg}` : ''})`);
    pushState();
  });

  return u;
}

/** Starts/retries the connection with the saved token (or requests login) */
function start() {
  if (steamConnected) {
    log('Ya hay una sesión conectada');
    pushState();
    return;
  }
  cancelLoginSessions();
  if (!auth?.refreshToken) {
    emit('authRequired', { kind: 'login' });
    pushState();
    return;
  }
  if (user) {
    try {
      user.logOff();
    } catch {
      /* ignore */
    }
  }
  loggingIn = true;
  loginPhase = 'connecting';
  lastError = null;
  user = newClient();
  log('Iniciando sesión con token guardado…');
  user.logOn({ refreshToken: auth.refreshToken, machineName: cfg.machineName });
  pushState();
}

function doLogin(params: Record<string, unknown>) {
  const code = typeof params.code === 'string' ? params.code.trim() : '';

  if (code) {
    if (submitSsCode(code)) return;
    // Compatibility: code requested by the classic steam-user flow
    if (guard) {
      const cb = guard.callback;
      guard = null;
      loggingIn = true;
      loginPhase = 'connecting';
      log('Código de Steam Guard enviado');
      pushState();
      cb(code);
      return;
    }
    throw new Error('No hay una solicitud de código activa');
  }

  const accountName = String(params.accountName ?? '').trim();
  const password = String(params.password ?? '');
  if (!accountName || !password) throw new Error('Usuario y contraseña requeridos');

  log(`Iniciando sesión como ${accountName}…`);
  void startCredsLogin(accountName, password);
}

function doLogout() {
  try {
    user?.logOff();
  } catch {
    /* ignore */
  }
  user = null;
  steamConnected = false;
  loggingIn = false;
  appliedPersona = null;
  guard = null;
  force = null;
  lastError = null;
  loginPhase = 'idle';
  cancelLoginSessions();
  clearAuth();
  log('Sesión cerrada (token eliminado)');
  pushState();
  emit('authRequired', { kind: 'login', reason: 'Sesión cerrada' });
}

// ---------------------------------------------------------------- login with steam-session (QR and credentials)

function cancelLoginSessions() {
  if (qrSession) {
    try {
      qrSession.cancelLoginAttempt();
    } catch {
      /* ignore */
    }
    qrSession = null;
  }
  if (credsSession) {
    try {
      credsSession.cancelLoginAttempt();
    } catch {
      /* ignore */
    }
    credsSession = null;
  }
  qrDataUrl = null;
  ssGuard = null;
}

function makeLoginSession(): LoginSession {
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient, {
    machineId: true,
    machineFriendlyName: cfg.machineName,
  });
  session.loginTimeout = 150_000;

  session.on('remoteInteraction', () => {
    if (!(session === qrSession || session === credsSession)) return;
    loginPhase = 'awaiting_approval';
    log(
      session === qrSession
        ? 'QR escaneado; esperando aprobación en la app móvil'
        : 'Confirmación abierta en la app móvil; esperando aprobación',
    );
    pushState();
  });

  session.on('steamGuardMachineToken', () => {
    log('Steam Guard: token de máquina recibido');
  });

  session.on('authenticated', () => {
    finishLogin(session, session === qrSession ? 'qr' : 'creds');
  });

  session.on('timeout', () => onLoginSessionTimeout(session));
  session.on('error', (e: Error & { eresult?: number }) => onLoginSessionError(session, e));

  return session;
}

function finishLogin(session: LoginSession, method: 'qr' | 'creds') {
  if (session === qrSession) qrSession = null;
  if (session === credsSession) credsSession = null;
  qrDataUrl = null;
  ssGuard = null;
  loginPhase = 'connecting';
  saveAuth({
    refreshToken: session.refreshToken,
    steamID: session.steamID ? String(session.steamID) : undefined,
  });
  log(
    `${method === 'qr' ? 'QR aprobado' : 'Sesión iniciada con credenciales'} (${session.accountName ?? 'cuenta'}); token guardado`,
  );
  if (user) {
    try {
      user.logOff();
    } catch {
      /* ignore */
    }
    user = null;
  }
  start();
}

function onLoginSessionError(session: LoginSession, e: Error & { eresult?: number }) {
  if (!(session === qrSession || session === credsSession)) return;
  if (session === qrSession) qrSession = null;
  if (session === credsSession) credsSession = null;
  qrDataUrl = null;
  ssGuard = null;
  loggingIn = false;
  loginPhase = 'idle';
  lastError = { message: e.message ?? String(e), eresult: e.eresult };
  log(`Error en el inicio de sesión: ${lastError.message}`);
  pushState();
}

function onLoginSessionTimeout(session: LoginSession) {
  const wasQr = session === qrSession;
  if (!(wasQr || session === credsSession)) return;
  if (wasQr) qrSession = null;
  if (session === credsSession) credsSession = null;
  qrDataUrl = null;
  ssGuard = null;
  loggingIn = false;
  loginPhase = wasQr ? 'qr_expired' : 'idle';
  if (!wasQr) lastError = { message: 'El intento de inicio de sesión caducó; inténtalo de nuevo' };
  log(wasQr ? 'El código QR caducó sin completarse' : 'El intento de inicio de sesión caducó');
  pushState();
}

function startQrLogin() {
  cancelLoginSessions();
  if (user && steamConnected) {
    log('Ya hay una sesión conectada');
    return;
  }

  loginPhase = 'awaiting_qr';
  lastError = null;

  const session = makeLoginSession();
  qrSession = session;

  session
    .startWithQR()
    .then(async (res) => {
      if (qrSession !== session) return;
      qrDataUrl = await QRCode.toDataURL(res.qrChallengeUrl, { width: 288, margin: 2 });
      log('Código QR listo: escanéalo con la app móvil de Steam');
      pushState();
    })
    .catch((e: Error & { eresult?: number }) => onLoginSessionError(session, e));
}

async function startCredsLogin(accountName: string, password: string) {
  cancelLoginSessions();
  if (user && steamConnected) {
    log('Ya hay una sesión conectada');
    return;
  }

  loggingIn = true;
  loginPhase = 'connecting';
  lastError = null;

  const session = makeLoginSession();
  credsSession = session;
  pushState();

  try {
    const res = await session.startWithCredentials({ accountName, password });
    if (credsSession !== session) return; // cancelled in the meantime

    if (!res.actionRequired) {
      log('Credenciales aceptadas; esperando confirmación de Steam…');
      pushState();
      return;
    }

    const hasCode = res.validActions.some(
      (a) => a.type === EAuthSessionGuardType.EmailCode || a.type === EAuthSessionGuardType.DeviceCode,
    );
    const hasConfirmation = res.validActions.some(
      (a) => a.type === EAuthSessionGuardType.DeviceConfirmation || a.type === EAuthSessionGuardType.EmailConfirmation,
    );
    const email = res.validActions.find((a) => a.type === EAuthSessionGuardType.EmailCode)?.detail ?? null;

    loggingIn = false;
    if (hasCode) {
      ssGuard = { domain: email, lastCodeWrong: false };
      loginPhase = 'awaiting_guard';
      log(
        email
          ? `Steam Guard: se necesita código del email (…${email})`
          : 'Steam Guard: se necesita código de la app móvil',
      );
    } else if (hasConfirmation) {
      loginPhase = 'awaiting_approval';
      log('Aprueba el inicio de sesión en tu app móvil de Steam');
    } else {
      loginPhase = 'idle';
      lastError = { message: 'Steam pidió un método de verificación no soportado' };
      log('Método de verificación no soportado');
    }
    pushState();
  } catch (e) {
    onLoginSessionError(session, e as Error & { eresult?: number });
  }
}

function submitSsCode(code: string): boolean {
  if (!credsSession || !ssGuard) return false;
  const session = credsSession;
  loggingIn = true;
  loginPhase = 'connecting';
  pushState();
  session
    .submitSteamGuardCode(code)
    .then(() => {
      if (credsSession !== session) return;
      ssGuard = null;
      log('Código aceptado; esperando confirmación de Steam…');
      pushState();
    })
    .catch((e: Error & { eresult?: number }) => {
      if (credsSession !== session) return;
      loggingIn = false;
      ssGuard = { domain: ssGuard ? ssGuard.domain : null, lastCodeWrong: true };
      loginPhase = 'awaiting_guard';
      lastError = { message: e.message ?? String(e), eresult: e.eresult };
      log(`Código rechazado: ${lastError.message}`);
      pushState();
    });
  return true;
}

// ---------------------------------------------------------------- IPC commands

function handleCommand(msg: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
  const id = msg?.id;
  const params = msg?.params ?? {};
  try {
    switch (msg?.method) {
      case 'getState':
        res(id, buildState());
        break;

      case 'setConfig': {
        const next = sanitizeConfig({ ...cfg, ...params } as Record<string, unknown>);
        const scheduleChanged =
          next.onlineFrom !== cfg.onlineFrom ||
          next.onlineUntil !== cfg.onlineUntil ||
          JSON.stringify(next.days) !== JSON.stringify(cfg.days) ||
          next.paused !== cfg.paused;
        cfg = next;
        saveConfig();
        if (scheduleChanged) applyPersona();
        emit('configChanged', cfg);
        pushState();
        res(id, cfg);
        break;
      }

      case 'forceState': {
        const persona: Persona = params.state === 'online' ? 'online' : 'invisible';
        const minutes = Math.min(720, Math.max(1, Number(params.minutes) || 30));
        force = { persona, until: Date.now() + minutes * 60_000 };
        log(`Forzado temporal: ${persona === 'online' ? 'Conectado' : 'Invisible'} durante ${minutes} min`);
        applyPersona(true);
        pushState();
        res(id, buildState());
        break;
      }

      case 'clearForce':
        force = null;
        log('Forzado temporal cancelado');
        applyPersona();
        pushState();
        res(id, buildState());
        break;

      case 'pause':
        cfg.paused = true;
        saveConfig();
        log('Automatización pausada');
        applyPersona();
        emit('configChanged', cfg);
        pushState();
        res(id, cfg);
        break;

      case 'resume':
        cfg.paused = false;
        saveConfig();
        log('Automatización reanudada');
        applyPersona();
        emit('configChanged', cfg);
        pushState();
        res(id, cfg);
        break;

      case 'login':
        doLogin(params);
        res(id, { started: true });
        break;

      case 'logout':
        doLogout();
        res(id, buildState());
        break;

      case 'reconnect':
        start();
        res(id, { started: true });
        break;

      case 'startQrLogin':
        startQrLogin();
        res(id, { started: true });
        break;

      case 'cancelLogin':
      case 'cancelQrLogin': {
        const hadSession = !!(qrSession || credsSession);
        cancelLoginSessions();
        if (hadSession || loginPhase !== 'idle') {
          loggingIn = false;
          lastError = null;
          loginPhase = 'idle';
          log('Intento de inicio de sesión cancelado');
          pushState();
        }
        res(id, {});
        break;
      }

      case 'getLogTail':
        res(id, { lines: readTail(Math.min(1000, Number(params.lines) || 200)) });
        break;

      default:
        ipcError(id, `Método desconocido: ${msg?.method}`);
    }
  } catch (e) {
    ipcError(id, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------- startup

loadConfig();
loadAuth();
log(`Sidecar iniciado (datos en ${dataDir})`);
start();

setInterval(() => {
  if (force && Date.now() >= force.until) {
    log('Forzado temporal finalizado; vuelvo al horario');
    force = null;
  }
  applyPersona();
  pushState();
}, 30_000);

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  try {
    handleCommand(JSON.parse(t));
  } catch {
    log('IPC: línea inválida ignorada');
  }
});

let shuttingDown = false;
function shutdown(reason: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Cerrando (${reason})`);
  cancelLoginSessions();
  try {
    user?.logOff();
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(0), 150);
}

rl.on('close', () => shutdown('stdin cerrado'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
