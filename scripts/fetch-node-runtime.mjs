/**
 * Downloads the Node runtime that gets bundled with the app.
 *
 * The installed app launches `<installation>\runtime\node.exe` with
 * `<installation>\sidecar\sidecar.cjs` (see `src-tauri/src/main.rs`, release
 * branch), so at build time we need an official `node.exe` in
 * `src-tauri/runtime/node.exe` — a folder ignored by git.
 *
 * · Pinned version = the one in the development environment (Node v24.12.0, win-x64).
 * · The SHA256 is verified against the official one published on nodejs.org/dist.
 * · If the file already exists and its hash matches, nothing is downloaded.
 *
 * Usage: node scripts/fetch-node-runtime.mjs [--force]
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

/** Version and hash of the official win-x64 node.exe (dist/v24.12.0/SHASUMS256.txt). */
const NODE_VERSION = '24.12.0';
const NODE_SHA256 = '2ffe3acc0458fdde999f50d11809bbe7c9b7ef204dcf17094e325d26ace101d8';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(rootDir, 'src-tauri', 'runtime');
const outFile = join(outDir, 'node.exe');
const downloadUrl = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

const force = process.argv.includes('--force');

/** SHA256 of a file, in hexadecimal. */
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main() {
  if (existsSync(outFile) && !force) {
    if (sha256(outFile) === NODE_SHA256) {
      console.log(`runtime: node.exe v${NODE_VERSION} already present in src-tauri/runtime/`);
      return;
    }
    console.log('runtime: existing node.exe has an unexpected hash; downloading again');
  }

  mkdirSync(outDir, { recursive: true });
  console.log(`runtime: downloading node.exe v${NODE_VERSION} win-x64…`);

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${downloadUrl}`);
  }

  const tmpFile = `${outFile}.tmp`;
  writeFileSync(tmpFile, Buffer.from(await res.arrayBuffer()));

  const actual = sha256(tmpFile);
  if (actual !== NODE_SHA256) {
    rmSync(tmpFile, { force: true });
    throw new Error(
      `SHA256 mismatch (expected ${NODE_SHA256}, got ${actual}); download aborted`,
    );
  }

  renameSync(tmpFile, outFile);
  console.log(`runtime: node.exe v${NODE_VERSION} verified and saved to src-tauri/runtime/`);
}

main().catch((err) => {
  console.error(`runtime: error: ${err.message}`);
  process.exit(1);
});
