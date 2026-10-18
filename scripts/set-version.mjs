/**
 * Sets the app version from a git tag (e.g. `v0.2.0`).
 *
 * The tag is the single source of truth for the version: the release workflow
 * passes it to this script before building, so the installer name and the
 * GitHub release always match. Locally it's optional.
 *
 * Patches:
 *  · src-tauri/tauri.conf.json  → bundle version (installer name)
 *  · src-tauri/Cargo.toml       → [package] version (consistency; cargo
 *                                 regenerates Cargo.lock during the build)
 *
 * Usage: node scripts/set-version.mjs v1.2.3
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2];
if (!tag) {
  console.error('usage: node scripts/set-version.mjs vX.Y.Z');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version: invalid tag "${tag}" (expected vX.Y.Z or vX.Y.Z-pre)`);
  process.exit(1);
}

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// tauri.conf.json — bundle/installer version
const confPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.version = version;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

// Cargo.toml — the first match is the one in the [package] block
const cargoPath = join(rootDir, 'src-tauri', 'Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');
if (!/^version = "[^"]+"$/m.test(cargo)) {
  console.error('set-version: version field not found in Cargo.toml');
  process.exit(1);
}
writeFileSync(cargoPath, cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`));

console.log(`set-version: version set to ${version} (tag ${tag})`);
