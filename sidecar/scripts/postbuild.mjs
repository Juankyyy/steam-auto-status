/**
 * Post-build del sidecar.
 *
 * esbuild empaqueta todo en dist/sidecar.cjs, pero @doctormckay/steam-crypto
 * lee `system.pem` en tiempo de ejecución relativo a __dirname. Como __dirname
 * pasa a ser la carpeta dist/, copiamos el archivo junto al bundle.
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
console.log('postbuild: system.pem copiado a dist/');
