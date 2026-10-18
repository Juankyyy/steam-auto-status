<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-lockup-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-lockup.png">
    <img width="420" src="assets/logo-lockup.png" alt="Steam Auto Status">
  </picture>
</p>

<p align="center"><strong>Online when you want. Invisible when you don't.</strong></p>

<p align="center">
  <a href="https://github.com/Juankyyy/steam-auto-status/releases/latest"><img src="https://shieldcn.dev/github/release/Juankyyy/steam-auto-status.svg?variant=secondary&amp;size=xs&amp;mode=dark&amp;logoColor=4DD4A0" alt="Latest release"></a>
  <a href="https://github.com/Juankyyy/steam-auto-status/releases"><img src="https://shieldcn.dev/github/downloads/Juankyyy/steam-auto-status.svg?variant=secondary&amp;size=xs&amp;mode=dark&amp;logoColor=64C4FD" alt="Total downloads"></a>
  <img src="https://shieldcn.dev/badge/platform-Windows%2010%2F11.svg?variant=secondary&amp;size=xs&amp;mode=dark&amp;logo=windows&amp;logoColor=0078D6" alt="Platform: Windows 10/11">
  <a href="https://tauri.app"><img src="https://shieldcn.dev/badge/built%20with-Tauri%202.svg?variant=secondary&amp;size=xs&amp;mode=dark&amp;logo=tauri&amp;logoColor=24C8DB" alt="Built with Tauri 2"></a>
  <a href="https://react.dev"><img src="https://shieldcn.dev/badge/UI-React%20%2B%20Tailwind.svg?variant=secondary&amp;size=xs&amp;mode=dark&amp;logo=react&amp;logoColor=61DAFB" alt="UI: React + Tailwind"></a>
  <img src="https://shieldcn.dev/badge/license-GPL%203.0.svg?variant=secondary&amp;size=xs&amp;mode=dark&amp;logo=lu:Scale&amp;logoColor=A1A1AA" alt="License: GPL-3.0">
</p>

Steam Auto Status keeps your Steam presence on your schedule: **Online** during the hours
you choose, **Invisible** the rest of the time. It's a small Windows tray app that lives
quietly in the background, so you don't have to remember to appear online before work or
to go invisible before bed.

## 📸 Screenshots

<p align="center">
  <a href="assets/screenshots/main-screenshot.jpg"><img src="assets/screenshots/main-screenshot.jpg" alt="Steam Auto Status dashboard and schedule"></a>
</p>

## ✨ Features

- **Schedule-driven presence**: Online inside your weekly window and Invisible outside it.
  Pick the days and the start/end time, including overnight windows (default: Monday–Friday,
  17:30 → 01:00).
- **Keeps working with Steam closed**: The app runs its own background session, so your
  status changes on time whether or not the client is open. It reconnects on its own after
  network drops, never launches games and never signs out the client you play with.
- **Sign in once**: Scan a QR code with the Steam mobile app, or use username + password
  with mobile confirmation. Only the refresh token is stored, locally.
- **Tray-first, panel when you want it**: Current status and next change at a glance,
  one-click overrides from the tray menu ("Online for 30 min", "Invisible now",
  pause/resume), and a settings window for schedule, startup and notifications. The tray
  icon doubles as a status light: green online, grey invisible.
- **Light on resources**: Around 140–160 MB at idle (shell + sidecar), and the WebView
  processes are released when you close the window. Built to stay open 24/7.
- **Spanish and English**: Switch language at runtime; the panel, tray menu, tooltip and
  notifications follow the same setting. On first run it matches your Windows language.
- **Local by default**: Settings, token and logs live in one folder under `Documents`
  (configurable from the panel). Nothing leaves your machine except the Steam connection.

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

Steam doesn't store one single status: it combines the status of every session signed in
with your account. If any of them is Online, your friends see you Online.

Steam Auto Status simply holds one more session of its own in the background an extra,
invisible client that never launches anything and flips it between Online and Invisible
whenever your schedule says so.

Your normal Steam client keeps whatever status you set (Invisible works great as a
baseline), and the app never signs it out. Because it only uses Steam's own login and
presence, it can't interfere with your games, your normal Steam client or VAC-protected
sessions.

## 🔐 Your data

- Everything is stored **locally** in `Documents\steam-auto-status\` (config, login token,
  logs) not in AppData. The folder is configurable from the settings panel.
- Nothing is sent anywhere except Steam itself.
- Uninstalling **keeps your data**; delete the folder manually if you want a clean slate.

## ❓ FAQ & troubleshooting

<details>
<summary><strong>It didn't change my status</strong></summary>

Check three things:

1. **The app is running**: look for the tray icon.
2. **The schedule covers the current time**: panel → Schedule (overnight windows included).
3. **Your normal Steam client is set to Invisible**: the app only *adds* Online presence
   during your window; it can't force Invisible while another session (your desktop client,
   the mobile app, a game) is Online.

To see the result, check your status on your
[Steam profile page](https://steamcommunity.com/my/): the Friends & chat tab can show a
stale or blank status after a reconnect. Live logs are in
`Documents\steam-auto-status\logs\`.

</details>

<details>
<summary><strong>The panel stays loading, or something looks stuck</strong></summary>

Close the app from the tray and open it again. If it persists, copy a diagnostic from
**Settings › Data & logs › Copy diagnostics** (version, connection state and the latest log
lines) and [open an issue](https://github.com/Juankyyy/steam-auto-status/issues) with it.

</details>

<details>
<summary><strong>Steam's friends list looks empty after the app (re)connects</strong></summary>

Steam's own client reloads (and can leave blank) the friends list whenever your account
receives a new session, and the app's 24/7 session counts as one. It is a Steam client
quirk your client is never logged out, and the app keeps its logons to the bare minimum
(one per start, plus retries with backoff after network drops).

If the list looks empty: switch your status to Invisible and back to Online (this often
refreshes it), or restart the Steam client closing and reopening the friends tab does not
fix it. The web chat recovers with a page refresh, and the list also repopulates on its own
over time. Tip: enable **Start with Windows** so the app connects before you open Steam and
you won't normally see this.

</details>

<details>
<summary><strong>How do I switch Steam accounts?</strong></summary>

**Settings › Steam account › Sign out**, then sign in again.

</details>

<details>
<summary><strong>How do I close it completely?</strong></summary>

Tray icon → **Quit**. If **Start with Windows** is enabled, turn it off first or the app
will come back on reboot.

</details>

<details>
<summary><strong>How do I update?</strong></summary>

Download the new installer from the
[latest release](https://github.com/Juankyyy/steam-auto-status/releases/latest) and run it
on top of your current version: your config, token and logs are kept and you won't need to
sign in again.

</details>

<details>
<summary><strong>Does my PC need to stay on?</strong></summary>

Yes: the app must be running to update your status. Enable **Start with Windows** so it's
always there.

</details>

<details>
<summary><strong>Will this get me banned?</strong></summary>

It doesn't touch games or inject into any process: it uses Steam's normal login and presence
API (through the well-known `steam-user` library). There is nothing for VAC to look at.

</details>

<details>
<summary><strong>What languages are available?</strong></summary>

The interface ships in English and Spanish; switch it any time in **Settings › Language**
(it applies instantly to the panel, the tray menu, the tooltip and notifications). On first
run the app follows your Windows language.

</details>

## 🛠️ For developers

<details>
<summary>Project structure, building and releases</summary>

| Folder | Contents |
|---|---|
| `src-tauri/` | Desktop shell (Rust/Tauri 2): tray, window, sidecar supervision |
| `sidecar/` | Core (Node + `steam-user`): Steam session, schedule and data |
| `ui/` | Interface (React + TypeScript + Tailwind + shadcn/ui) |
| `assets/` | Visual identity and the screenshots used in this README |
| `scripts/` | Build helpers: pinned Node runtime, version bump, installer rename |

Requirements: Node.js 22 or newer and Rust (rustup) + MSVC Build Tools.

| Command | What it does |
|---|---|
| `npm install` | Installs the workspace dependencies (`ui` and `sidecar`) |
| `npm run dev` | Builds the sidecar and opens the app (Tauri + Vite, real Steam session) |
| `npm run build` | Full NSIS installer → `src-tauri/target/release/bundle/nsis/` |
| `npm run typecheck -w ui` / `-w sidecar` | Types only, no output |
| `npm run lint -w ui` | oxlint over the UI |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Checks the Rust shell |

The build downloads the official Node runtime used by the sidecar (SHA256-verified) and
renames the installer to `steam-auto-status_X.Y.Z_x64-setup.exe`.

**Releases:** push a `vX.Y.Z` tag from `main` - GitHub Actions builds everything on Windows
and publishes the release with the installer attached. Curated notes live in
[`release-notes/`](release-notes/) (English, with emojis).

Design decisions and internals are documented in [SPEC.md](SPEC.md) (Spanish), and
[AGENTS.md](AGENTS.md) covers the working conventions.

</details>

## 🤝 Contributing

Bug reports and ideas are welcome in
[Issues](https://github.com/Juankyyy/steam-auto-status/issues). If you send a change, keep
the conventions: English code, comments and commits; user-facing texts through the bilingual
dictionary in `ui/src/lib/i18n.ts`; and a look at [SPEC.md](SPEC.md) before touching
behaviour.

## 📄 License

[GPL-3.0](LICENSE) — free to use, study, share and improve.

---

<p align="center">⭐ <strong>Finding it useful?</strong> A star helps other people discover the project.</p>
