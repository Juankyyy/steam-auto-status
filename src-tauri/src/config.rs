//! Application configuration: first-run language, defaults, load/save and sanitizing.
//!
//! Ported from the old Node sidecar (`sidecar/src/index.ts`) so `config.json` keeps the
//! exact same shape and behavior.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Valid weekday keys, Sunday first (matches `Date.getDay()` from the old sidecar).
pub const DAYS: [&str; 7] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub days: Vec<String>,
    pub online_from: String,
    pub online_until: String,
    pub paused: bool,
    pub start_with_windows: bool,
    pub notifications: bool,
    pub dev_mode: bool,
    pub language: String,
    pub countdown_precision: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            days: vec![
                "mon".into(),
                "tue".into(),
                "wed".into(),
                "thu".into(),
                "fri".into(),
            ],
            online_from: "17:30".into(),
            online_until: "01:00".into(),
            paused: false,
            start_with_windows: false,
            notifications: false,
            dev_mode: false,
            language: detect_language(),
            countdown_precision: "seconds".into(),
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
    // predate the countdown preference so its default is visible too.
    let persisted_language = parsed.get("language").and_then(Value::as_str);
    let persisted_precision = parsed.get("countdownPrecision").and_then(Value::as_str);
    if persisted_language != Some(config.language.as_str())
        || persisted_precision != Some(config.countdown_precision.as_str())
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

    let days = match overlay.get("days") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .filter(|day| DAYS.contains(day))
            .map(str::to_string)
            .collect(),
        Some(_) => defaults.days.clone(),
        None => base
            .days
            .iter()
            .filter(|day| DAYS.contains(&day.as_str()))
            .cloned()
            .collect(),
    };

    Config {
        days,
        online_from: time_field(base, overlay, "onlineFrom", &defaults.online_from),
        online_until: time_field(base, overlay, "onlineUntil", &defaults.online_until),
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
    }
}

fn time_field(base: &Config, overlay: &Value, key: &str, fallback: &str) -> String {
    match overlay.get(key) {
        Some(value) => normalize_time(value).unwrap_or_else(|| fallback.to_string()),
        None => {
            let current = match key {
                "onlineFrom" => &base.online_from,
                _ => &base.online_until,
            };
            normalize_time(&Value::String(current.clone())).unwrap_or_else(|| fallback.to_string())
        }
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
        assert_eq!(merged.days, base.days);
        assert_eq!(merged.online_from, base.online_from);
        assert_eq!(merged.online_until, base.online_until);
        assert_eq!(merged.language, base.language);
        assert_eq!(merged.countdown_precision, base.countdown_precision);
    }

    #[test]
    fn merge_normalizes_and_validates_values() {
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
                "countdownPrecision": "MINUTES"
            }),
        );
        assert_eq!(merged.days, vec!["mon", "fri", "sun"]);
        assert_eq!(merged.online_from, "07:05");
        assert_eq!(merged.online_until, "01:00"); // invalid -> built-in default
        assert!(merged.paused);
        assert!(!merged.notifications);
        assert_eq!(merged.language, "en");
        assert_eq!(merged.countdown_precision, "minutes");
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
    fn merge_ignores_legacy_fields() {
        let base = Config::default();
        let merged = merge(
            &base,
            &json!({ "machineName": "AutoStatus", "paused": true }),
        );
        assert!(merged.paused);
        assert_eq!(merged.online_from, base.online_from);
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
