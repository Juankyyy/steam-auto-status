# AGENTS.md — Steam Auto Status

Guía operativa para agentes de código. Está en español (como SPEC.md); el código, los
comentarios, los commits y las notas de release van en inglés.

> **Lee SPEC.md antes de trabajar.** Es la fuente de verdad de producto y diseño (objetivo,
> decisiones, arquitectura, protocolo IPC, datos, empaquetado y flujo de trabajo). Este
> archivo solo añade lo operativo: cómo trabajar aquí sin romper nada. No dupliques SPEC.md:
> si algo cambia, actualízalo allí (ver «Flujo de trabajo»).

## Qué es este proyecto

App de escritorio para Windows, de bandeja, pensada para estar abierta 24/7 con consumo
mínimo. Mantiene una sesión propia de Steam («cliente fantasma») que pone la presencia en
**Online** durante el horario configurado e **Invisible** fuera de él; el cliente normal del
usuario se queda en Invisible como base. Tres piezas:

- `ui/` — React 19 + TypeScript + Tailwind v4 + shadcn/ui (Vite), dentro del webview.
- `sidecar/` — Node + `steam-user`/`steam-session`: login, horario y cambio de estado. Habla
  con el shell por stdin/stdout en JSON de una línea.
- `src-tauri/` — Shell Tauri v2 (Rust): bandeja, ventana, supervisión del sidecar, plugins.

## Mapa del repo

| Ruta | Contenido |
|---|---|
| `ui/src/pages/` | Pantallas: `Dashboard.tsx` (`/`) y `Settings.tsx` (`/settings`). |
| `ui/src/components/` | Componentes (estado, pruebas, login, tarjetas de ajustes) y `ui/` con las piezas shadcn. |
| `ui/src/lib/` | Cliente del shell (`tauri.ts`: comandos, eventos y `AppState`), contexto de la app, utilidades de horario y diagnóstico. |
| `sidecar/src/index.ts` | Todo el núcleo Node (hoy en un solo archivo): config, IPC, login, ventana horaria y logs. |
| `src-tauri/src/main.rs` | Todo el shell Rust: bandeja, ventana, comandos, supervisión del sidecar y limpieza de rutas. |
| `src-tauri/tauri.conf.json` | Configuración Tauri: ventana, permisos, `bundle.resources` y versión (fuente de verdad). |
| `scripts/` | `fetch-node-runtime.mjs` (runtime de Node pineado), `set-version.mjs` (tag → versión), `rename-installer.mjs`. |
| `assets/` | Identidad visual: SVG maestro del icono (`icon-source.svg`), variantes de bandeja por estado, lockup y social preview. |
| `sidecar/scripts/postbuild.mjs` | Copia `system.pem` junto al bundle (steam-crypto lo lee relativo a `__dirname`). |
| `release-notes/` | Notas curadas por versión; convención en su `README.md`. |
| `.github/workflows/release.yml` | Release por tag `vX.Y.Z`: compila en `windows-latest` y publica el instalador. |

## Entorno

- Windows + PowerShell. Node.js 24 (workspaces npm en la raíz). Rust (rustup + MSVC Build
  Tools) instalado; la Tauri CLI viene con `@tauri-apps/cli` (`npm run tauri`).
- No hay tests automatizados: la verificación en vivo (SPEC §7) la hace el usuario.
- Los datos reales viven en `Documents\steam-auto-status\` (fuera del repo; ver «Datos y
  trampas conocidas»).
- Fin de línea LF (`.gitattributes`).

## Comandos

| Comando | Para qué |
|---|---|
| `npm install` | Dependencias (workspaces `ui` y `sidecar`). |
| `npm run dev` | Bundlea el sidecar, asegura el runtime y abre `tauri dev`. Usa la sesión real de Steam. |
| `npm run build` | Instalador NSIS completo → `src-tauri/target/release/bundle/nsis/`. |
| `npm run build:ui` | UI: `tsc -b` + `vite build` (typecheck + build). |
| `npm run build:sidecar` | Sidecar: bundle esbuild → `sidecar/dist/sidecar.cjs` + `system.pem`. |
| `npm run typecheck -w ui` / `-w sidecar` | Solo comprobación de tipos (sin emitir). |
| `npm run lint -w ui` | oxlint sobre la UI. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Comprobación del shell Rust. |

Puedes arrancar `npm run dev` cuando lo necesites (usa la sesión real: puede cambiar la
presencia del usuario). Para depurar el sidecar solo, tras `npm run build:sidecar`:
`node sidecar/dist/sidecar.cjs --data-dir <carpeta>` (habla JSON por stdin/stdout); no lo
ejecutes a la vez que la app: dos sesiones con el mismo `logonID` pueden expulsarse entre sí.

## Verificación antes de dar algo por terminado

Ejecuta lo que aplique a lo tocado; no lo omitas:

- **UI**: `npm run build:ui` y `npm run lint -w ui`.
- **Sidecar**: `npm run typecheck -w sidecar` y `npm run build:sidecar` (el bundle detecta
  imports que `tsc` no ve).
- **Rust**: `cargo check --manifest-path src-tauri/Cargo.toml`.
- **Comportamiento con Steam**: pide al usuario que lo pruebe en vivo (SPEC §7); tú no
  puedes validar la presencia real.

## Convenciones

- **Idioma**: código, comentarios, mensajes de commit, notas de release y **logs/diagnóstico**
  en **inglés**; la UI está **localizada (es/en)** con el diccionario de
  `ui/src/lib/i18n.ts` (`es` define los tipos: toda clave nueva necesita su `en`, o falla el
  build); el idioma activo vive en `config.json` (`language`) y lo siguen interfaz, bandeja,
  tooltip y notificaciones; SPEC.md y AGENTS.md en español.
- **Commits**: convencionales, en inglés, con scope (`feat(ui): …`, `fix(sidecar): …`,
  `docs(spec): …`, `chore`, `ci`, `refactor`).
- **UI**: Tailwind v4 con los tokens de `ui/src/index.css` (no colores sueltos), shadcn/ui +
  lucide, alias `@/`. La versión de la app se inyecta en build (`__APP_VERSION__` desde
  `tauri.conf.json`). Textos visibles siempre con `useI18n()`/`t()` (nunca strings sueltos
  en componentes) y horas/duraciones con los helpers de `lib/i18n.ts`.
- **Sidecar**: bundle único con esbuild; evita `require()` dinámicos nuevos. `stdout` es el
  canal IPC (JSON por línea): para trazas usa `log()`, **nunca `console.log`** (rompería el
  protocolo). Al tocar el contrato IPC, mantén en sincronía `ui/src/lib/tauri.ts` y el
  estado que emite el sidecar.
- **Contrato IPC** (detalle en SPEC §4.2): comandos `getState`, `getConfig`, `setConfig`,
  `forceState`, `pause`, `resume`, `login`, `logout`, `getLogTail`, `clearLog`; eventos
  `state`, `log`, `logsCleared`, `connection`, `authRequired`, `configChanged`.
- **Rust**: no cambies las reglas de bandeja/ventana sin actualizar SPEC (la ventana se
  destruye al cerrar, instancia única, supervisión con backoff del sidecar).
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
   GitHub Actions publica el instalador (SPEC §9 y `release-notes/README.md`).
6. **Documentación como parte del cambio**: actualiza SPEC.md si cambia el comportamiento o
   la arquitectura, y README.md si el cambio es visible para el usuario.

## Datos y trampas conocidas

- Datos de la app en `Documents\steam-auto-status\` (ruta configurable; nunca en el repo).
  Se pueden leer y editar `config.json` y los logs para reproducir casos; **`auth.json` es
  intocable** (nunca editar, borrar ni commitear). El shell persiste el stderr del sidecar
  en `logs\sidecar-stderr.log`.
- **Rutas extendidas**: Tauri devuelve rutas canonicalizadas con prefijo `\\?\`; `main.rs`
  ya las limpia porque Node no las resuelve como argumento.
- **Empaquetado**: `system.pem` va junto a `sidecar.cjs`; `sidecar/node_modules/lzma/*`
  debe seguir en `bundle.resources` de `tauri.conf.json` (steam-user lo exige con
  `require()` dinámico). Cualquier dependencia con carga dinámica necesita lo mismo.
- **Runtime de Node**: pineado y verificado por SHA256 en `scripts/fetch-node-runtime.mjs`
  (hoy v24.12.0 win-x64); no lo subas sin actualizar el hash.
- **Versión**: fuente de verdad `tauri.conf.json`; `set-version.mjs` la escribe también en
  `src-tauri/Cargo.toml`.
- **OneDrive**: si `Documents` está sincronizada, `auth.json` sube a la nube; menciónalo al
  usuario si diagnostica algo raro.
