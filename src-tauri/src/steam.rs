//! Local Steam client bridge.
//!
//! The app deliberately has no Steam session of its own: it talks to the official client
//! that is already running on this machine. Steam exposes the same URL commands its own
//! Friends menu uses, so a status change looks exactly like the user picking it manually.
//!
//! - Process detection uses the Toolhelp snapshot (no `tasklist` child process).
//! - URL dispatch uses `ShellExecuteW` (no `cmd /c start` console flash).

use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Presence the app can ask the local client for. Never Offline: the app leaves the
/// client alone when it is closed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Persona {
    Online,
    Invisible,
}

impl Persona {
    pub fn label(self) -> &'static str {
        match self {
            Persona::Online => "Online",
            Persona::Invisible => "Invisible",
        }
    }

    fn url(self) -> &'static str {
        match self {
            Persona::Online => "steam://friends/status/online",
            Persona::Invisible => "steam://friends/status/invisible",
        }
    }
}

/// The Steam client's executable name, as it appears in the process list.
const STEAM_EXE: &str = "steam.exe";

/// Is the official Steam client (steam.exe) running?
#[cfg(windows)]
pub fn is_running() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut found = false;
        let mut has_entry = Process32FirstW(snapshot, &mut entry) != 0;
        while has_entry {
            let name_len = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);
            if name.eq_ignore_ascii_case(STEAM_EXE) {
                found = true;
                break;
            }
            has_entry = Process32NextW(snapshot, &mut entry) != 0;
        }

        CloseHandle(snapshot);
        found
    }
}

#[cfg(not(windows))]
pub fn is_running() -> bool {
    false
}

/// Asks the running Steam client to change its own presence.
pub fn send_persona(persona: Persona) -> Result<(), String> {
    dispatch(persona.url())
}

/// Opens the Steam client, or focuses it when it is already running.
pub fn open_main() -> Result<(), String> {
    dispatch("steam://open/main")
}

/// Runs `ShellExecuteW` on a short-lived worker and waits at most a couple of seconds.
///
/// Windows can occasionally make the shell block while it dispatches a protocol URL (for
/// example when Steam is busy). The core must never freeze on that: after the timeout we
/// consider the URL handed to the shell and let Steam finish at its own pace.
fn dispatch(url: &str) -> Result<(), String> {
    let (sender, receiver) = mpsc::channel();
    let owned = url.to_string();
    std::thread::spawn(move || {
        let _ = sender.send(send_url_blocking(&owned));
    });

    match receiver.recv_timeout(Duration::from_secs(2)) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) => Ok(()),
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err("ShellExecuteW worker stopped unexpectedly".into())
        }
    }
}

#[cfg(windows)]
fn send_url_blocking(url: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let operation = to_wide("open");
    let file = to_wide(url);

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL as i32,
        )
    };

    // ShellExecuteW returns a value <= 32 when it fails; anything above is success.
    if result as isize <= 32 {
        Err(format!(
            "ShellExecuteW failed with code {}",
            result as isize
        ))
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(not(windows))]
fn send_url_blocking(_url: &str) -> Result<(), String> {
    Err("Steam control is only supported on Windows".into())
}
