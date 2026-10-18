/**
 * Sidecar post-build.
 *
 * esbuild bundles everything into dist/sidecar.cjs, but @doctormckay/steam-crypto
 * reads `system.pem` at runtime relative to __dirname. Since __dirname becomes
 * the dist/ folder, we copy the file next to the bundle.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const cryptoEntry = require.resolve('@doctormckay/steam-crypto');
const pemSource = join(dirname(cryptoEntry), 'system.pem');

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'dist');
mkdirSync(outDir, { recursive: true });

copyFileSync(pemSource, join(outDir, 'system.pem'));
console.log('postbuild: system.pem copied to dist/');
