/**
 * APITable <https://github.com/apitable/apitable>
 * Copyright (C) 2022 APITable Ltd. <https://apitable.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Precompress the immutable build assets so the production web server can
 * serve maximum-compression bytes without doing any work per request.
 *
 * Runs after `next build`: walks web_build/static and writes .br (brotli
 * quality 11) and .gz (gzip level 9) siblings next to every compressible
 * file. The assets are content-hashed and immutable, so compressing once at
 * build time always beats per-request gzip at a moderate level.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', 'web_build', 'static');
const COMPRESSIBLE = new Set(['.js', '.css', '.svg', '.json', '.txt', '.map', '.html', '.wasm']);
const MIN_SIZE = 1024;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`precompress: ${ROOT} does not exist, run next build first`);
    process.exit(1);
  }
  let files = 0;
  let rawTotal = 0;
  let brTotal = 0;
  const started = Date.now();
  for (const file of walk(ROOT)) {
    const ext = path.extname(file);
    if (!COMPRESSIBLE.has(ext)) continue;
    const raw = fs.readFileSync(file);
    if (raw.length < MIN_SIZE) continue;
    const br = zlib.brotliCompressSync(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });
    const gz = zlib.gzipSync(raw, { level: 9 });
    // Only keep siblings that actually save bytes.
    if (br.length < raw.length) fs.writeFileSync(`${file}.br`, br);
    if (gz.length < raw.length) fs.writeFileSync(`${file}.gz`, gz);
    files += 1;
    rawTotal += raw.length;
    brTotal += br.length;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`precompress: ${files} files, ${(rawTotal / 1048576).toFixed(1)}MB -> ${(brTotal / 1048576).toFixed(1)}MB brotli in ${secs}s`);
}

main();
