# SPEC — Steam Auto Status

> Documento de contexto y especificación del proyecto. Si estás retomando este proyecto
> (humano o agente), lee este archivo primero: contiene el objetivo, las decisiones ya
> tomadas, la arquitectura acordada y el plan de implementación.

## 1. Objetivo

Aplicación de escritorio para Windows que cambia automáticamente la presencia de Steam del
usuario entre **Invisible** y **Conectado** según un horario configurable, sin intervención
manual. Prioridad de diseño: **mínimo consumo de recursos** (pensada para estar abierta
24/7), interfaz moderna e integración con la bandeja del sistema.

- **Franja Conectado (por defecto):** lunes a viernes, **17:30 → 01:00** (cruza medianoche;
  la del viernes termina el sábado a la 01:00 — confirmado).
- **Fuera de esa franja:** Invisible. Sábado (desde 01:00) y domingo: Invisible.
- **Personalizable desde la GUI:** horario, días de la semana, pausar/activar la
  automatización, arranque con Windows, notificaciones, forzar estados y carpeta de datos.
  (Si se quiere cortar el viernes a medianoche, basta poner fin = 00:00 en ajustes.)

## 2. Por qué es posible (fundamento técnico)

1. **Steam no tiene programación nativa de estado.** No existe opción oficial en cliente,
   web ni móvil. La vía es una sesión propia adicional ("cliente fantasma") que reporta
   presencia por la cuenta.
2. **Semántica multi-sesión (unión):** Steam combina el estado de todas las sesiones de la
   cuenta. Si **alguna** sesión está en `Online`, los amigos ven "Conectado"; si **todas**
   están `Invisible`/`Offline`, los ven desconectado. (Validado: truco conocido de
   "cliente offline + app móvil online = sigo apareciendo conectado".)
3. **Consecuencia práctica:** el cliente de Steam del usuario se queda en **Invisible**
   (estado base) y la app mantiene una sesión 24/7 que dentro de la ventana se pone en
   `Online` y fuera en `Invisible`. Resultado: los amigos lo ven Conectado solo en la
   franja, incluso si el cliente está cerrado.
4. **Convivencia de sesiones:** Steam permite múltiples sesiones simultáneas (cliente +
   sesión de la app), siempre que el `logonID` no colisione. El cliente oficial lo deriva de
   la IP privada y `steam-user` usa `0` por defecto —valor compartido por todas sus
   sesiones, así que dos instancias de la app se expulsarían entre sí—, por lo que la app
   fija un **`logonID` aleatorio único por proceso** en cada logon. La app **nunca "juega"**
   nada (`gamesPlayed` no se usa), por lo que no interfiere con juegos ni VAC.
   (Observado en los logs del cliente de Steam: cada logon nuevo de la cuenta hace que el
   cliente oficial reprocese su lista de amigos; por eso el paquete de logon se mantiene
   mínimo —sin renovación de token ni sesión web por logon— y se evitan reconexiones
   innecesarias; ver §4.2.)
5. **Autenticación:** primer login interactivo en la UI con dos métodos: **código QR**
   (recomendado; `steam-session` + app móvil de Steam, sin escribir nada) o
   **usuario/contraseña** (con confirmación/aprobación desde la app móvil). El login obtiene
   un **refresh token** de plataforma `SteamClient` (JWT válido ~200 días; la app lo renueva
   de forma programada, ver §4.2, nunca durante un logon) que se guarda localmente. Los
   arranques posteriores no piden nada.

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Núcleo | **Node.js + `steam-user`** (Node v24.12.0 ya instalado), empaquetado como **sidecar** |
| Shell de escritorio | **Tauri v2 (Rust)**: bandeja nativa + ventana WebView2. Electron descartado por peso (~150–250 MB permanentes en reposo) |
| UI | **React + TypeScript + Tailwind CSS + shadcn/ui + lucide**; animaciones CSS puras (sin React Bits pesados) |
| Comunicación shell ↔ sidecar | **stdin/stdout, JSON por línea** (sin puertos abiertos, sin HTTP) |
| Datos | **`Documents\steam-auto-status\`** (ruta resuelta con la API de carpetas conocidas de Windows; configurable en ajustes) |
| Distribución | `tauri build` → **instalador NSIS `.exe`** (~60–90 MB), sin firma de código |
| Arranque con Windows | Login item con `--hidden` (arranca solo en bandeja) |
| Horario por defecto | L–V 17:30 → 01:00 |
| Zona horaria | Hora local de la máquina |
| Estado base del cliente Steam | **Invisible** (el usuario debe dejarlo así) |
| Identidad visual | Isotipo propio en SVG (`assets/icon-source.svg`); iconos de app con `tauri icon` y **icono de bandeja distinto según el estado** (punto verde Conectado / gris Invisible) |

## 4. Arquitectura

### 4.1 Vista general

```
┌─ Shell Tauri (Rust) — ~10-25 MB en reposo ───────────────────┐
│ · Bandeja: tooltip dinámico + menú (Abrir panel, Conectado   │
│   30 min, Invisible ahora, Pausar/Reanudar, Iniciar con      │
│   Windows ✓, Salir)                                          │
│ · Ventana (WebView2): UI React; se DESTRUYE al cerrar y se   │
│   recrea desde la bandeja (libera WebView2 → reposo ligero)  │
│ · Supervisa el sidecar (reinicio automático con backoff)     │
│ · Plugins: single-instance, autostart, notification          │
└─────────────┬────────────────────────────────────────────────┘
              │ IPC: stdin/stdout, JSON por línea
┌─────────────▼─ Sidecar Node + steam-user — ~50-70 MB ────────┐
│ · Sesión de Steam 24/7: login (refresh token), reconexión    │
│ · Ventana horaria + setPersona(Online|Invisible)             │
│ · Datos: config.json · auth.json · logs\  (Documents)        │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Sidecar Node (núcleo) — `sidecar/`

Lógica pura, independiente de la UI (emite eventos hacia el shell):

1. Recibe la carpeta de datos del shell (`--data-dir`) y carga `config.json`.
2. **Primer arranque:** pide login (usuario/contraseña/2FA) a través del shell → `logOn()` y
   guarda `auth.json` con el refresh token. Arranques siguientes: `logOn({ refreshToken,
   machineName, logonID: <aleatorio por proceso> })` con `renewRefreshTokens: false` y
   `webLogOn()` anulado: el logon se mantiene limpio (sin peticiones de token ni de sesión
   web) porque cada sesión nueva hace que el cliente oficial de Steam reprocese su lista de
   amigos (ver §2.4).
3. **Renovación de token programada:** cada 30 s se comprueba el JWT guardado (edad > 45
   días o caduca en < 60 días) y, si toca, se renueva con `LoginSession.renewRefreshToken()`
   —nunca durante un logon y preferiblemente con el cliente de Steam cerrado (se aplaza
   hasta 7 días si está abierto)—. Si `steam-user` emitiera `refreshToken` (flujo heredado),
   también se persiste al momento.
4. Cada **30 s**: calcular estado deseado (`Online` dentro de ventana, `Invisible` fuera).
   Si difiere del aplicado → `setPersona(EPersonaState.Online | .Invisible)`.
5. Al arrancar (PC encendido a mitad de ventana), suspensión/reanudación o reconexión:
   recalcular y aplicar de inmediato. `autoRelogin: true` para reconexiones de Steam.
6. Log con marca de hora en `logs/status.log`; rotación si crece demasiado.
7. Forzar estado (desde la UI de pruebas) con **timeout**: tras X minutos vuelve solo al
   modo automático.
8. `logout`: borra `auth.json` (botón "Cerrar sesión" en la UI).
9. **Avatar de la cuenta**: al conectar resuelve la URL del avatar (XML público del perfil
   por HTTPS; fallback: `getPersonas` sobre la propia conexión), la cachea en
   `profile.json` y la publica en el estado (`account.avatarUrl`) para la cabecera.
10. **Vigilancia de conexión:** watchdog de logon (45 s) y de reconexión automática (180 s):
    si Steam nunca responde (observado: `steam-user` reintenta en silencio y la UI se queda
    en «Conectando…» indefinidamente), se rehace la conexión con un `logonID` nuevo y
    **backoff exponencial** (5 s → 5 min; 10 min si Steam responde `RateLimitExceeded`).
    Guardas anti re-entrada y cooldown de 15 s evitan logons encadenados (p. ej. pulsar
    «Reconectar» repetidamente). El log incluye líneas `debug:` filtradas de `steam-user`
    (logon/reconexión/renovación) para diagnóstico.

**Semántica de la ventana horaria (cruza medianoche):** una ventana se define por
`(día de inicio, hora inicio, hora fin)`. Si `hora fin <= hora inicio`, termina el día
siguiente. Duración = `(fin - inicio) mod 24h` (por defecto: 7,5 h). Cálculo de "¿estoy en
ventana ahora?": comprobar si `ahora` cae en la ventana iniciada **hoy** o en la iniciada
**ayer** (ayer solo importa si su hora fin salta a hoy).

Ventanas resultantes por defecto (`days: [lun..vie]`):

- Lun 17:30 → Mar 01:00 · Mar → Mié · Mié → Jue · Jue → Vie · Vie 17:30 → Sáb 01:00

**Protocolo IPC (JSON por línea):**

- Shell → sidecar: `{ "type":"cmd", "id":"…", "method":"…", "params":{} }`
  con métodos: `getState`, `getConfig`, `setConfig`, `forceState`, `pause`, `resume`,
  `login`, `logout`, `getLogTail`, `clearLog`.
- Sidecar → shell: `{ "type":"res", "id":"…", "result":{} }` o `{ "type":"res",
  "id":"…", "error":{} }`.
- Eventos sidecar → shell: `{ "type":"event", "event":"state|log|logsCleared|connection|
  authRequired|configChanged", "data":{} }`.

### 4.3 Shell Tauri (Rust) — `src-tauri/`

- **Bandeja**: tooltip dinámico ("Conectado — Invisible a la 01:00") y menú contextual:
  Abrir panel · Conectado 30 min · Invisible ahora · Pausar/Reanudar automatización ·
  Iniciar con Windows ✓ · Salir. El **icono de la bandeja refleja la presencia**: el punto
  superior derecho del isotipo es verde con Conectado y gris (slate) con Invisible; solo se
  reemplaza cuando el estado cambia, para evitar parpadeos.
- **Ventana**: oculta por defecto (`--hidden`); se abre desde la bandeja; **se destruye al
  cerrar** (no solo se oculta) para liberar los procesos WebView2; se recrea al reabrir.
  Cerrar nunca debe terminar el proceso; "Salir" solo desde la bandeja.
- **Supervisión del sidecar**: lo lanza al arrancar y lo reinicia con backoff si cae.
- **Instancia única** (`tauri-plugin-single-instance`): abrir dos veces solo enfoca la
  existente (evita dos sesiones `steam-user` expulsándose y temporizadores duplicados).
- **Autostart** (`tauri-plugin-autostart`): registro Run con `--hidden`.
- **Notificaciones** (`tauri-plugin-notification`): toast al cambiar de estado (toggle).
- **Ajustes de sistema** (`tauri-plugin-opener` + `tauri-plugin-clipboard-manager`):
  comandos `open_data_folder` (abre la carpeta de datos en el Explorador), `open_url`
  (enlaces externos en el navegador) y `copy_text` (copia el diagnóstico al portapapeles).
- Resuelve la carpeta de Documentos del usuario (`BaseDirectory::Document`) y se la pasa al
  sidecar como `--data-dir`.

### 4.4 UI — `ui/`

Ventana ~900×620, tema oscuro por defecto, organizada en **módulos** navegables desde una
barra de navegación en la cabecera (React Router con `HashRouter`: funciona igual en el
webview de Tauri y en un futuro despliegue PWA servido como sitio estático). Objetivo a
medio plazo: que la interfaz sea instalable como **PWA**; el primer paso ha sido separar
el panel de control del módulo de ajustes. La cabecera muestra a la izquierda el isotipo
(SVG de `ui/src/assets/logo.svg`, fuente `assets/logo-glyph.svg`) junto al nombre de la app,
y a la derecha el chip de la
cuenta (avatar cuadrado con esquinas redondeadas estilo icono de iOS + nombre + punto de
estado), el badge de conexión mientras no haya cuenta, o un botón **Iniciar sesión**
cuando no existe ninguna sesión guardada. Junto al nombre de la app hay un badge con la
versión (`vX.Y.Z`, inyectada en tiempo de build desde `tauri.conf.json`; es la misma
fuente que usa «Acerca de»).

**Panel de control** (`/`): la pantalla clásica, con sus tres zonas:

1. **Estado**: "Conectado (dentro de ventana)" / "Invisible" + cuenta atrás a la próxima
   transición ("Online en 2 h 14 min" / "Invisible a la 01:00").
2. **Programación**: resumen del horario, interruptor rápido activar/pausar y enlace
   "Editar en Ajustes".
3. **Pruebas + log**: forzar Conectado / Invisible durante X minutos; log en vivo; estado de
   conexión con Steam (conectado/reintentando).
4. **Primer login** (visible cuando el sidecar emite `authRequired`):
   - **Pestaña "Código QR"** (por defecto): el sidecar abre una sesión QR con
     `steam-session` (`EAuthTokenPlatformType.SteamClient`), genera la imagen con `qrcode`
     y la expone en el estado (`qrDataUrl`). Fases: `awaiting_qr` → (escaneo)
     `awaiting_approval` → `connecting` → conectado. Caduca a los 2,5 min (`qr_expired`)
     con botón de regenerar.
   - **Pestaña "Usuario y contraseña"**: también con `steam-session`
     (`startWithCredentials`): si Steam pide confirmación desde la app móvil, el panel lo
     indica y se completa al aprobar; si pide código (email o app), aparece el campo de
     código (`submitSteamGuardCode`, con manejo de "código incorrecto → esperar 30 s").

**Ajustes** (`/settings`): configuración persistente y mantenimiento, organizada en
tarjetas:

- **Horario**: horas inicio/fin, días de la semana, resumen de la franja (día, horas y
  duración) y botón para restaurar los valores por defecto.
- **Cuenta de Steam**: cuenta conectada (nombre + SteamID), botón Reconectar, nombre de
  máquina (`machineName`) y cerrar sesión (borra el token).
- **Aplicación**: iniciar con Windows y notificaciones.
- **Datos y registros**: ruta de datos, abrir la carpeta en el Explorador, vaciar
  `status.log` y copiar un diagnóstico (versión, estado y últimas líneas del registro)
  para reportar problemas.
- **Acerca de**: versión y enlaces al repositorio, última release e issues.

Los controles de configuración que antes vivían en el panel se han movido aquí; el panel
conserva el resumen del horario y la pausa rápida.

Comunicación: `invoke` (Tauri commands) → shell → sidecar; eventos del sidecar → shell →
`emit` al webview.

### 4.5 Estructura de archivos

```
steam-auto-status/
├─ src-tauri/            # shell Rust (bandeja, ventana, IPC, plugins, iconos)
│  ├─ tauri.conf.json
│  ├─ Cargo.toml
│  ├─ icons/             # iconos generados (icons/tray/ = iconos de bandeja por estado)
│  └─ src/main.rs
├─ ui/                   # React + TS + Tailwind + shadcn/ui (Vite)
│  ├─ components.json
│  └─ src/               # incluye assets/logo.svg (isotipo de la UI)
├─ sidecar/              # núcleo Node + steam-user
│  ├─ package.json
│  └─ src/
├─ assets/               # identidad visual (fuentes y derivados, ver §4.9)
├─ package.json          # scripts raíz (dev, build)
├─ SPEC.md
└─ README.md
```

### 4.6 Datos y configuración

```
C:\Users\Juanky\Documents\steam-auto-status\
├─ config.json       ← editable a mano (horario, días, opciones)
├─ auth.json         ← refresh token + steamID (credencial de login)
├─ profile.json      ← cache del avatar de la cuenta (borrable sin riesgo)
└─ logs\
   └─ status.log
```

- Ruta por defecto resuelta con la API de carpetas conocidas de Windows (no escrita a mano:
  funciona con Documents movida o redirigida a OneDrive). Configurable en ajustes.
- El **desinstalador no borra** esta carpeta: los datos y el token sobreviven a
  reinstalaciones (actualizar sin volver a loguear).
- Botón **Cerrar sesión** en la app: borra `auth.json`.
- **Aviso OneDrive:** si Documents está sincronizada, `auth.json` subiría a la nube.
  Mitigaciones disponibles: mover solo `auth.json` a `%LOCALAPPDATA%` o excluir la carpeta
  en OneDrive.
- Las credenciales (usuario/contraseña) **no** se guardan nunca; solo el token.

Ejemplo de `config.json`:

```json
{
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "onlineFrom": "17:30",
  "onlineUntil": "01:00",
  "paused": false,
  "startWithWindows": false,
  "notifications": false,
  "machineName": "AutoStatus"
}
```

`machineName` es el nombre que reporta la sesión a Steam (visible para el propio usuario en
sus dispositivos, no para los amigos).

### 4.7 Empaquetado

- **Sidecar**: esbuild bundlea el TS → `sidecar/dist/sidecar.cjs` (+ `system.pem`, que
  `steam-crypto` lee relativo a `__dirname`; ambos los produce `sidecar/scripts/postbuild.mjs`).
- **Runtime de Node**: la app instalada ejecuta el sidecar con un `node.exe` oficial
  (v24.12.0 win-x64) que descarga `scripts/fetch-node-runtime.mjs` a `src-tauri/runtime/`
  (verifica SHA256 contra nodejs.org; la carpeta está ignorada por git). En desarrollo se
  usa el `node` del sistema.
- **Shell**: `tauri build` con target **NSIS** (instalador `.exe`, instalación por
  usuario sin admin, idiomas español/inglés). `bundle.resources` de `tauri.conf.json`
  empaqueta `runtime/node.exe`, `sidecar/sidecar.cjs`, `sidecar/system.pem` y
  `sidecar/node_modules/lzma/*` (steam-user lo exige en tiempo de ejecución y esbuild no
  puede empaquetarlo por usar `require()` dinámico). `main.rs` además limpia el prefijo
  extendido `\\?\` con que Tauri devuelve las rutas canonicalizadas, porque Node no lo
  resuelve como argumento. Sin firma de código → Windows SmartScreen
  avisará en la primera ejecución ("Editor desconocido" → Más información → Ejecutar de
  todas formas). Actualizaciones manuales (reinstalar; los datos de `Documents` se
  conservan).
- **WebView2**: ya viene preinstalado en Windows 10/11 (runtime de Edge); el instalador
  solo descarga el bootstrapper si faltara.
- **Releases**: tag `vX.Y.Z` → workflow `.github/workflows/release.yml` (GitHub Actions)
  compila en `windows-latest` y publica la release con el instalador adjunto
  (`steam-auto-status_X.Y.Z_x64-setup.exe`). La versión se inyecta desde el tag con
  `scripts/set-version.mjs` y `scripts/rename-installer.mjs` deja el nombre del artefacto
  en ese formato (el tag es la fuente de verdad).

### 4.8 Presupuesto de recursos

Medido durante el desarrollo (puede variar ligeramente):

| Estado | RAM medida |
|---|---|
| Shell Tauri (proceso principal) | ~36 MB |
| Sidecar Node + `steam-user` | ~100–120 MB |
| Ventana abierta (procesos WebView2) | ~400 MB temporales, se liberan al destruirla |

En reposo (ventana cerrada) queda shell + sidecar ≈ **140–160 MB**. En desarrollo hay
procesos extra (vite, wrappers de npm, CLI de Tauri) que no existen en la app instalada.
Electron fue descartado por mantener toda su pila (~150–250 MB) incluso minimizado.
Disco instalado estimado: ~60–90 MB.

### 4.9 Identidad visual (logo e iconos)

Isotipo propio: un anillo formado por dos arcos (azul `#64C4FD` arriba-izquierda, slate
`#6C819E` abajo-derecha), la persona en el centro y dos puntos en los huecos del anillo. El
punto superior derecho es el **indicador de estado**: verde `#4DD4A0` con Conectado, slate
con Invisible. Paleta: `#132337` (fondo), `#64C4FD`, `#4DD4A0`, `#6C819E`.

- **Fuente de verdad**: los SVG de `assets/` — `icon-source.svg` (icono de app, con
  recuadro redondeado), `icon-tray-online.svg` / `icon-tray-invisible.svg` (variantes de
  bandeja, sin recuadro y más gruesas, para que el estado se lea a 16 px) y
  `logo-glyph.svg` (isotipo sin recuadro, para superficies propias de la UI).
- **Generación**: `npm run tauri -- icon assets/icon-source.svg` rellena `src-tauri/icons/`
  (también crea `android/` e `ios/`, que no se usan en Windows y se pueden borrar). Los PNG
  de bandeja (32 px) salen de cada SVG con
  `npm run tauri -- icon <svg> -o <dir> --png 32`.
- **Iconos de bandeja incrustados**: `main.rs` los carga con `include_bytes!` desde
  `src-tauri/icons/tray/` (feature `image-png` de Tauri), así que no son `bundle.resources`.
- **Derivados versionados**: `assets/icon-source.png` (maestro 1024),
  `assets/logo-lockup.png` y `assets/logo-lockup-dark.png` (lockup horizontal con el nombre,
  tinta oscura/clara para fondos claros/oscuros) y `assets/social-preview.png` (vista previa
  del repositorio, 1280×640; se sube a mano en los ajustes de GitHub).
- **README**: usa el icono (`assets/icon-source.png`) centrado y el nombre como titular, que
  se ve nítido en cualquier pantalla y en tema claro y oscuro.

## 5. Limitaciones conocidas

1. **PC apagado ⇒ sin cambio.** La app solo actúa si el PC está encendido con internet en
   ese momento. Si se quisiera independencia del PC, el sidecar valdría tal cual en un
   VPS/Raspberry.
2. **No puede forzar Invisible** fuera de la ventana si otra sesión del usuario está
   `Online` (cliente con estado Conectado, jugando, app móvil, web…). La app solo *añade*
   presencia; el usuario debe mantener su cliente en Invisible como base.
3. **Si el usuario está jugando**, según el estado de su cliente puede aparecer "jugando";
   eso es comportamiento de Steam, ajeno a esta app.
4. **Toolchain de desarrollo**: requiere Rust (rustup) + MSVC Build Tools (~2–3 GB la
   primera vez), solo en la máquina de desarrollo. En la máquina final no hace falta nada
   (Node va empaquetado en el sidecar y WebView2 ya está).
5. **ToS:** automatizar la presencia de la propia cuenta es zona gris del Steam Subscriber
   Agreement (cláusula de automatización), pero es práctica extendida y de riesgo bajo al
   no interactuar con juegos/comunidad. Decisión y responsabilidad del usuario.
6. Primer login requiere el código 2FA una vez. Si el token caduca (p. ej. PC apagado
   >200 días), la app pedirá login otra vez (lo indicará en la UI y el log).
7. **El cliente oficial de Steam puede recargar (o dejar vacía) su lista de amigos** cada vez
   que la cuenta recibe una sesión nueva —comportamiento del propio cliente, verificado en
   sus logs, ajeno a esta app—. La app mantiene el paquete de logon mínimo y minimiza las
   (re)conexiones para que ocurra lo menos posible; si la lista quedara vacía, se recupera
   reabriendo el panel de amigos, alternando el estado o reiniciando el cliente.

## 7. Cómo verificar que funciona

1. `npm install` y `tauri dev`; abrir el panel desde la bandeja; primer login en el
   formulario (pide 2FA una sola vez).
2. Usar "Forzar Conectado" y pedir a un amigo (o cuenta alt) que confirme que aparece
   Conectado; luego "Forzar Invisible" y confirmar que aparece desconectado (con el cliente
   de Steam del usuario en Invisible o cerrado).
3. Dejar el modo automático y comprobar en el log/UI que los cambios ocurren a las 17:30
   y a la 01:00.
4. Comprobar que al cerrar la ventana los procesos WebView2 desaparecen y el consumo en
   reposo baja al rango esperado (~60–95 MB).
5. Activar "Iniciar con Windows", reiniciar el PC y comprobar que arranca minimizada en
   bandeja y aplica el estado correcto.
6. Generar el instalador (`tauri build`), instalarlo y verificar que los datos de
   `Documents\steam-auto-status\` se conservan y todo sigue funcionando.

## 8. Entorno

- Máquina: Windows (win32). Workspace: `C:\Users\Juanky\Documents\code\projects\steam-auto-status`
- Node.js v24.12.0 · npm 11.6.2 · Python 3.12.10 · git 2.52.0
- GitHub CLI (`gh`) para la gestión del repositorio
- Repositorio remoto: `steam-auto-status` (rama `main`); los datos de la app viven en
  `Documents` y **nunca** en el repo (`.gitignore` excluye datos y token)
- Toolchain de desarrollo instalada: rustup + MSVC Build Tools (ya operativos); la Tauri
  CLI llega con la devDependency `@tauri-apps/cli` (`npm run tauri`)

## 9. Flujo de trabajo (acordado con el usuario)

- Todo el trabajo nuevo se hace en la rama **`dev`**; `main` permanece estable.
- **Nada se commitea por iniciativa del agente**: propone el mensaje y espera el OK. «Haz
  los commits» significa commitear **y subir a `dev`** (el trabajo no se queda solo en
  local); el merge a `main` y los releases se hacen solo cuando el usuario lo pide, tras
  verificar el bloque en su máquina.
- **Paso a paso:** No generes toda la app de golpe. Espera a que el usuario pida módulos específicos
- **Comentarios:** Documenta las partes complejas
- **Releases:** el usuario decide la versión (major/minor/patch a su criterio) y se corta
  el tag `vX.Y.Z` desde `main`. GitHub Actions compila y publica la release con el
  instalador adjunto (`.github/workflows/release.yml`); el tag es la fuente de verdad de
  la versión. Notas de la release: si existe `release-notes/vX.Y.Z.md` se usa tal cual;
  si no, el workflow las autogenera desde los commits convencionales (`feat:`, `fix:`…)
  desde el tag anterior.
- **Idioma**: todo en **inglés** — código (incluidos comentarios), commits y release notes.
- **Título de la release**: `vX.Y.Z - The <Tema> Update`, donde `<Tema>` resume en inglés
  lo más importante de la release (Title Case; el título siempre termina en "Update"). La
  fuente es la primera línea de `release-notes/vX.Y.Z.md`, un comentario HTML oculto con el
  formato `<!-- title: vX.Y.Z - The <Tema> Update -->` que el workflow lee para titular la
  release; si falta, el título por defecto es `Steam Auto Status vX.Y.Z`.
- **Estilo de las release notes**: en inglés, con emojis **en los títulos de sección** y
  formato amigable. Estructura: (1) contexto breve de la actualización; (2) sección
  destacada `## <emoji> <título descriptivo>` con lo más importante, relacionada con el
  `<Tema>` del título pero sin repetirlo (p. ej. "The Settings Update" → "⚙️ Settings
  module"), seguida de un párrafo y bullets `- **Nombre**: descripción`; (3) `## ✨ What's
  new` con el resto de novedades. Instalación, datos, requisitos y actualización viven en
  el README, no en las notas. El cuerpo publicado en GitHub debe ser igual a
  `release-notes/vX.Y.Z.md`.
- **Aviso previo**: no se hacen commits ni pushes sin previo aviso al usuario.
