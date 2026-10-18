/**
 * Renames the NSIS installer to the release publishing format:
 *
 *   steam-auto-status_<version>_x64-setup.exe
 *
 * (no spaces or uppercase). It renames it inside its own folder
 * (`src-tauri/target/release/bundle/nsis/`) and fails if it can't find the
 * installer, so an artifact with the wrong name is never published.
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
  console.error(`rename-installer: ${nsisDir} does not exist (did you run "npm run build"?).`);
  process.exit(1);
}

// Freshly generated installers from tauri (still with spaces/uppercase).
const pending = readdirSync(nsisDir).filter(
  (file) => file.endsWith('_x64-setup.exe') && !file.startsWith('steam-auto-status_'),
);

if (pending.length === 0) {
  if (existsSync(targetPath)) {
    console.log(`rename-installer: already named ${targetName}`);
    process.exit(0);
  }
  console.error(`rename-installer: no *_x64-setup.exe installers in ${nsisDir}.`);
  process.exit(1);
}

if (pending.length > 1) {
  console.error(
    `rename-installer: multiple installers found; delete the old ones and retry: ${pending.join(', ')}`,
  );
  process.exit(1);
}

rmSync(targetPath, { force: true }); // in case the rename from a previous build was left behind
renameSync(join(nsisDir, pending[0]), targetPath);
console.log(`rename-installer: ${pending[0]} -> ${targetName}`);
