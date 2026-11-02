//! Application configuration: first-run language, defaults, load/save and sanitizing.
//!
//! Ported from the old Node sidecar (`sidecar/src/index.ts`). Legacy single-window configs
//! are migrated to the current `windows` list on load.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Valid weekday keys, Sunday first (matches `Date.getDay()` from the old sidecar).
pub const DAYS: [&str; 7] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/// One recurring Online window: a set of start days plus the local start/end times.
/// When `until <= from` the window ends on the next day, so a single window can cross
/// midnight (Friday 17:00 → Saturday 01:15, for example).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ScheduleWindow {
    pub days: Vec<String>,
    pub from: String,
    pub until: String,
}

impl ScheduleWindow {
    fn new(days: &[&str], from: &str, until: &str) -> Self {
        Self {
            days: days.iter().map(|day| day.to_string()).collect(),
            from: from.to_string(),
            until: until.to_string(),
        }
    }
}

/// Built-in schedule used on first run and as the fallback for invalid values.
fn default_window() -> ScheduleWindow {
    ScheduleWindow::new(&["mon", "tue", "wed", "thu", "fri"], "17:30", "01:00")
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub windows: Vec<ScheduleWindow>,
    pub paused: bool,
    pub start_with_windows: bool,
    pub notifications: bool,
    pub dev_mode: bool,
    pub language: String,
    pub countdown_precision: String,
    pub app_background: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            windows: vec![default_window()],
            paused: false,
            start_with_windows: false,
            notifications: false,
            dev_mode: false,
            language: detect_language(),
            countdown_precision: "seconds".into(),
            app_background: "full".into(),
        }
    }
}

fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("config.json")
}

/// Loads `config.json`, creating it with defaults on first run. Returns the configuration
/// plus English log messages for anything that had to be repaired or could not be saved.
pub fn load(data_dir: &Path) -> (Config, Vec<String>) {
    let mut warnings = Vec::new();
    let path = config_path(data_dir);
    let _ = fs::create_dir_all(data_dir);

    if !path.exists() {
        if let Err(e) = save(data_dir, &Config::default()) {
            warnings.push(format!("Could not save config.json: {e}"));
        }
    }

    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(e) => {
            warnings.push(format!("Invalid config.json, using defaults ({e})"));
            return (Config::default(), warnings);
        }
    };
    let parsed = match serde_json::from_str::<Value>(&raw) {
        Ok(parsed) => parsed,
        Err(e) => {
            warnings.push(format!("Invalid config.json, using defaults ({e})"));
            return (Config::default(), warnings);
        }
    };

    let config = merge(&Config::default(), &parsed);
    // Persist the detected language on first run (or after an invalid value) so the
    // first-run choice is stable and visible in config.json. Also rewrite configs from the
    // old login version so the obsolete machineName field disappears, and configs that
    // predate newer preferences (countdown detail, app background) so their defaults are
    // visible too.
    let persisted_language = parsed.get("language").and_then(Value::as_str);
    let persisted_precision = parsed.get("countdownPrecision").and_then(Value::as_str);
    let persisted_background = parsed.get("appBackground").and_then(Value::as_str);
    let legacy_background = parsed.get("cardBackground").and_then(Value::as_str);
    let legacy_spotlight = parsed.get("cardSpotlight").is_some();
    // Older configs keep one window in top-level `days`/`onlineFrom`/`onlineUntil`; the
    // merge above turns it into `windows`, and this comparison rewrites the file so the
    // migrated shape is what the user sees next time.
    let persisted_windows = parsed.get("windows");
    let windows_value = serde_json::to_value(&config.windows).unwrap_or(Value::Null);
    let legacy_schedule = parsed.get("days").is_some()
        || parsed.get("onlineFrom").is_some()
        || parsed.get("onlineUntil").is_some();
    if persisted_language != Some(config.language.as_str())
        || persisted_precision != Some(config.countdown_precision.as_str())
        || persisted_background != Some(config.app_background.as_str())
        || persisted_windows != Some(&windows_value)
        || legacy_schedule
        || legacy_background.is_some()
        || legacy_spotlight
        || parsed.get("machineName").is_some()
    {
        if let Err(e) = save(data_dir, &config) {
            warnings.push(format!("Could not save config.json: {e}"));
        }
    }

    (config, warnings)
}

pub fn save(data_dir: &Path, config: &Config) -> Result<(), String> {
    let _ = fs::create_dir_all(data_dir);
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path(data_dir), json).map_err(|e| e.to_string())
}

/// Merges a partial JSON overlay (IPC `setConfig` params or `config.json`) over a base
/// configuration, dropping unknown/invalid values exactly like the old sidecar:
/// invalid values fall back to the built-in defaults, absent keys keep the base value.
pub fn merge(base: &Config, overlay: &Value) -> Config {
    let defaults = Config::default();

    Config {
        windows: windows_field(base, overlay, &defaults.windows),
        paused: bool_field(base.paused, overlay, "paused"),
        start_with_windows: bool_field(base.start_with_windows, overlay, "startWithWindows"),
        notifications: bool_field(base.notifications, overlay, "notifications"),
        dev_mode: bool_field(base.dev_mode, overlay, "devMode"),
        language: language_field(base, overlay, &defaults.language),
        countdown_precision: countdown_precision_field(
            base,
            overlay,
            &defaults.countdown_precision,
        ),
        app_background: app_background_field(base, overlay, &defaults.app_background),
    }
}

/// Reads the `windows` array, or migrates the old single-window shape
/// (`days` + `onlineFrom` + `onlineUntil`) into one block. A partial `setConfig`
/// that only carries other keys keeps the base list untouched.
fn windows_field(
    base: &Config,
    overlay: &Value,
    defaults: &[ScheduleWindow],
) -> Vec<ScheduleWindow> {
    if let Some(value) = overlay.get("windows") {
        return parse_windows(value, defaults);
    }

    let has_legacy = ["days", "onlineFrom", "onlineUntil"]
        .iter()
        .any(|key| overlay.get(*key).is_some());
    if has_legacy {
        let fallback = defaults.first().cloned().unwrap_or_else(default_window);
        return vec![legacy_window(base, overlay, &fallback)];
    }

    base.windows.clone()
}

fn parse_windows(value: &Value, defaults: &[ScheduleWindow]) -> Vec<ScheduleWindow> {
    let Value::Array(items) = value else {
        return defaults.to_vec();
    };
    let fallback = defaults.first().cloned().unwrap_or_else(default_window);
    items
        .iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            Some(ScheduleWindow {
                days: days_from_overlay(object.get("days"), &fallback.days),
                from: object
                    .get("from")
                    .and_then(normalize_time)
                    .unwrap_or_else(|| fallback.from.clone()),
                until: object
                    .get("until")
                    .and_then(normalize_time)
                    .unwrap_or_else(|| fallback.until.clone()),
            })
        })
        .collect()
}

fn legacy_window(base: &Config, overlay: &Value, fallback: &ScheduleWindow) -> ScheduleWindow {
    let base_window = base.windows.first();
    let fallback_days = base_window
        .map(|window| window.days.as_slice())
        .unwrap_or(fallback.days.as_slice());
    ScheduleWindow {
        days: match overlay.get("days") {
            Some(value) => days_from_overlay(Some(value), fallback_days),
            None => fallback_days.to_vec(),
        },
        from: legacy_time(base_window, overlay, "onlineFrom", &fallback.from),
        until: legacy_time(base_window, overlay, "onlineUntil", &fallback.until),
    }
}

fn legacy_time(
    base: Option<&ScheduleWindow>,
    overlay: &Value,
    key: &str,
    fallback: &str,
) -> String {
    match overlay.get(key) {
        Some(value) => normalize_time(value).unwrap_or_else(|| fallback.to_string()),
        None => {
            let current = base.map(|window| {
                if key == "onlineFrom" {
                    &window.from
                } else {
                    &window.until
                }
            });
            current
                .and_then(|value| normalize_time(&Value::String(value.clone())))
                .unwrap_or_else(|| fallback.to_string())
        }
    }
}

fn days_from_overlay(value: Option<&Value>, fallback: &[String]) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .filter(|day| DAYS.contains(day))
            .map(str::to_string)
            .collect(),
        Some(_) => fallback.to_vec(),
        None => fallback.to_vec(),
    }
}

fn bool_field(base: bool, overlay: &Value, key: &str) -> bool {
    overlay.get(key).map(truthy).unwrap_or(base)
}

fn language_field(base: &Config, overlay: &Value, fallback: &str) -> String {
    let candidate = match overlay.get("language") {
        Some(Value::String(value)) => value.trim().to_lowercase(),
        Some(_) => String::new(),
        None => base.language.trim().to_lowercase(),
    };
    if candidate == "es" || candidate == "en" {
        candidate
    } else {
        fallback.to_string()
    }
}

/// Smallest unit shown by the dashboard countdown. Invalid values fall back to `seconds`.
fn countdown_precision_field(base: &Config, overlay: &Value, fallback: &str) -> String {
    let candidate = match overlay.get("countdownPrecision") {
        Some(Value::String(value)) => value.trim().to_lowercase(),
        Some(_) => String::new(),
        None => base.countdown_precision.trim().to_lowercase(),
    };
    match candidate.as_str() {
        "hours" | "minutes" | "seconds" => candidate,
        _ => fallback.to_string(),
    }
}

/// Dot-grid backdrop of the app. Invalid or legacy values fall back to `full`; the old
/// `cardBackground` key is read once so a config from the previous iteration keeps its mode.
fn app_background_field(base: &Config, overlay: &Value, fallback: &str) -> String {
    let value = overlay
        .get("appBackground")
        .or_else(|| overlay.get("cardBackground"));
    let candidate = match value {
        Some(Value::String(value)) => value.trim().to_lowercase(),
        Some(_) => String::new(),
        None => base.app_background.trim().to_lowercase(),
    };
    match candidate.as_str() {
        "full" | "static" | "none" => candidate,
        _ => fallback.to_string(),
    }
}

/// `HH:MM` with 1–2 hour digits and exactly two minute digits, clamped to a real time.
fn normalize_time(value: &Value) -> Option<String> {
    let text = value.as_str()?.trim();
    let (hour, minute) = text.split_once(':')?;
    if hour.is_empty() || hour.len() > 2 || minute.len() != 2 {
        return None;
    }
    if !hour.bytes().all(|b| b.is_ascii_digit()) || !minute.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let hour: u32 = hour.parse().ok()?;
    let minute: u32 = minute.parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some(format!("{hour:02}:{minute:02}"))
}

/// JavaScript `!!value` semantics for the booleans coming through IPC.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64().map(|n| n != 0.0).unwrap_or(false),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// First-run language: follow the Windows user locale. Spanish → `es`, anything else →
/// `en` (same rule the old sidecar applied through Node's ICU).
#[cfg(windows)]
pub fn detect_language() -> String {
    use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;

    let mut buffer = [0u16; 85];
    let length = unsafe { GetUserDefaultLocaleName(buffer.as_mut_ptr(), buffer.len() as i32) };
    if length > 1 {
        let name = String::from_utf16_lossy(&buffer[..(length as usize - 1)]);
        if name.to_lowercase().starts_with("es") {
            "es".into()
        } else {
            "en".into()
        }
    } else {
        "es".into()
    }
}

#[cfg(not(windows))]
pub fn detect_language() -> String {
    "es".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_with_empty_overlay_keeps_base() {
        let base = Config::default();
        let merged = merge(&base, &json!({}));
        assert_eq!(merged.windows, base.windows);
        assert_eq!(merged.language, base.language);
        assert_eq!(merged.countdown_precision, base.countdown_precision);
        assert_eq!(merged.app_background, base.app_background);
    }

    #[test]
    fn merge_migrates_legacy_schedule_into_one_window() {
        let base = Config::default();
        let merged = merge(
            &base,
            &json!({
                "days": ["mon", "nope", "fri", "sun"],
                "onlineFrom": "7:05",
                "onlineUntil": "25:00",
                "paused": 1,
                "notifications": "",
                "language": "EN",
                "countdownPrecision": "MINUTES",
                "appBackground": "STATIC"
            }),
        );
        assert_eq!(
            merged.windows,
            vec![ScheduleWindow::new(
                &["mon", "fri", "sun"],
                "07:05",
                "01:00"
            )]
        );
        assert!(merged.paused);
        assert!(!merged.notifications);
        assert_eq!(merged.language, "en");
        assert_eq!(merged.countdown_precision, "minutes");
        assert_eq!(merged.app_background, "static");
    }

    #[test]
    fn load_migrates_legacy_config_file() {
        let dir = std::env::temp_dir().join(format!(
            "steam-auto-status-config-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("config.json"),
            r#"{"days":["sat","sun"],"onlineFrom":"10:00","onlineUntil":"23:00","paused":true}"#,
        )
        .unwrap();

        let (config, warnings) = load(&dir);
        assert!(warnings.is_empty());
        assert!(config.paused);
        assert_eq!(
            config.windows,
            vec![ScheduleWindow::new(&["sat", "sun"], "10:00", "23:00")]
        );

        let raw = std::fs::read_to_string(dir.join("config.json")).unwrap();
        let parsed: Value = serde_json::from_str(&raw).unwrap();
        assert!(parsed.get("windows").is_some());
        assert!(parsed.get("days").is_none());
        assert!(parsed.get("onlineFrom").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn merge_accepts_multiple_windows() {
        let base = Config::default();
        let merged = merge(
            &base,
            &json!({
                "windows": [
                    {
                        "days": ["mon", "tue", "wed", "thu", "fri"],
                        "from": "17:00",
                        "until": "01:15"
                    },
                    { "days": ["sat", "sun"], "from": "10:00", "until": "23:00" }
                ]
            }),
        );
        assert_eq!(merged.windows.len(), 2);
        assert_eq!(
            merged.windows[0],
            ScheduleWindow::new(&["mon", "tue", "wed", "thu", "fri"], "17:00", "01:15")
        );
        assert_eq!(
            merged.windows[1],
            ScheduleWindow::new(&["sat", "sun"], "10:00", "23:00")
        );
    }

    #[test]
    fn merge_keeps_base_windows_for_partial_overlay() {
        let base = Config {
            windows: vec![
                ScheduleWindow::new(&["mon"], "09:00", "12:00"),
                ScheduleWindow::new(&["sat"], "14:00", "18:00"),
            ],
            ..Config::default()
        };
        let merged = merge(&base, &json!({ "paused": true }));
        assert!(merged.paused);
        assert_eq!(merged.windows, base.windows);
    }

    #[test]
    fn merge_sanitizes_invalid_windows() {
        let base = Config::default();
        let merged = merge(
            &base,
            &json!({
                "windows": [
                    { "days": ["sat", "nope"], "from": "7:5", "until": "9:30" },
                    "not an object",
                    { "days": "nope", "from": "10:00", "until": "11:00" }
                ]
            }),
        );
        assert_eq!(merged.windows.len(), 2);
        assert_eq!(merged.windows[0].days, vec!["sat"]);
        assert_eq!(merged.windows[0].from, "17:30"); // invalid -> built-in default
        assert_eq!(merged.windows[0].until, "09:30");
        assert_eq!(merged.windows[1].days, base.windows[0].days);
        assert_eq!(merged.windows[1].from, "10:00");

        // An empty list is a valid configuration: no schedule at all.
        assert!(merge(&base, &json!({ "windows": [] })).windows.is_empty());
        // A non-array value falls back to the built-in window.
        assert_eq!(merge(&base, &json!({ "windows": 3 })).windows, base.windows);
    }

    #[test]
    fn merge_validates_countdown_precision() {
        let base = Config::default();
        assert_eq!(
            merge(&base, &json!({ "countdownPrecision": "HOURS" })).countdown_precision,
            "hours"
        );
        assert_eq!(
            merge(&base, &json!({ "countdownPrecision": "days" })).countdown_precision,
            "seconds"
        );
        assert_eq!(
            merge(&base, &json!({ "countdownPrecision": 3 })).countdown_precision,
            "seconds"
        );
    }

    #[test]
    fn merge_validates_app_background() {
        let base = Config::default();
        assert_eq!(
            merge(&base, &json!({ "appBackground": "FULL" })).app_background,
            "full"
        );
        assert_eq!(
            merge(&base, &json!({ "appBackground": "static" })).app_background,
            "static"
        );
        assert_eq!(
            merge(&base, &json!({ "appBackground": "none" })).app_background,
            "none"
        );
        // The old key is read once so a tested config keeps its mode.
        assert_eq!(
            merge(&base, &json!({ "cardBackground": "none" })).app_background,
            "none"
        );
        assert_eq!(
            merge(&base, &json!({ "cardBackground": "aurora" })).app_background,
            "full"
        );
        assert_eq!(
            merge(&base, &json!({ "appBackground": 3 })).app_background,
            "full"
        );
    }

    #[test]
    fn merge_ignores_legacy_fields() {
        let base = Config::default();
        let merged = merge(
            &base,
            &json!({ "machineName": "AutoStatus", "paused": true }),
        );
        assert!(merged.paused);
        assert_eq!(merged.windows, base.windows);
    }

    #[test]
    fn normalize_time_accepts_hh_mm_only() {
        assert_eq!(normalize_time(&json!("7:05")), Some("07:05".into()));
        assert_eq!(normalize_time(&json!("17:30")), Some("17:30".into()));
        assert_eq!(normalize_time(&json!("7:5")), None);
        assert_eq!(normalize_time(&json!("24:00")), None);
        assert_eq!(normalize_time(&json!("12:60")), None);
        assert_eq!(normalize_time(&json!(1730)), None);
    }
}
