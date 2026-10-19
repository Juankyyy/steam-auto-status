//! Rust core: schedule, configuration, logs, local Steam client control and the
//! `sidecar-message` events the panel already listens to.
//!
//! This is a direct port of the old Node sidecar (`sidecar/src/index.ts`): same commands,
//! same event shapes, same state fields, same behavior. The name of the event channel is
//! kept for compatibility with the UI; there is no sidecar process anymore.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use chrono::{DateTime, Local, LocalResult, TimeZone, Timelike};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::config::{self, Config};
use crate::logging::Logger;
use crate::schedule;
use crate::steam::{self, Persona};

/// Set when the user quits; the timer threads stop and the app is allowed to exit.
static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn request_quit() {
    QUITTING.store(true, Ordering::SeqCst);
}

pub fn is_quitting() -> bool {
    QUITTING.load(Ordering::SeqCst)
}

/// Event channel preserved from the sidecar era (the UI already listens to it).
const MESSAGE_EVENT: &str = "sidecar-message";

/// How often the core checks whether `steam.exe` started or stopped.
const PROCESS_POLL: Duration = Duration::from_secs(10);
/// How often the core re-evaluates the schedule (keeps `nowMs`/countdown fresh too).
const TICK: Duration = Duration::from_secs(30);

fn now_ms() -> i64 {
    Local::now().timestamp_millis()
}

fn local_dt(timestamp_ms: i64) -> DateTime<Local> {
    match Local.timestamp_millis_opt(timestamp_ms) {
        LocalResult::Single(datetime) => datetime,
        LocalResult::Ambiguous(first, _) => first,
        LocalResult::None => Local::now(),
    }
}

#[derive(Clone, Copy)]
struct Force {
    persona: Persona,
    until: i64,
}

struct Inner {
    config: Config,
    steam_running: bool,
    steam_starting: bool,
    applied_persona: Option<Persona>,
    last_applied_at: Option<i64>,
    last_apply_error: Option<String>,
    force: Option<Force>,
    /// Last desired state we warned about while Steam was closed (avoids log/notify spam).
    last_missing_persona: Option<Persona>,
    steam_start_attempt: u32,
    /// Bumped to cancel a scheduled Steam-start retry (equivalent of `clearTimeout`).
    steam_start_generation: u64,
}

impl Inner {
    fn new(config: Config) -> Self {
        Self {
            config,
            steam_running: false,
            steam_starting: false,
            applied_persona: None,
            last_applied_at: None,
            last_apply_error: None,
            force: None,
            last_missing_persona: None,
            steam_start_attempt: 0,
            steam_start_generation: 0,
        }
    }
}

pub struct Core {
    app: AppHandle,
    data_dir: PathBuf,
    logger: Logger,
    inner: Mutex<Inner>,
}

impl Core {
    pub fn new(app: AppHandle, data_dir: PathBuf) -> Arc<Self> {
        let logger = Logger::new(&data_dir);
        let (config, warnings) = config::load(&data_dir);
        let core = Arc::new(Self {
            app,
            data_dir: data_dir.clone(),
            logger,
            inner: Mutex::new(Inner::new(config)),
        });
        for warning in warnings {
            core.log(&warning);
        }
        core
    }

    /// Starts the initial detection/apply and the background timers.
    pub fn start(self: &Arc<Self>) {
        self.log(&format!(
            "Core started (data in {})",
            self.data_dir.display()
        ));

        let running = steam::is_running();
        {
            let mut inner = self.lock();
            inner.steam_running = running;
        }
        self.log(if running {
            "Steam client is running"
        } else {
            "Steam client is not running"
        });
        // apply_persona also warns once (and notifies, if enabled) when Steam is closed.
        self.apply_persona(true, false);
        {
            let inner = self.lock();
            self.push_state(&inner);
        }

        let process_core = Arc::clone(self);
        thread::spawn(move || {
            while !is_quitting() {
                thread::sleep(PROCESS_POLL);
                if is_quitting() {
                    break;
                }
                process_core.refresh_steam_state();
            }
        });

        let tick_core = Arc::clone(self);
        thread::spawn(move || {
            while !is_quitting() {
                thread::sleep(TICK);
                if is_quitting() {
                    break;
                }
                tick_core.tick();
            }
        });
    }

    // ---------------------------------------------------------------- events

    fn emit(&self, value: Value) {
        let _ = self.app.emit(MESSAGE_EVENT, value);
    }

    fn emit_event(&self, event: &str, data: Value) {
        self.emit(json!({ "type": "event", "event": event, "data": data }));
    }

    fn respond(&self, result: Result<Value, String>) {
        match result {
            Ok(result) => self.emit(json!({ "type": "res", "result": result })),
            Err(error) => self.emit(json!({ "type": "res", "error": error })),
        }
    }

    /// Writes a diagnostic line (English) to the log file and mirrors it to the panel.
    pub fn log(&self, message: &str) {
        let line = self.logger.line(message);
        self.emit_event("log", json!({ "line": line }));
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    // ---------------------------------------------------------------- state

    /// Current state for `get_cached_state` (the panel also receives it through events).
    pub fn snapshot(&self) -> Value {
        let inner = self.lock();
        self.build_state(&inner)
    }

    fn push_state(&self, inner: &Inner) {
        let state = self.build_state(inner);
        self.emit_event("state", state);
    }

    fn build_state(&self, inner: &Inner) -> Value {
        let now = Local::now();
        let now_ms = now.timestamp_millis();
        let next = schedule::next_transition(now, &inner.config);
        let desired = desired_persona(inner, now);
        let persona = inner.applied_persona;
        let language = inner.config.language.as_str();

        // The tray tooltip is composed here; the panel builds its own labels from the
        // machine-readable fields, so the state carries no pre-rendered text the UI
        // could drift from.
        let mut tooltip = String::from("Steam Auto Status");
        if !inner.steam_running {
            tooltip.push_str(" — ");
            tooltip.push_str(ui(language, "steamNotRunning"));
        } else if inner.steam_starting {
            tooltip.push_str(" — ");
            tooltip.push_str(ui(language, "steamStarting"));
        } else {
            let shown = persona.unwrap_or(desired);
            let next_label = match next {
                Some((at, to)) => next_label(language, to, at),
                None => ui(language, "noSchedule").to_string(),
            };
            tooltip.push_str(&format!(
                " — {} ({})",
                ui(language, persona_key(shown)),
                next_label
            ));
        }
        if inner.config.paused {
            tooltip.push_str(" — ");
            tooltip.push_str(ui(language, "paused"));
        }

        let forced = inner
            .force
            .filter(|force| now_ms < force.until)
            .map(|force| json!({ "persona": force.persona, "until": force.until }));

        json!({
            "steamRunning": inner.steam_running,
            "steamStarting": inner.steam_starting,
            "persona": persona,
            "desired": desired,
            "inWindow": schedule::in_window_at(now, &inner.config),
            "paused": inner.config.paused,
            "forced": forced,
            "lastAppliedAt": inner.last_applied_at,
            "lastApplyError": inner.last_apply_error,
            "legacyDataPresent": self.legacy_present(),
            "nextTransition": next.map(|(at, to)| json!({ "at": at, "to": to })),
            "config": &inner.config,
            "tooltip": tooltip,
            "nowMs": now_ms,
            "dataDir": self.data_dir.to_string_lossy(),
        })
    }

    fn legacy_present(&self) -> bool {
        self.data_dir.join("auth.json").exists()
            || self.data_dir.join("profile.json").exists()
            || self.data_dir.join("steam-data").exists()
    }

    // ---------------------------------------------------------------- applying presence

    /// Sends the desired presence to the official client.
    ///
    /// `force_apply` repeats the command even when it matches the last one sent (startup,
    /// resume, manual reapply); `ignore_pause` lets an explicit user action run while the
    /// automatic schedule is paused.
    fn apply_persona_locked(&self, inner: &mut Inner, force_apply: bool, ignore_pause: bool) {
        let active_force = inner.force.filter(|force| now_ms() < force.until);
        if inner.config.paused && active_force.is_none() && !ignore_pause {
            return;
        }

        let wanted = active_force
            .map(|force| force.persona)
            .unwrap_or_else(|| desired_persona(inner, Local::now()));
        if !force_apply && inner.applied_persona == Some(wanted) {
            return;
        }

        // Re-check right before sending: ShellExecuteW would launch Steam if the client
        // closed between the periodic poll and this call.
        if !steam::is_running() {
            if inner.steam_running {
                self.log("Steam client closed");
            }
            inner.steam_running = false;
            inner.steam_starting = false;
            inner.applied_persona = None;
            inner.last_applied_at = None;
            inner.last_apply_error = None;
            if inner.last_missing_persona != Some(wanted) {
                inner.last_missing_persona = Some(wanted);
                self.log(&format!(
                    "Steam client is not running; cannot apply {}",
                    wanted.label().to_lowercase()
                ));
                if inner.config.notifications {
                    self.emit_event(
                        "notify",
                        json!({
                            "title": "Steam Auto Status",
                            "body": ui(&inner.config.language, "steamMissingBody"),
                        }),
                    );
                }
            }
            self.push_state(inner);
            return;
        }

        // Pause, resume, force or a schedule edit may have landed while the process check
        // was running. Re-evaluate before sending so a stale state does not win.
        let latest_force = inner.force.filter(|force| now_ms() < force.until);
        if inner.config.paused && latest_force.is_none() && !ignore_pause {
            self.push_state(inner);
            return;
        }
        let latest_wanted = latest_force
            .map(|force| force.persona)
            .unwrap_or_else(|| desired_persona(inner, Local::now()));
        if latest_wanted != wanted {
            self.apply_persona_locked(inner, force_apply, ignore_pause);
            return;
        }

        if !inner.steam_running {
            inner.steam_running = true;
            self.log("Steam client is running");
        }
        let previous = inner.applied_persona;
        match steam::send_persona(wanted) {
            Ok(()) => {
                inner.applied_persona = Some(wanted);
                inner.last_applied_at = Some(now_ms());
                inner.last_apply_error = None;
                inner.last_missing_persona = None;
                self.log(&format!(
                    "Presence → {} (local Steam client)",
                    wanted.label()
                ));
                if inner.config.notifications && previous.is_some() && previous != Some(wanted) {
                    let key = if wanted == Persona::Online {
                        "nowOnline"
                    } else {
                        "nowInvisible"
                    };
                    self.emit_event(
                        "notify",
                        json!({
                            "title": "Steam Auto Status",
                            "body": ui(&inner.config.language, key),
                        }),
                    );
                }
                self.push_state(inner);
            }
            Err(error) => {
                inner.last_apply_error = Some(error.clone());
                self.log(&format!("Could not send the presence command: {error}"));
                self.push_state(inner);
            }
        }
    }

    fn apply_persona(&self, force_apply: bool, ignore_pause: bool) {
        let mut inner = self.lock();
        self.apply_persona_locked(&mut inner, force_apply, ignore_pause);
    }

    // ---------------------------------------------------------------- timers

    /// Detects `steam.exe` starting/stopping and reacts to the transition.
    fn refresh_steam_state(self: &Arc<Self>) {
        let running = steam::is_running();
        let mut inner = self.lock();
        if running == inner.steam_running {
            return;
        }
        inner.steam_running = running;

        if running {
            inner.steam_starting = true;
            inner.steam_start_attempt = 0;
            inner.last_missing_persona = None;
            inner.last_apply_error = None;
            self.log("Steam client started");
            self.push_state(&inner);
            drop(inner);
            self.schedule_steam_start_attempt(Duration::from_secs(10));
        } else {
            inner.steam_starting = false;
            inner.steam_start_attempt = 0;
            // Cancel any pending Steam-start retry.
            inner.steam_start_generation += 1;
            inner.applied_persona = None;
            inner.last_applied_at = None;
            inner.last_apply_error = None;
            inner.last_missing_persona = None;
            self.log("Steam client closed");
            self.push_state(&inner);
        }
    }

    fn schedule_steam_start_attempt(self: &Arc<Self>, delay: Duration) {
        let generation = {
            let mut inner = self.lock();
            inner.steam_start_generation += 1;
            inner.steam_start_generation
        };
        let core = Arc::clone(self);
        thread::spawn(move || {
            thread::sleep(delay);
            if is_quitting() || core.lock().steam_start_generation != generation {
                return;
            }
            core.attempt_steam_start();
        });
    }

    /// Steam may still be logging in when its process appears. Try a few times, spaced
    /// out, so an auto-login that takes a few seconds does not leave the status unsent.
    fn attempt_steam_start(self: &Arc<Self>) {
        let mut inner = self.lock();
        if !inner.steam_running {
            inner.steam_starting = false;
            self.push_state(&inner);
            return;
        }

        inner.steam_start_attempt += 1;
        self.apply_persona_locked(&mut inner, true, false);
        // The first attempt is enough for the UI: the retries below stay in the background
        // so the panel does not say "starting" for a minute and a half after Steam is usable.
        if inner.steam_starting {
            inner.steam_starting = false;
            self.push_state(&inner);
        }

        let attempt = inner.steam_start_attempt;
        let running = inner.steam_running;
        drop(inner);
        if running && attempt < 3 {
            let delay = if attempt == 1 {
                Duration::from_secs(30)
            } else {
                Duration::from_secs(50)
            };
            self.schedule_steam_start_attempt(delay);
        }
    }

    fn tick(&self) {
        let mut inner = self.lock();
        if let Some(force) = inner.force {
            if now_ms() >= force.until {
                self.log("Temporary override finished; back to the schedule");
                inner.force = None;
            }
        }
        if inner.steam_running {
            self.apply_persona_locked(&mut inner, false, false);
        }
        self.push_state(&inner);
    }

    // ---------------------------------------------------------------- commands

    /// Handles one UI command; replies with a `res` event exactly like the sidecar did.
    pub fn handle_command(&self, method: &str, params: Value) {
        match method {
            "getState" => self.respond(Ok(self.snapshot())),
            "getConfig" => {
                let config = self.lock().config.clone();
                self.respond(Ok(to_value(&config)));
            }
            "setConfig" => self.cmd_set_config(params),
            "forceState" => self.cmd_force_state(params),
            "clearForce" => self.cmd_clear_force(),
            "pause" => self.cmd_pause(),
            "resume" => self.cmd_resume(),
            "reapply" => self.cmd_reapply(),
            "deleteLegacyData" => self.cmd_delete_legacy_data(),
            "getLogTail" => self.cmd_get_log_tail(params),
            "clearLog" => self.cmd_clear_log(),
            other => self.respond(Err(format!("Unknown method: {other}"))),
        }
    }

    fn cmd_set_config(&self, params: Value) {
        let mut inner = self.lock();
        let was_paused = inner.config.paused;
        let next = config::merge(&inner.config, &params);
        let schedule_changed = next.online_from != inner.config.online_from
            || next.online_until != inner.config.online_until
            || next.days != inner.config.days
            || next.paused != was_paused;
        let pausing = next.paused && !was_paused;
        let resuming = !next.paused && was_paused;
        inner.config = next;
        if pausing {
            inner.force = None;
        }
        if let Err(error) = config::save(&self.data_dir, &inner.config) {
            self.log(&format!("Could not save config.json: {error}"));
        }
        let config = inner.config.clone();
        if schedule_changed {
            self.apply_persona_locked(&mut inner, resuming, false);
        }
        self.emit_event("configChanged", to_value(&config));
        self.push_state(&inner);
        self.respond(Ok(to_value(&config)));
    }

    fn cmd_force_state(&self, params: Value) {
        let mut inner = self.lock();
        let persona = if params.get("state").and_then(Value::as_str) == Some("online") {
            Persona::Online
        } else {
            Persona::Invisible
        };
        let minutes = params
            .get("minutes")
            .and_then(Value::as_i64)
            .filter(|minutes| *minutes != 0)
            .unwrap_or(30)
            .clamp(1, 720);
        inner.force = Some(Force {
            persona,
            until: now_ms() + minutes * 60_000,
        });
        self.log(&format!(
            "Temporary override: {} for {minutes} min",
            persona.label()
        ));
        self.apply_persona_locked(&mut inner, true, false);
        self.push_state(&inner);
        let state = self.build_state(&inner);
        self.respond(Ok(state));
    }

    fn cmd_clear_force(&self) {
        let mut inner = self.lock();
        inner.force = None;
        self.log("Temporary override cancelled");
        self.apply_persona_locked(&mut inner, false, false);
        self.push_state(&inner);
        let state = self.build_state(&inner);
        self.respond(Ok(state));
    }

    fn cmd_pause(&self) {
        let mut inner = self.lock();
        inner.config.paused = true;
        inner.force = None;
        if let Err(error) = config::save(&self.data_dir, &inner.config) {
            self.log(&format!("Could not save config.json: {error}"));
        }
        self.log("Automation paused");
        self.emit_event("configChanged", to_value(&inner.config));
        self.push_state(&inner);
        self.respond(Ok(to_value(&inner.config)));
    }

    fn cmd_resume(&self) {
        let mut inner = self.lock();
        inner.config.paused = false;
        if let Err(error) = config::save(&self.data_dir, &inner.config) {
            self.log(&format!("Could not save config.json: {error}"));
        }
        self.log("Automation resumed");
        self.apply_persona_locked(&mut inner, true, false);
        self.emit_event("configChanged", to_value(&inner.config));
        self.push_state(&inner);
        self.respond(Ok(to_value(&inner.config)));
    }

    fn cmd_reapply(&self) {
        let mut inner = self.lock();
        self.log("Manual reapply requested");
        // Explicit user action: runs even while the automatic schedule is paused.
        self.apply_persona_locked(&mut inner, true, true);
        self.push_state(&inner);
        self.respond(Ok(json!({ "started": true })));
    }

    /// Removes only files from the old ghost-session version; config and logs stay.
    fn cmd_delete_legacy_data(&self) {
        let mut removed: Vec<String> = Vec::new();
        for name in ["auth.json", "profile.json"] {
            let path = self.data_dir.join(name);
            if path.exists() {
                match std::fs::remove_file(&path) {
                    Ok(()) => removed.push(name.to_string()),
                    Err(error) => self.log(&format!("Could not remove {name}: {error}")),
                }
            }
        }
        let steam_data = self.data_dir.join("steam-data");
        if steam_data.exists() {
            let result = if steam_data.is_dir() {
                std::fs::remove_dir_all(&steam_data)
            } else {
                std::fs::remove_file(&steam_data)
            };
            match result {
                Ok(()) => removed.push("steam-data".into()),
                Err(error) => self.log(&format!("Could not remove steam-data: {error}")),
            }
        }
        if !removed.is_empty() {
            self.log(&format!(
                "Removed legacy session files: {}",
                removed.join(", ")
            ));
        }
        let inner = self.lock();
        self.push_state(&inner);
        self.respond(Ok(json!({ "removed": removed })));
    }

    fn cmd_get_log_tail(&self, params: Value) {
        let lines = params
            .get("lines")
            .and_then(Value::as_i64)
            .unwrap_or(200)
            .clamp(1, 1000) as usize;
        self.respond(Ok(json!({ "lines": self.logger.tail(lines) })));
    }

    fn cmd_clear_log(&self) {
        self.logger.clear();
        self.emit_event("logsCleared", json!({}));
        self.log("Log cleared by the user");
        self.respond(Ok(json!({})));
    }
}

// ---------------------------------------------------------------- helpers

fn to_value<T: serde::Serialize>(value: &T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

fn desired_persona(inner: &Inner, now: DateTime<Local>) -> Persona {
    if let Some(force) = inner.force {
        if now.timestamp_millis() < force.until {
            return force.persona;
        }
    }
    if schedule::in_window_at(now, &inner.config) {
        Persona::Online
    } else {
        Persona::Invisible
    }
}

fn persona_key(persona: Persona) -> &'static str {
    match persona {
        Persona::Online => "online",
        Persona::Invisible => "invisible",
    }
}

/// User-facing string in the configured language (tray tooltip and notifications).
fn ui(language: &str, key: &str) -> &'static str {
    if language == "en" {
        match key {
            "online" => "Online",
            "invisible" => "Invisible",
            "noSchedule" => "No schedule",
            "nowOnline" => "You now appear as Online on Steam",
            "nowInvisible" => "You now appear as Invisible on Steam",
            "steamNotRunning" => "Steam is not running",
            "steamStarting" => "Steam is starting",
            "paused" => "Automation paused",
            "steamMissingBody" => "Could not change the status because Steam is not running.",
            _ => "",
        }
    } else {
        match key {
            "online" => "Conectado",
            "invisible" => "Invisible",
            "noSchedule" => "Sin programación",
            "nowOnline" => "Ahora apareces como Conectado en Steam",
            "nowInvisible" => "Ahora apareces como Invisible en Steam",
            "steamNotRunning" => "Steam no está abierto",
            "steamStarting" => "Steam está iniciando",
            "paused" => "Automatización en pausa",
            "steamMissingBody" => "No se pudo cambiar el estado porque Steam no está abierto.",
            _ => "",
        }
    }
}

/// "Conectado a las 17:30" / "Online at 5:30 PM".
fn next_label(language: &str, persona: Persona, timestamp_ms: i64) -> String {
    let time = hm_local(timestamp_ms, language);
    if language == "en" {
        match persona {
            Persona::Online => format!("Online at {time}"),
            Persona::Invisible => format!("Invisible at {time}"),
        }
    } else {
        match persona {
            Persona::Online => format!("Conectado a las {time}"),
            Persona::Invisible => format!("Invisible a las {time}"),
        }
    }
}

/// Clock time for the tooltip: 24h in Spanish, 12h in English.
fn hm_local(timestamp_ms: i64, language: &str) -> String {
    let datetime = local_dt(timestamp_ms);
    if language == "es" {
        format!("{}:{:02}", datetime.hour(), datetime.minute())
    } else {
        let hour = datetime.hour() % 12;
        let hour = if hour == 0 { 12 } else { hour };
        let period = if datetime.hour() < 12 { "AM" } else { "PM" };
        format!("{hour}:{:02} {period}", datetime.minute())
    }
}
