# Steam Auto Status

Desktop application for Windows that automatically switches your Steam status between
**Invisible** and **Online** on a configurable schedule (default: Monday to Friday,
17:30 → 01:00).

- Designed to stay open 24/7 with minimal resource usage: [Tauri](https://tauri.app) shell +
  Node (`steam-user`) core running as a sidecar (~60–95 MB RAM idle).
- System tray icon and a modern UI (React + TypeScript + Tailwind + shadcn/ui).
- Everything configurable from the app: schedule, days, pause, start with Windows,
  notifications and data folder.

**Status:** in development. Full design, decisions and plan live in [SPEC.md](SPEC.md).

## Structure

| Folder | Contents |
|---|---|
| `src-tauri/` | Desktop shell (Rust/Tauri): tray, window, sidecar supervision |
| `sidecar/` | Core (Node + `steam-user`): Steam session, schedules, data |
| `ui/` | Interface (React + TypeScript + Tailwind + shadcn/ui) |

## Requirements (development)

- Node.js 20+
- Rust (rustup) + MSVC Build Tools
- Windows 10/11 with WebView2 (preinstalled)

## Building the installer

```sh
npm run build
```

Downloads the official Node runtime used by the sidecar (`scripts/fetch-node-runtime.mjs`,
SHA256-verified) and produces the NSIS installer at
`src-tauri/target/release/bundle/nsis/`. The build renames it to
`steam-auto-status_X.Y.Z_x64-setup.exe` (lowercase, no spaces — the release asset format)
with `scripts/rename-installer.mjs`.

## Releases

Push a `vX.Y.Z` tag from `main`: GitHub Actions compiles the app on Windows and publishes
a release with the installer attached (`steam-auto-status_X.Y.Z_x64-setup.exe`). The tag
is the single source of truth for the version.
