#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Steam Auto Status — desktop shell (Tauri v2)
//!
//! Responsibilities:
//! - System tray icon with context menu and dynamic tooltip.
//! - Panel window (WebView2), created on demand and destroyed on close
//!   to free resources (the app lives in the tray).
//! - Bridge between the panel and the Rust core (schedule, logs, Steam client control).
//! - Plugins: single instance, autostart, notifications, opener, clipboard.
//!
//! The core lives in `src-tauri/src/core.rs`; there is no Node sidecar anymore.

mod config;
mod core;
mod logging;
mod schedule;
mod steam;

use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Listener, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use core::Core;

/// Tray handles to update the visual state from core events. The menu itself is rebuilt
/// whenever the UI language changes, so its handles live behind a mutex too.
struct TrayUi {
    menu: Mutex<TrayMenuHandles>,
    /// Last presence shown by the tray icon (`Some(true)` = online). The icon is only
    /// replaced when it changes: re-setting the same image on every tick is needless
    /// work and can make the tray icon flicker on Windows.
    online: Mutex<Option<bool>>,
    /// Language the current menu was built with (rebuilt only when it changes).
    language: Mutex<String>,
}

/// Menu items whose state is refreshed from core events.
struct TrayMenuHandles {
    pause: CheckMenuItem<tauri::Wry>,
    autostart: CheckMenuItem<tauri::Wry>,
}

/// Tray menu labels per UI language. The tooltip comes from the core (which knows the
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
/// right language before the first state event; later changes arrive through core state.
fn config_language(app: &AppHandle) -> String {
    std::fs::read_to_string(data_dir(app).join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| {
            v.get("language")
                .and_then(|l| l.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "es".to_string())
}

/// Logs a shell-level message through the core (log file + panel); before the core exists
/// (very early setup) it falls back to stderr.
fn shell_log(app: &AppHandle, message: String) {
    if let Some(core) = app.try_state::<Arc<Core>>() {
        core.log(&message);
    } else {
        eprintln!("{message}");
    }
}

/// Side effects for the events the Rust core emits: tray icon/menu and notifications.
/// The panel listens to the same `sidecar-message` event for its own state.
fn handle_core_message(app: &AppHandle, value: &Value) {
    if value.get("type").and_then(Value::as_str) != Some("event") {
        return;
    }
    let event = value.get("event").and_then(Value::as_str).unwrap_or("");
    let data = value.get("data").cloned().unwrap_or(Value::Null);
    match event {
        "state" => update_tray(app, &data),
        "notify" => {
            let title = data
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Steam Auto Status")
                .to_string();
            let body = data
                .get("body")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let _ = app.notification().builder().title(title).body(body).show();
        }
        _ => {}
    }
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
        // The client must be running for the presence to mean anything; without it the
        // tray stays grey even if the last sent state was Online.
        let online = state
            .get("steamRunning")
            .and_then(|r| r.as_bool())
            .unwrap_or(false)
            && state.get("persona").and_then(|p| p.as_str()) == Some("online");
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
        .decorations(false)
        // Matches `shadow: true` in tauri.conf.json: keep rounded corners and the native
        // shadow when the window is recreated after being closed.
        .shadow(true)
        .visible(true)
        .build()
    {
        Ok(w) => attach_window_events(&w),
        Err(e) => shell_log(app, format!("Could not create the window: {e}")),
    }
}

// ---------------------------------------------------------------- commands exposed to the UI

#[tauri::command]
fn get_cached_state(core: tauri::State<'_, Arc<Core>>) -> Value {
    core.snapshot()
}

/// Command bridge kept under its old name; the UI does not change.
#[tauri::command]
fn sidecar_command(core: tauri::State<'_, Arc<Core>>, method: String, params: Option<Value>) {
    core.handle_command(&method, params.unwrap_or_else(|| json!({})));
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

/// Opens the app data folder (config, logs) in the system file manager.
#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Opens the Steam client (or focuses it if it is already running).
///
/// `steam://open/main` goes through the registered protocol handler; the app itself never
/// signs in. `ShellExecuteW` dispatches the URL with no `cmd` wrapper and no console flash.
#[tauri::command]
fn open_steam() -> Result<(), String> {
    steam::open_main()
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
fn quit_app(app: AppHandle) {
    core::request_quit();
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
        &[
            &show, &online30, &invisible, &pause, &autostart, &separator, &quit,
        ],
    )?;
    Ok((menu, TrayMenuHandles { pause, autostart }))
}

fn with_core<F: FnOnce(&Core)>(app: &AppHandle, action: F) {
    if let Some(core) = app.try_state::<Arc<Core>>() {
        action(&core);
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    // The menu comes up in the language saved in config.json; the pause checkmark starts
    // unchecked and the first state event (moments after the core starts) refreshes it.
    let language = config_language(app);
    let (menu, handles) = build_tray_menu(app, &language, false, autostart_enabled)?;

    app.manage(TrayUi {
        menu: Mutex::new(handles),
        online: Mutex::new(Some(false)),
        language: Mutex::new(language),
    });

    // Start with the "invisible" tray icon: it is the presence until the core reports
    // otherwise, so the tray never shows a stale state on launch.
    let icon = match tray_state_icon(false) {
        Some(icon) => icon,
        None => app
            .default_window_icon()
            .cloned()
            .ok_or_else(|| tauri::Error::AssetNotFound("default icon not available".into()))?,
    };

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
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app),
            "online30" => with_core(app, |core| {
                core.handle_command("forceState", json!({ "state": "online", "minutes": 30 }));
            }),
            "invisible" => with_core(app, |core| {
                core.handle_command("forceState", json!({ "state": "invisible", "minutes": 30 }));
            }),
            "pause" => with_core(app, |core| {
                let paused_now = core
                    .snapshot()
                    .get("paused")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let method = if paused_now { "resume" } else { "pause" };
                core.handle_command(method, json!({}));
            }),
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
                    with_core(app, |core| {
                        core.handle_command("setConfig", json!({ "startWithWindows": checked }));
                    });
                }
            }
            "quit" => {
                core::request_quit();
                app.exit(0);
            }
            _ => {}
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
            open_steam,
            open_url,
            copy_text,
            quit_app
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // One side-effect listener for the events the core emits: it updates the tray
            // icon/menu and shows Windows notifications. The panel listens to the same
            // `sidecar-message` event for its own state.
            let listener_handle = handle.clone();
            let _ = app.listen("sidecar-message", move |event| {
                if let Ok(value) = serde_json::from_str::<Value>(event.payload()) {
                    handle_core_message(&listener_handle, &value);
                }
            });

            build_tray(&handle)?;

            let core = Core::new(handle.clone(), data_dir(&handle));
            app.manage(core.clone());
            core.start();
            // The first state event may be emitted before the listener is fully wired; make
            // sure the tray reflects the initial state immediately.
            let initial_state = core.snapshot();
            update_tray(&handle, &initial_state);

            if let Some(window) = app.get_webview_window("main") {
                attach_window_events(&window);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() && !core::is_quitting() {
                    api.prevent_exit();
                }
            }
            let _ = app;
        });
}
