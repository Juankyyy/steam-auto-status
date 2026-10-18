/**
 * Fija la versión de la app a partir de un tag de git (ej. `v0.2.0`).
 *
 * El tag es la única fuente de verdad de la versión: el workflow de release
 * lo pasa a este script antes de compilar, así el nombre del instalador y la
 * release de GitHub siempre coinciden. Localmente es opcional.
 *
 * Parchea:
 *  · src-tauri/tauri.conf.json  → versión del bundle (nombre del instalador)
 *  · src-tauri/Cargo.toml       → [package] version (consistencia; cargo
 *                                 regenera Cargo.lock durante el build)
 *
 * Uso: node scripts/set-version.mjs v1.2.3
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2];
if (!tag) {
  console.error('uso: node scripts/set-version.mjs vX.Y.Z');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version: tag inválido "${tag}" (se espera vX.Y.Z o vX.Y.Z-pre)`);
  process.exit(1);
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// tauri.conf.json — versión del bundle/instalador
const confPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.version = version;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

// Cargo.toml — la primera coincidencia es la del bloque [package]
const cargoPath = join(rootDir, 'src-tauri', 'Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');
if (!/^version = "[^"]+"$/m.test(cargo)) {
  console.error('set-version: no se encontró el campo version en Cargo.toml');
  process.exit(1);
}
writeFileSync(cargoPath, cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`));

console.log(`set-version: versión fijada a ${version} (tag ${tag})`);
