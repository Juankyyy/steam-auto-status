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
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
const profilePath = path.join(dataDir, 'profile.json');
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

// ---------------------------------------------------------------- token renewal (scheduled)

// steam-user can renew the refresh token right after every logon (`renewRefreshTokens`), but
// that put a token/web request inside every (re)connection — and Steam denied every attempt
// made in quick succession anyway. Renewal is handled here instead, decoupled from the logon:
// a background check (never while a logon is in progress) that prefers moments when the
// official Steam client is closed, so nothing in it can be disturbed by the request.

const TOKEN_RENEW_AFTER_MS = 45 * 86_400_000; // renew refresh tokens older than 45 days
const TOKEN_RENEW_BEFORE_EXPIRY_MS = 60 * 86_400_000; // or expiring within 60 days
const RENEWAL_RECHECK_MS = 6 * 3_600_000; // space out failed/deferred renewal attempts
const RENEWAL_DEFER_MAX_MS = 7 * 86_400_000; // don't wait for Steam to close forever

let lastRenewalTry = 0;
let renewalRunning = false;
let renewalDeferredSince: number | null = null;

/** Does the saved refresh token look old enough (or close enough to expiry) to renew? */
function tokenNeedsRenewal(token: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { iat?: number; exp?: number };
    if (!payload.iat || !payload.exp) return false;
    const now = Date.now();
    return (
      now - payload.iat * 1000 > TOKEN_RENEW_AFTER_MS ||
      payload.exp * 1000 - now < TOKEN_RENEW_BEFORE_EXPIRY_MS
    );
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Is the official Steam client running on this machine? (renewal is deferred until it isn't) */
function steamClientRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq steam.exe', '/NH'],
      { windowsHide: true, timeout: 5_000 },
      (err, stdout) => resolve(!err && /steam\.exe/i.test(stdout)),
    );
  });
}

/** Renews the saved refresh token when it is old enough (or close to expiry). */
async function renewTokenIfNeeded(): Promise<void> {
  if (renewalRunning || loggingIn || !auth?.refreshToken) return;
  const current = auth.refreshToken;
  if (!tokenNeedsRenewal(current)) return;
  const now = Date.now();
  if (now - lastRenewalTry < RENEWAL_RECHECK_MS) return;
  if (await steamClientRunning()) {
    if (!renewalDeferredSince) renewalDeferredSince = now;
    if (now - renewalDeferredSince < RENEWAL_DEFER_MAX_MS) {
      lastRenewalTry = now;
      log('Renovación de token aplazada: el cliente de Steam está abierto');
      return;
    }
    log('Renovación de token aplazada demasiado tiempo; se intenta con Steam abierto');
  }
  renewalRunning = true;
  lastRenewalTry = now;
  try {
    const session = new LoginSession(EAuthTokenPlatformType.SteamClient, {
      machineId: true,
      machineFriendlyName: cfg.machineName,
    });
    // Failures surface through the promise; the listener just avoids an unhandled 'error'.
    session.on('error', () => {});
    session.refreshToken = current;
    const renewed = await withTimeout(session.renewRefreshToken(), 30_000);
    if (!auth || auth.refreshToken !== current) {
      log('Renovación completada tras un cierre de sesión; se descarta');
      return;
    }
    if (renewed) {
      saveAuth({ refreshToken: session.refreshToken, steamID: auth.steamID });
      renewalDeferredSince = null;
      log('Token de sesión renovado (programado)');
    } else {
      log('Steam no emitió un token nuevo; se reintentará más adelante');
    }
    pushState();
  } catch (e) {
    log(`No se pudo renovar el token: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    renewalRunning = false;
  }
}

// ---------------------------------------------------------------- profile (avatar cache)

interface ProfileFile {
  steamID: string;
  avatarUrl: string | null;
}

let profileCache: ProfileFile | null = null;
let avatarSteamID: string | null = null; // account the current avatarUrl belongs to
let avatarUrl: string | null = null;
let avatarResolving: string | null = null; // steamID whose avatar is being resolved right now

function loadProfile() {
  try {
    const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as ProfileFile;
    profileCache = raw && typeof raw.steamID === 'string' ? raw : null;
  } catch {
    profileCache = null;
  }
}

function saveProfile(p: ProfileFile) {
  profileCache = p;
  try {
    fs.writeFileSync(profilePath, JSON.stringify(p, null, 2));
  } catch (e) {
    log(`No se pudo guardar profile.json: ${e}`);
  }
}

/**
 * Publishes the avatar for this account (the cached one first, so it shows instantly)
 * and refreshes it from Steam in the background. Called on every logon, so a changed
 * avatar is picked up without clearing the cache by hand.
 */
function applyAvatar(steamID: string) {
  if (avatarSteamID !== steamID) {
    avatarSteamID = steamID;
    avatarUrl = profileCache?.steamID === steamID ? profileCache.avatarUrl : null;
    pushState();
  }
  void fetchAvatar(steamID);
}

async function fetchAvatar(steamID: string) {
  if (avatarResolving === steamID) return;
  avatarResolving = steamID;
  try {
    const url = (await profileXmlAvatar(steamID)) ?? (await ownPersonaAvatar(steamID));
    if (!url) return;
    saveProfile({ steamID, avatarUrl: url });
    if (avatarSteamID === steamID && url !== avatarUrl) {
      avatarUrl = url;
      log('Avatar de la cuenta actualizado');
      pushState();
    }
  } finally {
    avatarResolving = null;
  }
}

/** Public profile XML: no API key or extra library needed; returns the current CDN URL. */
async function profileXmlAvatar(steamID: string): Promise<string | null> {
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamID}?xml=1`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = await res.text();
    const m = body.match(/<avatarMedium>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/avatarMedium>/);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

/** Fallback: persona data from the Steam connection itself (no HTTP; may be empty for own account). */
function ownPersonaAvatar(steamID: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!user) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), 5_000);
    user.getPersonas([steamID], (err: Error | null, personas: Record<string, { avatar_url_medium?: string }>) => {
      clearTimeout(timer);
      resolve(err ? null : (personas?.[steamID]?.avatar_url_medium ?? null));
    });
  });
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

// Timers and bookkeeping for connection recovery (see start() and armWatchdog()).
let logonWatchdog: NodeJS.Timeout | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let lastStartAt = 0;
let failedLogonAttempts = 0;

const LOGON_WATCHDOG_MS = 45_000; // no logon response within this time → restart the attempt
const RECONNECT_WATCHDOG_MS = 180_000; // auto-relogin stuck for this long → restart the attempt
const START_DEBOUNCE_MS = 15_000; // minimum gap between token logon attempts
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 300_000;
const RATE_LIMIT_RETRY_MS = 600_000; // Steam asked us to slow down

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
  const steamID: string | null = user?.steamID ? user.steamID.toString() : null;

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
    account: steamID
      ? { steamID, name: user?.accountInfo?.name ?? null, avatarUrl: avatarSteamID === steamID ? avatarUrl : null }
      : null,
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
  // `renewRefreshTokens` stays off on purpose: it made every (re)logon ask Steam for a new
  // token (and Steam denied all of those rapid attempts anyway). Renewal now runs on its own
  // schedule (renewTokenIfNeeded) so a logon stays a clean, minimal logon.
  const u = new SteamUser({ autoRelogin: true, renewRefreshTokens: false, dataDirectory: steamDataDir });

  // steam-user bootstraps a steamcommunity web session after every logon; this app never
  // uses web cookies, so skipping it keeps another token request out of each (re)logon.
  u.webLogOn = () => {};

  u.on('debug', (msg: unknown) => {
    if (typeof msg !== 'string') return;
    // Keep only the lines that help diagnose connection issues (logon responses, reconnects,
    // renewals…); the rest of the debug chatter would flood the log. Never log token data.
    if (!/logon|reconnect|disconnect|renew|connection/i.test(msg)) return;
    if (/refresh_token|access_token|eyJ/i.test(msg)) return;
    log(`debug: ${msg.slice(0, 200)}`);
  });

  u.on('loggedOn', () => {
    if (user !== u) return;
    clearLogonWatchdog();
    failedLogonAttempts = 0;
    steamConnected = true;
    loggingIn = false;
    loginPhase = 'idle';
    qrDataUrl = null;
    guard = null;
    lastError = null;
    log(`Conectado a Steam como ${u.steamID ?? '?'}`);
    applyPersona(true);
    if (u.steamID) applyAvatar(u.steamID.toString());
    pushState();
  });

  u.on('accountInfo', (name: string) => {
    if (user !== u) return;
    if (name) log(`Cuenta: ${name}`);
    pushState();
  });

  u.on('refreshToken', (token: string) => {
    if (user !== u) return;
    const steamID = u.steamID ? u.steamID.toString() : auth?.steamID;
    saveAuth({ refreshToken: token, steamID });
    log('Token de sesión guardado/actualizado');
    pushState();
  });

  u.on('steamGuard', (domain: string | null, callback: (code: string) => void, lastCodeWrong: boolean) => {
    if (user !== u) return;
    clearLogonWatchdog();
    loggingIn = false;
    loginPhase = 'awaiting_guard';
    guard = { domain: domain ?? null, callback, wrong: !!lastCodeWrong };
    log(domain ? `Steam Guard: se necesita código del email (…${domain})` : 'Steam Guard: se necesita código de la app móvil');
    pushState();
    emit('authRequired', { kind: 'guard', domain: domain ?? null, lastCodeWrong: !!lastCodeWrong });
  });

  u.on('error', (e: Error & { eresult?: number }) => {
    if (user !== u) return;
    clearLogonWatchdog();
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
    if (needLogin) {
      emit('authRequired', { kind: 'login', reason: lastError.message });
      return;
    }
    // Transient failure (network, throttling…): retry with backoff instead of staying down.
    failedLogonAttempts++;
    scheduleRetry(e.eresult === SteamUser.EResult.RateLimitExceeded ? RATE_LIMIT_RETRY_MS : undefined);
  });

  u.on('disconnected', (eresult: number, msg?: string) => {
    if (user !== u) return;
    steamConnected = false;
    log(`Desconectado de Steam (${eresultName(eresult)}${msg ? `: ${msg}` : ''})`);
    pushState();
    // steam-user's autoRelogin retries by itself; the watchdog is only a backstop for the
    // case where that recovery gets stuck (observed in the wild as a silent "Conectando…").
    if (!loggingIn) armWatchdog(u, 'reconexión automática', RECONNECT_WATCHDOG_MS);
  });

  return u;
}

/** Clears the pending logon/reconnect watchdog timer, if any. */
function clearLogonWatchdog() {
  if (logonWatchdog) {
    clearTimeout(logonWatchdog);
    logonWatchdog = null;
  }
}

/**
 * Watches a client that should come up but may never report back (Steam sometimes never
 * answers the logon message; steam-user then retries silently and the app shows
 * "Conectando…" forever). If `u` is still the current client and never connects within
 * `ms`, it is torn down and a fresh attempt is scheduled.
 */
function armWatchdog(u: SteamUser, why: string, ms: number) {
  clearLogonWatchdog();
  logonWatchdog = setTimeout(() => {
    logonWatchdog = null;
    if (user !== u || steamConnected) return;
    log(`Steam no respondió (${why}); reinicio la conexión`);
    loggingIn = false;
    loginPhase = 'idle';
    lastError = { message: 'Tiempo de espera agotado al conectar con Steam' };
    try {
      u.logOff();
    } catch {
      /* ignore */
    }
    if (user === u) user = null;
    pushState();
    failedLogonAttempts++;
    scheduleRetry();
  }, ms);
}

/** Schedules a new logon attempt with exponential backoff (cap ~5 min). */
function scheduleRetry(overrideMs?: number) {
  if (retryTimer || steamConnected) return;
  const delay = overrideMs ?? Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(failedLogonAttempts, 6));
  log(`Reintento de conexión en ${Math.round(delay / 1000)} s`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    start(true);
  }, delay);
}

/**
 * Random 32-bit logonID. Sessions with different logonIDs don't kick each other, while
 * steam-user's default (0) is shared by every session — with it, two app instances would
 * expel one another and each expulsion would trigger another logon.
 */
function randomLogonID(): number {
  const v = randomBytes(4).readUInt32BE(0);
  return v === 0 ? 1 : v;
}

/** Starts/retries the connection with the saved token (or requests login). */
function start(force = false) {
  if (steamConnected) {
    log('Ya hay una sesión conectada');
    pushState();
    return;
  }
  if (!force && (loggingIn || Date.now() - lastStartAt < START_DEBOUNCE_MS)) {
    log('Se ignora el intento: ya hay un inicio de sesión en curso o el último fue hace un momento');
    pushState();
    return;
  }
  cancelLoginSessions();
  if (!auth?.refreshToken) {
    emit('authRequired', { kind: 'login' });
    pushState();
    return;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (user) {
    try {
      user.logOff();
    } catch {
      /* ignore */
    }
  }
  lastStartAt = Date.now();
  loggingIn = true;
  loginPhase = 'connecting';
  lastError = null;
  user = newClient();
  log('Iniciando sesión con token guardado…');
  user.logOn({ refreshToken: auth.refreshToken, machineName: cfg.machineName, logonID: randomLogonID() });
  armWatchdog(user, 'inicio de sesión', LOGON_WATCHDOG_MS);
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
  clearLogonWatchdog();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  failedLogonAttempts = 0;
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
  start(true);
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
      if (!res.qrChallengeUrl) {
        onLoginSessionError(session, new Error('Steam no devolvió la URL del código QR'));
        return;
      }
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

    const validActions = res.validActions ?? [];
    const hasCode = validActions.some(
      (a) => a.type === EAuthSessionGuardType.EmailCode || a.type === EAuthSessionGuardType.DeviceCode,
    );
    const hasConfirmation = validActions.some(
      (a) => a.type === EAuthSessionGuardType.DeviceConfirmation || a.type === EAuthSessionGuardType.EmailConfirmation,
    );
    const email = validActions.find((a) => a.type === EAuthSessionGuardType.EmailCode)?.detail ?? null;

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

      case 'clearLog':
        try {
          fs.writeFileSync(logPath, '');
        } catch {
          /* ignore */
        }
        emit('logsCleared', {});
        log('Registro vaciado por el usuario');
        res(id, {});
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
loadProfile();
log(`Sidecar iniciado (datos en ${dataDir})`);
start();

setInterval(() => {
  if (force && Date.now() >= force.until) {
    log('Forzado temporal finalizado; vuelvo al horario');
    force = null;
  }
  applyPersona();
  pushState();
  void renewTokenIfNeeded();
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
  clearLogonWatchdog();
  if (retryTimer) clearTimeout(retryTimer);
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
