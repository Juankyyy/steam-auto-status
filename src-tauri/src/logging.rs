//! Persistent diagnostic log (`logs/status.log`), rotated at ~1 MB, plus tail/clear
//! helpers for the Settings panel.
//!
//! Log lines stay in English on purpose: they are technical diagnostics and must read the
//! same in bug reports, regardless of the UI language.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};

/// Rotate before the file grows past this size (same threshold as the old sidecar).
const MAX_LOG_BYTES: u64 = 1_000_000;

pub struct Logger {
    data_dir: PathBuf,
}

impl Logger {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
        }
    }

    fn log_path(&self) -> PathBuf {
        self.data_dir.join("logs").join("status.log")
    }

    /// Formats, rotates if needed and appends a line. Returns the full line so the core
    /// can mirror it to the panel.
    pub fn line(&self, message: &str) -> String {
        let line = format!(
            "[{}] {message}",
            Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
        );
        let path = self.log_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(metadata) = fs::metadata(&path) {
            if metadata.len() > MAX_LOG_BYTES {
                let _ = fs::rename(&path, path.with_extension("log.1"));
            }
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{line}");
        }
        line
    }

    /// Last `n` non-empty lines, oldest first.
    pub fn tail(&self, n: usize) -> Vec<String> {
        let Ok(content) = fs::read_to_string(self.log_path()) else {
            return Vec::new();
        };
        let mut lines: Vec<String> = content
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect();
        let start = lines.len().saturating_sub(n);
        lines.drain(..start);
        lines
    }

    pub fn clear(&self) {
        let path = self.log_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, "");
    }
}
