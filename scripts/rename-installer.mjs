/**
 * Renombra el instalador NSIS al formato de publicación de las releases:
 *
 *   steam-auto-status_<version>_x64-setup.exe
 *
 * (sin espacios ni mayúsculas). Lo renombra dentro de su propia carpeta
 * (`src-tauri/target/release/bundle/nsis/`) y falla si no encuentra el instalador,
 * para no publicar nunca un artefacto con el nombre equivocado.
 */

import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(
  readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
).version;

const nsisDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const targetName = `steam-auto-status_${version}_x64-setup.exe`;
const targetPath = join(nsisDir, targetName);

if (!existsSync(nsisDir)) {
  console.error(`rename-installer: no existe ${nsisDir} (¿corriste "npm run build"?).`);
  process.exit(1);
}

// Instaladores recién generados por tauri (todavía con espacios/mayúsculas).
const pending = readdirSync(nsisDir).filter(
  (file) => file.endsWith('_x64-setup.exe') && !file.startsWith('steam-auto-status_'),
);

if (pending.length === 0) {
  if (existsSync(targetPath)) {
    console.log(`rename-installer: ya está como ${targetName}`);
    process.exit(0);
  }
  console.error(`rename-installer: no hay instaladores *_x64-setup.exe en ${nsisDir}.`);
  process.exit(1);
}

if (pending.length > 1) {
  console.error(
    `rename-installer: hay varios instaladores; borrá los viejos y reintentá: ${pending.join(', ')}`,
  );
  process.exit(1);
}

rmSync(targetPath, { force: true }); // por si quedó el renombrado de una build anterior
renameSync(join(nsisDir, pending[0]), targetPath);
console.log(`rename-installer: ${pending[0]} -> ${targetName}`);
