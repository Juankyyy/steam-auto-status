# AGENTS.md — Steam Auto Status

Guía operativa para agentes de código. Está en español (como SPEC.md); el código, los
comentarios, los commits y las notas de release van en inglés.

> **Lee SPEC.md antes de trabajar.** Es la fuente de verdad de producto y diseño (objetivo,
> decisiones, arquitectura, protocolo IPC, datos, empaquetado y flujo de trabajo). Este
> archivo solo añade lo operativo: cómo trabajar aquí sin romper nada. No dupliques SPEC.md:
> si algo cambia, actualízalo allí (ver «Flujo de trabajo»).

## Qué es este proyecto

App de escritorio para Windows, de bandeja, pensada para estar abierta 24/7 con consumo
mínimo. **No inicia sesión ni guarda credenciales**: calcula el horario y le pide al cliente
oficial de Steam que ya está abierto que cambie su propia presencia entre **Online** e
**Invisible** con los comandos locales `steam://friends/status/*`. Requiere Steam abierto y
con sesión iniciada; si está cerrado, el estado ya es Offline. Dos piezas:

- `ui/` — React 19 + TypeScript + Tailwind v4 + shadcn/ui (Vite), dentro del webview.
- `src-tauri/` — App Tauri v2 (Rust): bandeja, ventana, plugins y **núcleo** (horario,
  configuración, logs, pausa/force y control del cliente local). La UI habla con el núcleo
  por comandos y eventos Tauri; no hay proceso Node en tiempo de ejecución.

## Mapa del repo

| Ruta | Contenido |
|---|---|
| `ui/src/pages/` | Pantallas: `Dashboard.tsx` (`/`) y `Settings.tsx` (`/settings`). |
| `ui/src/components/` | Componentes (estado, pruebas, cliente de Steam, tarjetas de ajustes) y `ui/` con las piezas shadcn. |
| `ui/src/lib/` | Cliente del shell (`tauri.ts`: comandos, eventos y `AppState`), contexto de la app, utilidades de horario y diagnóstico. |
| `src-tauri/src/main.rs` | Shell Rust: bandeja, ventana, comandos Tauri, plugins y puente con el núcleo. |
| `src-tauri/src/core.rs` | Núcleo: estado, temporizadores, pausa/force, comandos y eventos para la UI. |
| `src-tauri/src/config.rs` | Configuración: defaults, migración, sanitizado y persistencia de `config.json`. |
| `src-tauri/src/schedule.rs` | Ventana horaria y próxima transición (hora local, cruza medianoche). |
| `src-tauri/src/logging.rs` | `logs/status.log`: rotación, cola para la UI y vaciado. |
| `src-tauri/src/steam.rs` | `Persona`, detección de `steam.exe` con Toolhelp y envío con `ShellExecuteW`. |
| `src-tauri/tauri.conf.json` | Configuración Tauri: ventana, permisos y versión (fuente de verdad). |
| `scripts/` | `set-version.mjs` (tag → versión) y `rename-installer.mjs`. |
| `assets/` | Identidad visual: SVG maestro del icono (`icon-source.svg`), variantes de bandeja por estado, lockup y social preview; `screenshots/` con las capturas del README. |
| `.github/workflows/release.yml` | Release por tag `vX.Y.Z`: compila en `windows-latest` y publica el instalador. |

## Entorno

- Windows + PowerShell. Node.js 24 (solo tooling de la UI; el runtime de la app es Rust).
  Rust (rustup + MSVC Build Tools) instalado; la Tauri CLI viene con `@tauri-apps/cli`
  (`npm run tauri`).
- Hay tests unitarios del núcleo (`cargo test`); la verificación en vivo con Steam
  (SPEC §7) la hace el usuario.
- Los datos reales viven en `Documents\steam-auto-status\` (fuera del repo; ver «Datos y
  trampas conocidas»).
- Fin de línea LF (`.gitattributes`).

## Comandos

| Comando | Para qué |
|---|---|
| `npm install` | Dependencias del workspace `ui`. |
| `npm run dev` | Abre `tauri dev` (Vite + app Rust). Controla el cliente de Steam real (puede cambiar la presencia). |
| `npm run build` | Instalador NSIS completo → `src-tauri/target/release/bundle/nsis/`. |
| `npm run build:ui` | UI: `tsc -b` + `vite build` (typecheck + build). |
| `npm run typecheck -w ui` | Solo comprobación de tipos (sin emitir). |
| `npm run lint -w ui` | oxlint sobre la UI. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Comprobación del núcleo/shell Rust. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Tests unitarios de config y horario. |

Puedes arrancar `npm run dev` cuando lo necesites (controla el cliente de Steam real: puede
cambiar la presencia del usuario). No hay sidecar ni proceso Node que depurar: el núcleo vive
en `src-tauri/src/core.rs` y escribe en `logs\status.log`.

## Verificación antes de dar algo por terminado

Ejecuta lo que aplique a lo tocado; no lo omitas:

- **UI**: `npm run build:ui` y `npm run lint -w ui`.
- **Rust**: `cargo check --manifest-path src-tauri/Cargo.toml` y `cargo test --manifest-path src-tauri/Cargo.toml`.
- **Empaquetado**: `npm run build` (instalador NSIS sin recursos extra).
- **Comportamiento con Steam**: pide al usuario que lo pruebe en vivo (SPEC §7); tú no
  puedes validar la presencia real.

## Convenciones

- **Idioma**: código, comentarios, mensajes de commit, notas de release y **logs/diagnóstico**
  en **inglés**; la UI está **localizada (es/en)** con el diccionario de
  `ui/src/lib/i18n.ts` (`es` define los tipos: toda clave nueva necesita su `en`, o falla el
  build); el idioma activo vive en `config.json` (`language`) y lo siguen interfaz, bandeja,
  tooltip y notificaciones; SPEC.md y AGENTS.md en español.
- **Commits**: convencionales, en inglés, con scope (`feat(ui): …`, `fix(core): …`,
  `docs(spec): …`, `chore`, `ci`, `refactor`).
- **UI**: Tailwind v4 con los tokens de `ui/src/index.css` (no colores sueltos), shadcn/ui +
  lucide, alias `@/`. La versión de la app se inyecta en build (`__APP_VERSION__` desde
  `tauri.conf.json`). Textos visibles siempre con `useI18n()`/`t()` (nunca strings sueltos
  en componentes) y horas/duraciones con los helpers de `lib/i18n.ts`.
- **Núcleo Rust**: el horario, la config, los logs, los temporizadores y el control de Steam
  viven en `src-tauri/src/` (`core.rs`, `config.rs`, `schedule.rs`, `logging.rs`, `steam.rs`).
  La UI no cambia: se conservan el comando `sidecar_command` y el evento `sidecar-message`,
  pero ya no hay proceso ni stdin/stdout. Al tocar el contrato, mantén en sincronía
  `ui/src/lib/tauri.ts`, `core.rs` y el estado que emite.
- **Contrato IPC** (detalle en SPEC §4.2): comandos `getState`, `getConfig`, `setConfig`,
  `forceState`, `clearForce`, `pause`, `resume`, `reapply`, `deleteLegacyData`,
  `getLogTail`, `clearLog`; eventos `state`, `log`, `logsCleared`, `configChanged` y
  `notify`.
- **Rust**: no cambies las reglas de bandeja/ventana sin actualizar SPEC (la ventana se
  destruye al cerrar, instancia única, temporizadores del núcleo). La detección de Steam usa
  Toolhelp y el envío usa `ShellExecuteW`; no vuelvas a introducir `cmd` ni un sidecar.
- **Dependencias**: puedes añadir una si es necesaria, pero el objetivo es consumo mínimo:
  justifícala en el resumen final (peso y por qué no vale una alternativa sin dependencia).

## Flujo de trabajo (acordado con el usuario)

1. Todo el trabajo nuevo en la rama `dev`; `main` permanece estable.
2. **Paso a paso**: espera a que el usuario pida módulos o cambios concretos; no generes la
   app entera de golpe. Al terminar, indica qué debe probar el usuario.
3. **Aviso previo**: no se hacen commits ni pushes sin avisar antes. Propón el mensaje y
   espera el OK. «Haz los commits» autoriza commit **y push a `dev`** a la vez: el trabajo
   nunca se queda solo en local.
4. **`main` y releases, solo a petición**: el merge a `main` y los tags se hacen únicamente
   cuando el usuario lo pide, tras verificar el bloque/funcionalidad en su máquina.
5. **Releases**: el usuario decide la versión; el tag `vX.Y.Z` se corta desde `main` y
   GitHub Actions publica el instalador con notas autogeneradas (SPEC §9). Las notas
   curadas viven solo en local (`release-notes/`, ignorado por git) y se aplican después
   con `gh release edit --notes-file`.
6. **Documentación como parte del cambio**: actualiza SPEC.md si cambia el comportamiento o
   la arquitectura, y README.md si el cambio es visible para el usuario.

## Datos y trampas conocidas

- Datos de la app en `Documents\steam-auto-status\` (ruta configurable; nunca en el repo).
  Se pueden leer y editar `config.json` y los logs para reproducir casos. `auth.json`,
  `profile.json` y `steam-data/` son **restos de la versión antigua con login**: la app ya no
  los lee ni los escribe, y los agentes no deben tocarlos. El usuario puede borrarlos desde
  Ajustes › Cliente de Steam (con confirmación).
- **Notas curadas**: `release-notes/` existe solo en local (`.gitignore`); no se sube al
  remoto. Tras publicar CI, se aplican al release con
  `gh release edit vX.Y.Z --notes-file release-notes/vX.Y.Z.md` (SPEC §9).
- **Empaquetado**: el instalador contiene solo el ejecutable Rust; ya no hay sidecar,
  `runtime/node.exe`, `system.pem` ni recursos extra. `tauri.conf.json` no declara
  `bundle.resources`.
- **Detección y envío**: `steam.rs` usa Toolhelp (`steam.exe`) y `ShellExecuteW` para las URLs
  `steam://friends/status/*`; `open_steam` usa el mismo camino con `steam://open/main`. El
  envío corre en un hilo con timeout de 2 s para que un shell lento no congele el núcleo.
- **Versión**: fuente de verdad `tauri.conf.json`; `set-version.mjs` la escribe también en
  `src-tauri/Cargo.toml`.
- **OneDrive**: si `Documents` está sincronizada, los restos antiguos (`auth.json`) pueden
  seguir en la nube; menciónalo al usuario si diagnostica algo raro.
