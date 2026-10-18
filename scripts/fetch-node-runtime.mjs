/**
 * Descarga el runtime de Node que se empaqueta con la app.
 *
 * La app instalada lanza `<instalación>\runtime\node.exe` con
 * `<instalación>\sidecar\sidecar.cjs` (ver `src-tauri/src/main.rs`, rama de
 * release), así que en tiempo de build necesitamos un `node.exe` oficial en
 * `src-tauri/runtime/node.exe` — carpeta ignorada por git.
 *
 * · Versión fijada = la del entorno de desarrollo (Node v24.12.0, win-x64).
 * · El SHA256 se verifica contra el oficial publicado en nodejs.org/dist.
 * · Si el archivo ya existe y su hash coincide, no se descarga nada.
 *
 * Uso: node scripts/fetch-node-runtime.mjs [--force]
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Versión y hash del node.exe win-x64 oficial (dist/v24.12.0/SHASUMS256.txt). */
const NODE_VERSION = '24.12.0';
const NODE_SHA256 = '2ffe3acc0458fdde999f50d11809bbe7c9b7ef204dcf17094e325d26ace101d8';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(rootDir, 'src-tauri', 'runtime');
const outFile = join(outDir, 'node.exe');
const downloadUrl = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

const force = process.argv.includes('--force');

/** SHA256 de un archivo, en hexadecimal. */
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main() {
  if (existsSync(outFile) && !force) {
    if (sha256(outFile) === NODE_SHA256) {
      console.log(`runtime: node.exe v${NODE_VERSION} ya está listo en src-tauri/runtime/`);
      return;
    }
    console.log('runtime: node.exe existente con hash inesperado; se vuelve a descargar');
  }

  mkdirSync(outDir, { recursive: true });
  console.log(`runtime: descargando node.exe v${NODE_VERSION} win-x64…`);

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al descargar ${downloadUrl}`);
  }

  const tmpFile = `${outFile}.tmp`;
  writeFileSync(tmpFile, Buffer.from(await res.arrayBuffer()));

  const actual = sha256(tmpFile);
  if (actual !== NODE_SHA256) {
    rmSync(tmpFile, { force: true });
    throw new Error(
      `SHA256 no coincide (esperado ${NODE_SHA256}, obtenido ${actual}); descarga abortada`,
    );
  }

  renameSync(tmpFile, outFile);
  console.log(`runtime: node.exe v${NODE_VERSION} verificado y guardado en src-tauri/runtime/`);
}

main().catch((err) => {
  console.error(`runtime: error: ${err.message}`);
  process.exit(1);
});
