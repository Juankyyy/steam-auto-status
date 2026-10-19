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
   web ni móvil.
2. **El cliente oficial entiende comandos locales de estado.** Su propio menú Amigos →
   Estado usa `steam://friends/status/online`, `.../away`, `.../invisible` y `.../offline`.
   Son URLs del protocolo `steam://`, documentadas por Valve y atendidas por el cliente que
   ya está ejecutándose.
3. **La app no crea una sesión:** envía al cliente local el mismo cambio que haría el usuario
   con el menú. No hay login, token, QR ni segunda sesión; la app ni siquiera conoce la
   cuenta.
4. **Consecuencia práctica:** dentro de la ventana la app pide `Online`; fuera, `Invisible`.
   Si Steam está cerrado, la cuenta ya está Offline y la app no puede hacer nada hasta que el
   cliente vuelva a abrirse y a iniciar sesión.
5. **Riesgo:** al no abrir sesiones adicionales se elimina el patrón de logons/reconexiones
   que Steam puede marcar como actividad sospechosa. Sigue siendo automatización de la
   propia cuenta (zona gris del ToS), pero mucho menos invasiva.

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Núcleo | **Rust dentro de la app Tauri** (`src-tauri/src/`): horario, config, logs y control del cliente local; sin sidecar ni runtime de Node. Usa `chrono` y `windows-sys` (Toolhelp + ShellExecuteW) |
| Shell de escritorio | **Tauri v2 (Rust)**: bandeja nativa + ventana WebView2. Electron descartado por peso (~150–250 MB permanentes en reposo) |
| UI | **React + TypeScript + Tailwind CSS + shadcn/ui + lucide**; animaciones CSS puras (sin React Bits pesados) |
| Comunicación UI ↔ núcleo | **Comandos y eventos Tauri**; se conservan los nombres `sidecar_command` y `sidecar-message` por compatibilidad con la UI, pero ya no hay proceso ni stdin/stdout |
| Datos | **`Documents\steam-auto-status\`** (ruta resuelta con la API de carpetas conocidas de Windows; configurable en ajustes) |
| Distribución | `tauri build` → **instalador NSIS `.exe`** (~2,5 MB; ~12 MB instalado), sin firma de código |
| Arranque con Windows | Login item con `--hidden` (arranca solo en bandeja) |
| Horario por defecto | L–V 17:30 → 01:00 |
| Zona horaria | Hora local de la máquina |
| Idioma de la UI | **Español/English** (`language` en `config.json`); primer arranque: idioma de Windows (es → Español, resto → English). Bandeja, tooltip y notificaciones siguen el mismo ajuste |
| Presencia | El cliente oficial debe estar **abierto y con sesión iniciada**; la app le pide `Online`/`Invisible`. Nunca usa `Offline` |
| Identidad visual | Isotipo propio en SVG (`assets/icon-source.svg`); iconos de app con `tauri icon` y **icono de bandeja distinto según el estado** (punto verde Conectado / gris Invisible o Steam cerrado) |

## 4. Arquitectura

### 4.1 Vista general

```
┌─ App Tauri (Rust) — ~35 MB en reposo ────────────────────────┐
│ · Bandeja: tooltip dinámico + menú (Abrir panel, Conectado   │
│   30 min, Invisible ahora, Pausar/Reanudar, Iniciar con      │
│   Windows ✓, Salir)                                          │
│ · Ventana (WebView2): UI React; se DESTRUYE al cerrar y se   │
│   recrea desde la bandeja (libera WebView2 → reposo ligero)  │
│ · Núcleo en proceso: horario, config, logs, pausa/force      │
│ · Detecta steam.exe (Toolhelp) y envía la URL (ShellExecuteW)│
│ · Comando «Abrir Steam» (steam://open/main)                  │
│ · Datos: config.json · logs\  (Documents)                    │
│ · Plugins: single-instance, autostart, notification          │
└─────────────┬────────────────────────────────────────────────┘
              │ comando local (ShellExecuteW)
┌─────────────▼─ Cliente de Steam (ya abierto) ────────────────┐
│ · Sesión normal del usuario; cambia su propia presencia      │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Núcleo Rust — `src-tauri/src/`

El horario, la configuración, los logs y el control del cliente local viven dentro de la
app, en módulos Rust: `core.rs` (estado, temporizadores y comandos), `config.rs`,
`schedule.rs`, `logging.rs` y `steam.rs`. La UI no cambia: sigue invocando
`sidecar_command` y escuchando `sidecar-message`, pero ya no hay proceso ni IPC por
stdin/stdout.

1. Carga `config.json` de la carpeta de datos y lo mantiene en memoria.
2. Cada **30 s**: calcula el estado deseado (`Online` dentro de ventana, `Invisible` fuera;
   un `forceState` activo manda). Si difiere del último aplicado, lo envía al cliente.
3. **Control del cliente local** (`steam.rs`):
   - `is_running()` recorre la lista de procesos con **Toolhelp**
     (`CreateToolhelp32Snapshot`) y busca `steam.exe`, sin lanzar `tasklist`.
   - `send_persona()` envía `steam://friends/status/online|invisible` con
     **`ShellExecuteW`**, sin `cmd` ni ventana de consola. El envío corre en un hilo con
     timeout de 2 s para que un shell lento no congele el núcleo. Comprueba el proceso justo
     antes de enviar para no lanzar Steam sin querer.
4. **Detección de Steam cada 10 s.** Al arrancar el cliente se espera 10 s y se aplica el
   estado; se reintenta a los 40 s y 90 s por si el auto-login tarda. Al cerrarse Steam se
   limpia el estado aplicado (`persona = null`) y la UI muestra «Steam cerrado».
5. Al arrancar la app (PC encendido a mitad de ventana), al reanudar la app o al cambiar el
   horario: recalcular y aplicar de inmediato.
6. **Pausa:** deja de enviar cambios y conserva el estado actual; «Reaplicar» sigue
   funcionando porque es una acción manual. **Reanudar:** aplica el horario de inmediato.
   **Force:** se aplica aunque esté pausado y, al expirar, vuelve al horario si no está
   pausado.
7. Log con marca de hora en `logs/status.log`; rotación si crece demasiado.
8. **Limpieza de restos antiguos:** si existen `auth.json`, `profile.json` o `steam-data/`,
   el estado expone `legacyDataPresent`. El comando `deleteLegacyData` (solo con confirmación
   del usuario) borra esos restos, nunca `config.json` ni `logs/`.
9. **Idioma:** los pocos textos que produce el núcleo (tooltip de bandeja, notificaciones)
   siguen `config.language` (diccionario propio es/en); el resto del estado va sin texto
   pre-renderizado y la UI compone sus etiquetas. El log (`status.log`) es **siempre en
   inglés**: es diagnóstico técnico, no interfaz.

**Comportamiento ante errores:** el comando local no devuelve confirmación de que Steam lo
haya aplicado. La UI muestra el **último comando enviado** y el estado del proceso, no un
estado «real» garantizado. Si Steam está en modo Offline, en la pantalla de login o corriendo
como administrador, el comando puede ignorarse; el log lo registra y el botón «Reaplicar»
permite reintentar. La app tampoco lee la presencia real: si el usuario cambia el estado a
mano, no se corrige hasta la próxima transición, el siguiente arranque de la app o de Steam,
o «Reaplicar»; no hay reaplicación periódica para no pelearse con un cambio manual.

**Semántica de la ventana horaria (cruza medianoche):** una ventana se define por
`(día de inicio, hora inicio, hora fin)`. Si `hora fin <= hora inicio`, termina el día
siguiente. Duración = `(fin - inicio) mod 24h` (por defecto: 7,5 h). Cálculo de "¿estoy en
ventana ahora?": comprobar si `ahora` cae en la ventana iniciada **hoy** o en la iniciada
**ayer** (ayer solo importa si su hora fin salta a hoy).

Ventanas resultantes por defecto (`days: [lun..vie]`):

- Lun 17:30 → Mar 01:00 · Mar → Mié · Mié → Jue · Jue → Vie · Vie 17:30 → Sáb 01:00

**Contrato UI ↔ núcleo:** se conservan los nombres del sidecar para no tocar la UI.

- Comandos (`invoke('sidecar_command')`): `getState`, `getConfig`, `setConfig`,
  `forceState`, `clearForce`, `pause`, `resume`, `reapply`, `deleteLegacyData`,
  `getLogTail`, `clearLog`.
- Respuestas: `{ "type":"res", "result":{} }` o `{ "type":"res", "error":"…" }` (evento
  `sidecar-message`).
- Eventos: `{ "type":"event", "event":"state|log|logsCleared|configChanged|notify",
  "data":{} }`.

### 4.3 Shell Tauri (Rust) — `src-tauri/`

- **Bandeja**: tooltip dinámico ("Steam Auto Status — Invisible (Conectado a las 17:30)",
  en el idioma configurado) y menú contextual: Abrir panel · Conectado 30 min · Invisible
  ahora · Pausar/Reanudar automatización · Iniciar con Windows ✓ · Salir. Las etiquetas del
  menú viven en el shell (`TrayLabels`, es/en) y se **reconstruye el menú** cuando cambia
  `config.language`, conservando los checkmarks. El **icono de la bandeja refleja la
  presencia**: el punto superior derecho del isotipo es verde con Conectado y Steam abierto,
  y gris (slate) con Invisible o Steam cerrado; solo se reemplaza cuando el estado cambia,
  para evitar parpadeos.
- **Ventana**: oculta por defecto (`--hidden`); se abre desde la bandeja; **se destruye al
  cerrar** (no solo se oculta) para liberar los procesos WebView2; se recrea al reabrir.
  Cerrar nunca debe terminar el proceso; "Salir" solo desde la bandeja.
- **Núcleo en proceso**: `main.rs` arranca el `Core` (hilos de detección cada 10 s,
  reevaluación cada 30 s y reintentos de arranque de Steam). No hay sidecar ni supervisor
  que reiniciar; un fallo del núcleo sería un fallo de la app.
- **Instancia única** (`tauri-plugin-single-instance`): abrir dos veces solo enfoca la
  existente (evita dos núcleos enviando comandos y temporizadores duplicados).
- **Autostart** (`tauri-plugin-autostart`): registro Run con `--hidden`.
- **Notificaciones** (`tauri-plugin-notification`): toast al cambiar de estado (toggle).
- **Ajustes de sistema** (`tauri-plugin-opener` + `tauri-plugin-clipboard-manager`):
  comandos `open_data_folder` (abre la carpeta de datos en el Explorador), `open_steam`
  (`steam://open/main` con `ShellExecuteW`, abre o enfoca el cliente), `open_url` (enlaces
  externos en el navegador) y `copy_text` (copia el diagnóstico al portapapeles).
- Resuelve la carpeta de Documentos del usuario (`BaseDirectory::Document`) y se la pasa al
  `Core` al construirlo; ya no hay argumentos de proceso para un sidecar.

### 4.4 UI — `ui/`

Ventana ~900×620, tema oscuro por defecto, organizada en **módulos** navegables desde una
barra de navegación en la cabecera (React Router con `HashRouter`: funciona igual en el
webview de Tauri y en un futuro despliegue PWA servido como sitio estático). Objetivo a
medio plazo: que la interfaz sea instalable como **PWA**; el primer paso ha sido separar
el panel de control del módulo de ajustes. La cabecera muestra a la izquierda el isotipo
(SVG de `ui/src/assets/logo.svg`, fuente `assets/logo-glyph.svg`) junto al nombre de la app,
y a la derecha el estado del cliente de Steam («Steam abierto / iniciando / cerrado»); ya no
hay cuenta, avatar ni botón de login. Junto al nombre de la app hay un badge con la
versión (`vX.Y.Z`, inyectada en tiempo de build desde `tauri.conf.json`; es la misma
fuente que usa «Acerca de»).

**Panel de control** (`/`): estado del cliente y resumen del horario:

1. **Estado**: "Conectado" / "Invisible" / "Steam cerrado" / "Esperando a Steam" + cuenta
   atrás a la próxima transición ("Online en 2 h 14 min" / "Invisible a la 01:00") y el
   último cambio aplicado ("Último cambio: Invisible a la 01:00").
2. **Programación**: resumen del horario, interruptor rápido activar/pausar y enlace
   "Editar en Ajustes".
3. **Steam cerrado**: aviso con botón **Abrir Steam** cuando el proceso no está en marcha;
   mientras Steam inicia, un aviso informativo. Si el último comando falló, un aviso con
   botón **Reaplicar ahora**.

**Ajustes** (`/settings`): configuración persistente y mantenimiento, organizada en
tarjetas:

- **Horario**: horas inicio/fin, días de la semana, resumen de la franja (día, horas y
  duración) y botón para restaurar los valores por defecto.
- **Cliente de Steam**: estado del cliente, botones Abrir Steam y Reaplicar ahora, último
  estado aplicado, explicación de que la app no inicia sesión y, si hay restos de la versión
  antigua (`auth.json`, `profile.json`, `steam-data/`), una tarjeta de limpieza con
  confirmación y enlace a «Gestionar dispositivos de Steam».
- **Aplicación**: iniciar con Windows, notificaciones y modo desarrollador.
- **Idioma**: conmutador Español | English (los nombres, cada uno en su idioma); el cambio
  se aplica al momento en interfaz, bandeja y notificaciones.
- **Datos y registros**: ruta de datos, abrir la carpeta en el Explorador, vaciar
  `status.log` y copiar un diagnóstico (versión, estado y últimas líneas del registro)
  para reportar problemas.
- **Acerca de**: versión y enlaces al repositorio, última release e issues.

Los controles de configuración que antes vivían en el panel se han movido aquí; el panel
conserva el resumen del horario y la pausa rápida.

**Idioma (es/en):** los textos de la interfaz viven en un diccionario tipado
(`ui/src/lib/i18n.ts`): `es` es la fuente de los tipos y `en` debe completar exactamente las
mismas claves — si falta una traducción, falla el build. El contexto (`i18n-context.ts`)
expone el hook `useI18n()` con `t(clave, params)` (plantillas `{param}`) y el idioma activo
sale de `config.json › language`, así que la interfaz, la bandeja y las notificaciones
siguen un único ajuste. Formato con `Intl` por idioma (24 h en español, 12 h AM/PM en
inglés; duraciones «7 h 30 min» / «7h 30m»); los campos `type="time"` siguen el formato de
Windows. El `<html lang>` se actualiza en vivo. Los logs del núcleo/shell y el diagnóstico
técnico van siempre en inglés.

**Desarrollador** (`/dev`): herramientas internas que no deben aparecer para el usuario
final (forzar Conectado/Invisible y visor del registro en vivo). La pestaña solo aparece
en la navegación — y la ruta solo es accesible — con el **modo desarrollador** activado en
Ajustes › Aplicación (`devMode` en `config.json`, por defecto `false`); con el modo
apagado, entrar en `/dev` redirige al panel.

Comunicación: `invoke` (Tauri commands) → `Core::handle_command`; el núcleo emite
`sidecar-message` → listener de la UI y del shell (bandeja/notificaciones). Todo ocurre
dentro del mismo proceso.

### 4.5 Estructura de archivos

```
steam-auto-status/
├─ src-tauri/            # app Rust (bandeja, ventana, núcleo, plugins, iconos)
│  ├─ tauri.conf.json
│  ├─ Cargo.toml
│  ├─ icons/             # iconos generados (icons/tray/ = iconos de bandeja por estado)
│  └─ src/
│     ├─ main.rs         # shell: bandeja, ventana, comandos y plugins
│     ├─ core.rs         # estado, temporizadores, aplicado de presencia y contrato UI
│     ├─ config.rs       # config.json: defaults, migración y sanitizado
│     ├─ schedule.rs     # ventana horaria y próxima transición
│     ├─ logging.rs      # status.log: rotación, cola y vaciado
│     └─ steam.rs        # Toolhelp + ShellExecuteW
├─ ui/                   # React + TS + Tailwind + shadcn/ui (Vite)
│  ├─ components.json
│  └─ src/               # incluye assets/logo.svg (isotipo de la UI)
├─ assets/               # identidad visual y capturas del README (ver §4.9)
├─ package.json          # scripts raíz (dev, build)
├─ SPEC.md
└─ README.md
```

### 4.6 Datos y configuración

```
C:\Users\Juanky\Documents\steam-auto-status\
├─ config.json       ← editable a mano (horario, días, opciones)
├─ logs\
│  └─ status.log
└─ (restos opcionales de la versión antigua)
   ├─ auth.json       ← token viejo; la app no lo lee
   ├─ profile.json    ← avatar viejo; la app no lo lee
   └─ steam-data\     ← datos de sesión viejos; la app no los lee
```

- Ruta por defecto resuelta con la API de carpetas conocidas de Windows (no escrita a mano:
  funciona con Documents movida o redirigida a OneDrive). Configurable en ajustes.
- El **desinstalador no borra** esta carpeta: la configuración y los logs sobreviven a
  reinstalaciones.
- La app **no guarda credenciales ni tokens**. `auth.json`, `profile.json` y `steam-data/`
  son restos de versiones anteriores; el usuario puede borrarlos desde Ajustes › Cliente de
  Steam (con confirmación) y revocar el token en Steam.
- **Aviso OneDrive:** si Documents está sincronizada, esos restos antiguos pueden seguir en
  la nube hasta que se borren o se revoque el token.

Ejemplo de `config.json`:

```json
{
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "onlineFrom": "17:30",
  "onlineUntil": "01:00",
  "paused": false,
  "startWithWindows": false,
  "notifications": false,
  "devMode": false,
  "language": "es"
}
```

`machineName` ya no existe: la app no reporta una máquina propia; usa la sesión normal del
cliente de Steam.

`language` (`"es"` | `"en"`) fija el idioma de la interfaz, la bandeja, el tooltip y las
notificaciones. Si falta (configs antiguas o primer arranque), se detecta del idioma de
Windows (es → Español, resto → English) y se persiste en el primer guardado.

### 4.7 Empaquetado

- **Núcleo**: Rust compilado dentro del ejecutable (release optimizado). Ya no hay sidecar,
  `runtime/node.exe`, `bundle.resources` ni bundles intermedios.
- **Instalador**: `tauri build` con target **NSIS** (instalador `.exe`, instalación por
  usuario sin admin, idiomas español/inglés). `tauri.conf.json` no declara
  `bundle.resources`. Tamaño medido: **2,49 MB**; disco instalado ≈ **12 MB** (ejecutable
  ~10,7 MB + desinstalador/atajos), sin contar WebView2, que es del sistema. Sin firma de
  código → Windows SmartScreen avisará en la primera ejecución ("Editor desconocido" → Más
  información → Ejecutar de todas formas). Actualizaciones manuales (reinstalar; los datos de
  `Documents` se conservan).
- **WebView2**: ya viene preinstalado en Windows 10/11 (runtime de Edge); el instalador
  solo descarga el bootstrapper si faltara.
- **Releases**: tag `vX.Y.Z` → workflow `.github/workflows/release.yml` (GitHub Actions)
  compila en `windows-latest` y publica la release con el instalador adjunto
  (`steam-auto-status_X.Y.Z_x64-setup.exe`). La versión se inyecta desde el tag con
  `scripts/set-version.mjs` y `scripts/rename-installer.mjs` deja el nombre del artefacto
  en ese formato (el tag es la fuente de verdad).

### 4.8 Presupuesto de recursos

Mediciones y estimaciones durante el desarrollo (pueden variar):

| Estado | RAM |
|---|---|
| App Tauri (proceso principal, release) | ~34–35 MB (medido en bandeja y con ventana; ~6,5 MB privados) |
| Ventana abierta (procesos WebView2) | procesos temporales aparte, se liberan al destruirla |

En reposo (ventana cerrada) queda solo el proceso principal ≈ **35 MB**. Ya no hay sidecar
Node (~51 MB), así que el total baja de ~85 MB a ~34 MB. En desarrollo hay procesos extra
(vite, wrappers de npm, CLI de Tauri) que no existen en la app instalada. Electron fue
descartado por mantener toda su pila (~150–250 MB) incluso minimizado. Instalador medido:
**2,49 MB**; disco instalado ≈ **12 MB**, sin runtime de Node ni recursos extra.

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
  tinta oscura/clara para fondos claros/oscuros), `assets/social-preview.png` (vista previa
  del repositorio, 1280×640; se sube a mano en los ajustes de GitHub) y
  `assets/screenshots/main-screenshot.jpg` (captura principal del README, 2400×1792, con su
  fondo degradado).
- **README**: abre con el lockup conmutado por tema con `<picture>` y
  `prefers-color-scheme` (así el nombre se lee en claro y en oscuro), el eslogan y los
  badges; debajo va `main-screenshot.jpg`, centrada y a todo el ancho.

## 5. Limitaciones conocidas

1. **PC apagado ⇒ sin cambio.** La app solo actúa si el PC está encendido con Steam
   ejecutándose en ese momento. Sin PC no hay cliente local que controlar.
2. **Steam tiene que estar abierto y con sesión iniciada.** Si está cerrado, el usuario ya
   está Offline y la app no puede cambiarlo; espera a que vuelva y aplica el horario.
3. **Solo controla el cliente local.** Si otra sesión o dispositivo (app móvil, Steam Deck,
   chat web) está `Online`, los amigos pueden verte Conectado aunque el PC esté Invisible o
   cerrado. La app no puede cambiar esas otras sesiones.
4. **El comando local no confirma el resultado.** Si Steam está en modo Offline, en la
   pantalla de inicio de sesión, sin foco o corriendo como administrador, puede ignorar la
   URL. La UI muestra el último comando enviado y el estado del proceso, no una garantía de
   la presencia real; «Reaplicar» permite reintentar. El envío usa `ShellExecuteW` en un hilo
   con timeout de 2 s: un shell lento no congela la app, pero tampoco confirma la entrega.
5. **Toolchain de desarrollo**: requiere Node (solo para la UI/Vite) y Rust (rustup) + MSVC
   Build Tools (~2–3 GB la primera vez), solo en la máquina de desarrollo. La máquina final
   no necesita Node: el ejecutable es Rust y WebView2 ya está en Windows 10/11.
6. **ToS:** automatizar la presencia de la propia cuenta es zona gris del Steam Subscriber
   Agreement (cláusula de automatización). Esta versión elimina el patrón de logons y
   reconexiones que podía resultar sospechoso, pero la decisión y responsabilidad siguen
   siendo del usuario.
7. **Los comandos `steam://friends/status/*` son una interfaz local de Steam**, usada por su
   propio menú pero no una API pública con garantía. Una actualización del cliente podría
   cambiarlos o dejar de atenderlos; en ese caso habría que ajustar `steam.rs`. El fallback
   sería automatización de UI/CEF o solo recordatorios, y no se usará salvo que haga falta.

## 7. Cómo verificar que funciona

1. `npm install` y `npm run dev`; abrir el panel desde la bandeja. No hay login: la cabecera
   debe decir «Steam abierto» si el cliente está en marcha. `cargo test` debe pasar los
   tests de config y horario.
2. Usar "Forzar Conectado" y pedir a un amigo (o cuenta alt) que confirme que aparece
   Conectado; luego "Forzar Invisible" y confirmar que deja de aparecer Conectado. Si otra
   sesión está Online, ciérrala para aislar la prueba.
3. Cerrar Steam y comprobar que el panel pasa a «Steam cerrado» y que no se envía nada.
   Volver a abrirlo: tras unos segundos debe aplicar el estado deseado (reintentos a 10/40/90
   s mientras el cliente inicia sesión). «Reaplicar ahora» debe forzar un nuevo envío.
4. Dejar el modo automático y comprobar en el log/UI que los cambios ocurren a las 17:30
   y a la 01:00.
5. Comprobar que al cerrar la ventana los procesos WebView2 desaparecen y el consumo en
   reposo baja al rango esperado (~35 MB medido en release; puede variar en la app instalada).
6. Activar "Iniciar con Windows", reiniciar el PC y comprobar que arranca minimizada en
   bandeja y aplica el estado correcto.
7. Generar el instalador (`npm run build`, ~2,5 MB), instalarlo y verificar que los datos de
   `Documents\steam-auto-status\` se conservan y todo sigue funcionando. No debe quedar ningún
   proceso `node.exe` ni carpeta `sidecar/` en la instalación.
8. Si vienes de la versión antigua, comprobar que Ajustes › Cliente de Steam detecta los
   restos (`auth.json`, `profile.json`, `steam-data/`), que la confirmación los borra y que
   `config.json` y `logs/` se conservan. Revocar el token en Steam es un paso manual.
9. Cambiar el idioma en Ajustes › Idioma y comprobar que interfaz, bandeja (menú y tooltip)
   y notificaciones cambian al momento, y que se mantiene tras reiniciar la app.

## 8. Entorno

- Máquina: Windows (win32). Workspace: `C:\Users\Juanky\Documents\code\projects\steam-auto-status`
- Node.js v24.12.0 · npm 11.6.2 · Python 3.12.10 · git 2.52.0 (Node solo para UI/build;
  la app instalada no ejecuta Node)
- GitHub CLI (`gh`) para la gestión del repositorio
- Repositorio remoto: `steam-auto-status` (rama `main`); los datos de la app viven en
  `Documents` y **nunca** en el repo (`.gitignore` excluye datos y restos de credenciales)
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
  la versión. El workflow publica con notas autogeneradas desde los commits convencionales
  (`feat:`, `fix:`…) desde el tag anterior. **Las notas curadas no viven en el repo**:
  `release-notes/` está en `.gitignore` y solo existe en local; tras publicar CI, se
  aplican con `gh release edit vX.Y.Z --notes-file release-notes/vX.Y.Z.md`.
- **Idioma**: todo en **inglés** — código (incluidos comentarios), commits y release notes.
- **Título de la release**: `vX.Y.Z - The <Tema> Update`, donde `<Tema>` resume en inglés
  lo más importante de la release (Title Case; el título siempre termina en "Update"). La
  fuente es la primera línea de `release-notes/vX.Y.Z.md` (archivo local, fuera del repo),
  un comentario HTML oculto con el formato `<!-- title: vX.Y.Z - The <Tema> Update -->`.
  CI publica con el título por defecto `Steam Auto Status vX.Y.Z` y después se aplica el
  título curado con `gh release edit`.
- **Estilo de las release notes**: en inglés, con emojis **en los títulos de sección** y
  formato amigable. Estructura: (1) contexto breve de la actualización; (2) sección
  destacada `## <emoji> <título descriptivo>` con lo más importante, relacionada con el
  `<Tema>` del título pero sin repetirlo (p. ej. "The Settings Update" → "⚙️ Settings
  module"), seguida de un párrafo y bullets `- **Nombre**: descripción`; (3) `## ✨ What's
  new` con el resto de novedades. Instalación, datos, requisitos y actualización viven en
  el README, no en las notas. El cuerpo publicado en GitHub debe ser igual a
  `release-notes/vX.Y.Z.md`.
- **Aviso previo**: no se hacen commits ni pushes sin previo aviso al usuario.
