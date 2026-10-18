#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Steam Auto Status — desktop shell (Tauri v2)
//!
//! Responsibilities:
//! - System tray icon with context menu and dynamic tooltip.
//! - Panel window (WebView2), created on demand and destroyed on close
//!   to free resources (the app lives in the tray).
//! - Node sidecar supervision (startup, restart with backoff, stdio IPC).
//! - Plugins: single instance, autostart, notifications, opener, clipboard.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

static QUITTING: AtomicBool = AtomicBool::new(false);
static CMD_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// State shared between threads (sidecar reader, commands, tray).
#[derive(Default)]
struct Shared {
    state: Mutex<Option<Value>>,
    logs: Mutex<VecDeque<String>>,
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
}

/// Tray handles to update the visual state from the reader thread. The menu itself is
/// rebuilt whenever the UI language changes, so its handles live behind a mutex too.
struct TrayUi {
    menu: Mutex<TrayMenuHandles>,
    /// Last presence shown by the tray icon (`Some(true)` = online). The icon is only
    /// replaced when it changes: re-setting the same image on every tick is needless
    /// work and can make the tray icon flicker on Windows.
    online: Mutex<Option<bool>>,
    /// Language the current menu was built with (rebuilt only when it changes).
    language: Mutex<String>,
}

/// Menu items whose state is refreshed from sidecar events.
struct TrayMenuHandles {
    pause: CheckMenuItem<tauri::Wry>,
    autostart: CheckMenuItem<tauri::Wry>,
}

/// Tray menu labels per UI language. The tooltip comes from the sidecar (which knows the
/// next transition); the menu is composed here because it belongs to the shell.
struct TrayLabels {
    show: &'static str,
    online30: &'static str,
    invisible: &'static str,
    pause: &'static str,
    autostart: &'static str,
    quit: &'static str,
}

impl TrayLabels {
    fn for_language(lang: &str) -> Self {
        if lang == "en" {
            Self {
                show: "Open panel",
                online30: "Online for 30 min",
                invisible: "Invisible now",
                pause: "Pause automation",
                autostart: "Start with Windows",
                quit: "Exit",
            }
        } else {
            Self {
                show: "Abrir panel",
                online30: "Conectado 30 min",
                invisible: "Invisible ahora",
                pause: "Pausar automatización",
                autostart: "Iniciar con Windows",
                quit: "Salir",
            }
        }
    }
}

fn push_log(shared: &Shared, line: String) {
    let mut logs = shared.logs.lock().unwrap();
    logs.push_back(line);
    while logs.len() > 500 {
        logs.pop_front();
    }
}

fn data_dir(app: &AppHandle) -> std::path::PathBuf {
    let base = app
        .path()
        .document_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("steam-auto-status");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Reads the UI language from config.json (read-only peek) so the tray menu comes up in the
/// right language before the first state event; later changes arrive through sidecar state.
fn config_language(app: &AppHandle) -> String {
    std::fs::read_to_string(data_dir(app).join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.get("language").and_then(|l| l.as_str()).map(str::to_string))
        .unwrap_or_else(|| "es".to_string())
}

/// Removes the extended path prefix (`\\?\`, `\\?\UNC\`) that `canonicalize()` adds on
/// Windows and that Tauri applies when resolving the resource folder. Node can't resolve
/// that prefix when it arrives as `argv[1]` (it fails with `EISDIR`/`ENOENT`), so we strip
/// it before building the command line.
fn strip_extended_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        std::path::PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = s.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(rest)
    } else {
        path
    }
}

/// Program + arguments to launch the sidecar (dev: node + bundle; prod: bundled runtime).
fn sidecar_launch(app: &AppHandle) -> (std::path::PathBuf, Vec<String>) {
    let dir = data_dir(app);
    let dir_arg = dir.to_string_lossy().to_string();

    if cfg!(debug_assertions) {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from("."));
        let entry = root.join("sidecar").join("dist").join("sidecar.cjs");
        (
            std::path::PathBuf::from("node"),
            vec![
                entry.to_string_lossy().to_string(),
                "--data-dir".into(),
                dir_arg,
            ],
        )
    } else {
        // `resource_dir()` canonicalizes the exe: on Windows that produces `\\?\C:\...`,
        // which Node can't resolve as an argument. We normalize it.
        let res = strip_extended_prefix(
            app.path()
                .resource_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".")),
        );
        let node = res.join("runtime").join("node.exe");
        let entry = res.join("sidecar").join("sidecar.cjs");
        (
            node,
            vec![
                entry.to_string_lossy().to_string(),
                "--data-dir".into(),
                dir_arg,
            ],
        )
    }
}

fn spawn_sidecar(app: &AppHandle) -> std::io::Result<Child> {
    let (program, args) = sidecar_launch(app);
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
}

fn start_supervisor(app: AppHandle, shared: Arc<Shared>) {
    std::thread::spawn(move || {
        let mut backoff: u64 = 1000;
        while !QUITTING.load(Ordering::SeqCst) {
            match spawn_sidecar(&app) {
                Ok(mut child) => {
                    backoff = 1000;
                    let stdout = child.stdout.take();
                    let stderr = child.stderr.take();
                    *shared.stdin.lock().unwrap() = child.stdin.take();
                    *shared.child.lock().unwrap() = Some(child);
                    push_log(&shared, "Sidecar started".into());

                    if let Some(stderr) = stderr {
                        let app_err = app.clone();
                        let shared_err = shared.clone();
                        std::thread::spawn(move || {
                            // Persist the sidecar stderr to diagnose unexpected exits
                            let log_path = data_dir(&app_err).join("logs").join("sidecar-stderr.log");
                            if let Some(parent) = log_path.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }
                            let mut file = std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(&log_path)
                                .ok();
                            let reader = BufReader::new(stderr);
                            for line in reader.lines().map_while(Result::ok) {
                                if let Some(f) = file.as_mut() {
                                    let ts = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .map(|d| d.as_secs())
                                        .unwrap_or(0);
                                    let _ = writeln!(f, "[{ts}] {line}");
                                }
                                push_log(&shared_err, format!("sidecar(stderr): {line}"));
                                let _ = app_err.emit("sidecar-message", json!({
                                    "type": "event",
                                    "event": "log",
                                    "data": { "line": format!("[stderr] {line}") }
                                }));
                            }
                        });
                    }

                    if let Some(stdout) = stdout {
                        let reader = BufReader::new(stdout);
                        for line in reader.lines().map_while(Result::ok) {
                            handle_sidecar_line(&app, &shared, &line);
                        }
                    }

                    *shared.stdin.lock().unwrap() = None;
                    if let Some(mut c) = shared.child.lock().unwrap().take() {
                        let _ = c.wait();
                    }

                    if !QUITTING.load(Ordering::SeqCst) {
                        push_log(&shared, format!("Sidecar exited; retrying in {backoff} ms"));
                        std::thread::sleep(Duration::from_millis(backoff));
                        backoff = (backoff * 2).min(15_000);
                    }
                }
                Err(e) => {
                    push_log(&shared, format!("Could not start the sidecar ({e}); retrying in {backoff} ms"));
                    std::thread::sleep(Duration::from_millis(backoff));
                    backoff = (backoff * 2).min(15_000);
                }
            }
        }
    });
}

fn handle_sidecar_line(app: &AppHandle, shared: &Arc<Shared>, line: &str) {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        push_log(shared, format!("sidecar: non-JSON output: {line}"));
        return;
    };

    if value.get("type").and_then(|t| t.as_str()) == Some("event") {
        let event = value.get("event").and_then(|e| e.as_str()).unwrap_or("");
        let data = value.get("data").cloned().unwrap_or(Value::Null);
        match event {
            "state" => {
                *shared.state.lock().unwrap() = Some(data.clone());
                update_tray(app, &data);
            }
            "log" => {
                if let Some(l) = data.get("line").and_then(|l| l.as_str()) {
                    push_log(shared, l.to_string());
                }
            }
            "notify" => {
                let title = data
                    .get("title")
                    .and_then(|t| t.as_str())
                    .unwrap_or("Steam Auto Status")
                    .to_string();
                let body = data
                    .get("body")
                    .and_then(|b| b.as_str())
                    .unwrap_or("")
                    .to_string();
                let _ = app.notification().builder().title(title).body(body).show();
            }
            _ => {}
        }
    }

    let _ = app.emit("sidecar-message", value);
}

/// Tray icon for a presence. The state is carried by the top-right dot of the mark:
/// green when online, slate when invisible. The PNGs are the small-size variants of the
/// logo (sources: `assets/icon-tray-online.svg` / `assets/icon-tray-invisible.svg`).
fn tray_state_icon(online: bool) -> Option<Image<'static>> {
    let bytes: &'static [u8] = if online {
        include_bytes!("../icons/tray/online.png")
    } else {
        include_bytes!("../icons/tray/invisible.png")
    };
    Image::from_bytes(bytes).ok()
}

fn update_tray(app: &AppHandle, state: &Value) {
    if let Some(tray) = app.tray_by_id("main") {
        if let Some(tooltip) = state.get("tooltip").and_then(|t| t.as_str()) {
            let _ = tray.set_tooltip(Some(tooltip));
        }
        // Presence can be absent (no session yet): that reads as "not online".
        let online = state.get("persona").and_then(|p| p.as_str()) == Some("online");
        let changed = match app.try_state::<TrayUi>() {
            Some(ui) => {
                let mut last = ui.online.lock().unwrap();
                let changed = *last != Some(online);
                *last = Some(online);
                changed
            }
            None => true,
        };
        if changed {
            if let Some(icon) = tray_state_icon(online) {
                let _ = tray.set_icon(Some(icon));
            }
        }
    }

    let Some(ui) = app.try_state::<TrayUi>() else {
        return;
    };
    let paused = state.get("paused").and_then(|p| p.as_bool());
    let autostart = state
        .get("config")
        .and_then(|c| c.get("startWithWindows"))
        .and_then(|s| s.as_bool());
    let language = state
        .get("config")
        .and_then(|c| c.get("language"))
        .and_then(|l| l.as_str())
        .unwrap_or("es");

    // A language change rebuilds the whole menu (labels are baked into the items), keeping
    // the current check states.
    let language_changed = {
        let mut current = ui.language.lock().unwrap();
        if current.as_str() == language {
            false
        } else {
            *current = language.to_string();
            true
        }
    };
    if language_changed {
        if let Ok((menu, handles)) = build_tray_menu(
            app,
            language,
            paused.unwrap_or(false),
            autostart.unwrap_or(false),
        ) {
            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray.set_menu(Some(menu));
            }
            *ui.menu.lock().unwrap() = handles;
        }
        return;
    }

    let menu = ui.menu.lock().unwrap();
    if let Some(paused) = paused {
        let _ = menu.pause.set_checked(paused);
    }
    if let Some(autostart) = autostart {
        let _ = menu.autostart.set_checked(autostart);
    }
}

fn send_to_sidecar(shared: &Shared, method: &str, params: Option<Value>) -> Result<(), String> {
    let mut guard = shared.stdin.lock().unwrap();
    let stdin = guard.as_mut().ok_or("The sidecar is not available")?;
    let id = CMD_SEQ.fetch_add(1, Ordering::SeqCst);
    let msg = json!({
        "type": "cmd",
        "id": id.to_string(),
        "method": method,
        "params": params.unwrap_or_else(|| json!({})),
    });
    writeln!(stdin, "{msg}").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

fn attach_window_events(window: &tauri::WebviewWindow) {
    let w = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            // Closing the window does NOT quit the app: it is destroyed to free WebView2.
            api.prevent_close();
            let _ = w.destroy();
        }
    });
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    match WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Steam Auto Status")
        .inner_size(920.0, 660.0)
        .min_inner_size(720.0, 520.0)
        .center()
        .visible(true)
        .build()
    {
        Ok(w) => attach_window_events(&w),
        Err(e) => push_log(
            &app.state::<Arc<Shared>>(),
            format!("Could not create the window: {e}"),
        ),
    }
}

// ---------------------------------------------------------------- commands exposed to the UI

#[tauri::command]
fn get_cached_state(shared: tauri::State<'_, Arc<Shared>>) -> Value {
    shared
        .state
        .lock()
        .unwrap()
        .clone()
        .unwrap_or(Value::Null)
}

#[tauri::command]
fn sidecar_command(
    shared: tauri::State<'_, Arc<Shared>>,
    method: String,
    params: Option<Value>,
) -> Result<(), String> {
    send_to_sidecar(&shared, &method, params)
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    show_window(&app);
}

/// true if the app was launched with --hidden (Windows auto-start)
#[tauri::command]
fn launch_hidden() -> bool {
    std::env::args().any(|a| a == "--hidden")
}

#[tauri::command]
fn set_autostart(app: AppHandle, enable: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enable {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

/// Opens the app data folder (config, token, logs) in the system file manager.
#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Opens an external link with the default browser (http/https only).
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http/https links are allowed".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Copies text to the system clipboard (settings › copy diagnostics).
#[tauri::command]
fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle, shared: tauri::State<'_, Arc<Shared>>) {
    QUITTING.store(true, Ordering::SeqCst);
    if let Some(mut child) = shared.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    app.exit(0);
}

// ---------------------------------------------------------------- tray

/// Builds the tray menu for a language, with the given check states. Returns the menu plus
/// the handles that later state events need to refresh.
fn build_tray_menu(
    app: &AppHandle,
    lang: &str,
    paused: bool,
    autostart_enabled: bool,
) -> tauri::Result<(Menu<tauri::Wry>, TrayMenuHandles)> {
    let labels = TrayLabels::for_language(lang);

    let show = MenuItem::with_id(app, "show", labels.show, true, None::<&str>)?;
    let online30 = MenuItem::with_id(app, "online30", labels.online30, true, None::<&str>)?;
    let invisible = MenuItem::with_id(app, "invisible", labels.invisible, true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(app, "pause", labels.pause, true, paused, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        labels.autostart,
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &online30, &invisible, &pause, &autostart, &separator, &quit],
    )?;
    Ok((menu, TrayMenuHandles { pause, autostart }))
}

fn build_tray(app: &AppHandle, shared: Arc<Shared>) -> tauri::Result<()> {
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    // The menu comes up in the language saved in config.json; the pause checkmark starts
    // unchecked and the first state event (moments after the sidecar starts) refreshes it.
    let language = config_language(app);
    let (menu, handles) = build_tray_menu(app, &language, false, autostart_enabled)?;

    app.manage(TrayUi {
        menu: Mutex::new(handles),
        online: Mutex::new(Some(false)),
        language: Mutex::new(language),
    });

    // Start with the "invisible" tray icon: it is the presence until the sidecar reports
    // otherwise, so the tray never shows a stale state on launch.
    let icon = match tray_state_icon(false) {
        Some(icon) => icon,
        None => app
            .default_window_icon()
            .cloned()
            .ok_or_else(|| tauri::Error::AssetNotFound("default icon not available".into()))?,
    };

    let shared_menu = shared.clone();
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Steam Auto Status")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .on_menu_event(move |app, event| {
            let shared = shared_menu.clone();
            match event.id().as_ref() {
                "show" => show_window(app),
                "online30" => {
                    let _ = send_to_sidecar(&shared, "forceState", Some(json!({ "state": "online", "minutes": 30 })));
                }
                "invisible" => {
                    let _ = send_to_sidecar(&shared, "forceState", Some(json!({ "state": "invisible", "minutes": 30 })));
                }
                "pause" => {
                    let paused_now = app
                        .try_state::<Arc<Shared>>()
                        .and_then(|s| {
                            s.state
                                .lock()
                                .unwrap()
                                .as_ref()
                                .and_then(|st| st.get("paused").and_then(|p| p.as_bool()))
                        })
                        .unwrap_or(false);
                    let method = if paused_now { "resume" } else { "pause" };
                    let _ = send_to_sidecar(&shared, method, None);
                }
                "autostart" => {
                    let checked = app
                        .try_state::<TrayUi>()
                        .and_then(|ui| ui.menu.lock().unwrap().autostart.is_checked().ok())
                        .unwrap_or(false);
                    let manager = app.autolaunch();
                    let result = if checked {
                        manager.enable()
                    } else {
                        manager.disable()
                    };
                    if result.is_ok() {
                        let _ = send_to_sidecar(
                            &shared,
                            "setConfig",
                            Some(json!({ "startWithWindows": checked })),
                        );
                    }
                }
                "quit" => {
                    QUITTING.store(true, Ordering::SeqCst);
                    if let Some(mut child) = shared.child.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

// ---------------------------------------------------------------- main

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            get_cached_state,
            sidecar_command,
            show_main_window,
            launch_hidden,
            set_autostart,
            open_data_folder,
            open_url,
            copy_text,
            quit_app
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let shared = Arc::new(Shared::default());
            app.manage(shared.clone());

            build_tray(&handle, shared.clone())?;
            start_supervisor(handle.clone(), shared.clone());

            if let Some(window) = app.get_webview_window("main") {
                attach_window_events(&window);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() && !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
            let _ = app;
        });
}
