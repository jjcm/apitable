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
 * Production web server for the standalone Next.js build.
 *
 * Same bootstrapping as the server.js Next generates into
 * web_build/standalone, with one addition: immutable /_next/static assets are
 * served straight from disk, preferring the precompressed .br / .gz siblings
 * written by scripts/precompress.js at build time. Everything else falls
 * through to the regular Next request handler.
 */

process.env.NODE_ENV = 'production';
process.chdir(__dirname);

const fs = require('fs');
const http = require('http');
const path = require('path');
const NextServer = require('next/dist/server/next-server').default;

if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

const STATIC_ROOT = path.join(__dirname, 'web_build', 'static');
const STATIC_PREFIX = '/_next/static/';
const CONTENT_TYPES = {
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Serve an immutable build asset from disk, negotiating the precompressed
 * variant. Returns false when the request is not one this fast path handles.
 */
function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const url = req.url.split('?')[0];
  if (!url.startsWith(STATIC_PREFIX)) return false;
  const rel = decodeURIComponent(url.slice(STATIC_PREFIX.length));
  const file = path.normalize(path.join(STATIC_ROOT, rel));
  if (!file.startsWith(STATIC_ROOT + path.sep)) return false;

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(file);
  const accept = String(req.headers['accept-encoding'] || '');
  let sendFile = file;
  let sendStat = stat;
  let encoding = null;
  for (const [enc, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
    if (!new RegExp(`(^|[ ,])${enc}($|[ ;,])`).test(accept)) continue;
    try {
      const s = fs.statSync(file + suffix);
      if (s.isFile()) {
        sendFile = file + suffix;
        sendStat = s;
        encoding = enc;
        break;
      }
    } catch {
      // no precompressed sibling for this encoding
    }
  }

  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}${encoding ? '-' + encoding : ''}"`;
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', sendStat.size);
  if (encoding) res.setHeader('Content-Encoding', encoding);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(sendFile).pipe(res);
  return true;
}

let handler;

const server = http.createServer(async (req, res) => {
  try {
    if (serveStatic(req, res)) return;
    await handler(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('internal server error');
  }
});

const currentPort = parseInt(process.env.PORT, 10) || 3000;

server.listen(currentPort, (err) => {
  if (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, 'web_build', 'required-server-files.json'), 'utf8')).config;
  const nextServer = new NextServer({
    hostname: 'localhost',
    port: currentPort,
    dir: path.join(__dirname),
    dev: false,
    customServer: false,
    conf,
  });
  handler = nextServer.getRequestHandler();

  console.log('Listening on port', currentPort);
});
