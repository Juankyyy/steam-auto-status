# 🎮 Steam Auto Status

**Your Steam status, on your schedule — automatically.**

Steam Auto Status is a tiny Windows tray app that shows you as **Online** during the hours
you choose and **Invisible** the rest of the time. No more remembering to switch your
status before work — or forgetting to go invisible when you go to bed.

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6?style=flat-square)](#-requirements)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?style=flat-square)](https://tauri.app)
[![UI](https://img.shields.io/badge/UI-React%20%2B%20Tailwind-61DAFB?style=flat-square)](https://react.dev)

## ✨ Features

- 🕒 **Automatic schedule** — Online during your configured window (default:
  Monday–Friday, 17:30 → 01:00), Invisible outside of it.
- 👻 **Works even with Steam closed** — the app keeps its own lightweight background
  session, so your status updates on time without opening Steam.
- 🎮 **Zero interference** — it never launches games and only uses Steam's normal session
  API: your regular Steam client, your games and VAC-protected sessions are untouched.
- 📱 **Sign in once** — scan a QR code with the Steam mobile app (or use username +
  password with mobile approval). The token is stored locally; it never asks again.
- 🖥️ **Tray-first** — quick actions from the tray menu ("Online for 30 min",
  "Invisible now", pause/resume) plus a full settings panel.
- 🪶 **Lightweight** — built to stay open 24/7 with minimal resource usage.

## 🚀 Getting started

### 1. Download & install

Grab **`steam-auto-status_X.Y.Z_x64-setup.exe`** from the
[**latest release**](https://github.com/Juankyyy/steam-auto-status/releases/latest) and
run it. Per-user install: no admin rights needed.

> ⚠️ **"Windows protected your PC"?** The app isn't code-signed, so SmartScreen warns
> about an unknown publisher. Click **More info → Run anyway**. The full source is in this
> repository, so you can inspect (or build) it yourself.

### 2. Sign in

Open the panel from the tray icon (next to the clock) and scan the QR code with the Steam
mobile app. Alternatively, log in with username + password — Steam will ask you to approve
it from your phone.

### 3. Forget about it

The app lives in the tray and switches your presence on schedule. Open the panel any time
to adjust hours, weekdays, notifications or to pause the automation.

## ⚙️ How it works

Steam combines the status of every session logged into your account: if **any** of them is
Online, your friends see you Online. Steam Auto Status just keeps an extra, invisible
session in the background and flips it between Online/Invisible according to your schedule.

It never "plays" anything, so it can't interfere with your games, your normal Steam client
or VAC-protected sessions.

> 💡 More context and design decisions: [SPEC.md](SPEC.md) (Spanish).

## 🔐 Your data

- Everything is stored **locally** in `Documents\steam-auto-status\` (config, login token,
  logs) — not in AppData. The folder is configurable from the settings panel.
- Nothing is sent anywhere except Steam itself.
- Uninstalling **keeps your data**; delete the folder manually if you want a clean slate.

## ❓ FAQ & troubleshooting

**It didn't change my status** — make sure the app is running (tray icon) and check your
schedule. Live logs are in `Documents\steam-auto-status\logs\`.

**The panel stays loading / something looks stuck** — close the app from the tray and open
it again. If it persists, check `logs\sidecar-stderr.log` and
[open an issue](https://github.com/Juankyyy/steam-auto-status/issues).

**How do I switch Steam accounts?** — Panel → **Log out**, then sign in again.

**How do I close it completely?** — Tray icon → **Quit**. If "Start with Windows" is
enabled, disable it first or the app will come back on reboot.

**How do I update?** — Download the new installer from the
[latest release](https://github.com/Juankyyy/steam-auto-status/releases/latest) and run it
on top of your current version: your config, token and logs are kept and you won't need to
sign in again.

**Does my PC need to stay on?** — Yes: the app must be running to update your status.
Enable **Start with Windows** so it's always there.

**Will this get me banned?** — It doesn't touch games or inject into any process: it uses
Steam's normal login/presence API (via the well-known `steam-user` library). VAC has
nothing to look at.

**Is the interface available in English?** — Not yet: the app UI is currently in Spanish
(the installer is available in English and Spanish).

## ✅ Requirements

- Windows 10 or 11 (x64)
- WebView2 — preinstalled on Windows 10/11 (the installer fetches it if missing)
- Internet connection

## 🛠️ For developers

<details>
<summary>Project structure, building and releases</summary>

| Folder | Contents |
|---|---|
| `src-tauri/` | Desktop shell (Rust/Tauri): tray, window, sidecar supervision |
| `sidecar/` | Core (Node + `steam-user`): Steam session, schedules, data |
| `ui/` | Interface (React + TypeScript + Tailwind + shadcn/ui) |

Requirements: Node.js 20+ and Rust (rustup) + MSVC Build Tools.

```sh
npm install
npm run dev     # development (Tauri + Vite; uses your system Node)
npm run build   # builds the installer → src-tauri/target/release/bundle/nsis/
```

The build downloads the official Node runtime used by the sidecar (SHA256-verified) and
renames the installer to `steam-auto-status_X.Y.Z_x64-setup.exe`.

**Releases:** push a `vX.Y.Z` tag from `main` — GitHub Actions builds everything on Windows
and publishes the release with the installer attached. Curated notes live in
[`release-notes/`](release-notes/) (English, with emojis).

</details>

## 📄 License

[GPL-3.0](LICENSE) — free to use, study, share and improve.

---

Made by [@Juankyyy](https://github.com/Juankyyy) · Ideas and bug reports are welcome in
[Issues](https://github.com/Juankyyy/steam-auto-status/issues).
