import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Serve a generated snapshot the way a static host would: files verbatim, no
 * build step, `404.html` for anything unmatched.
 *
 * Used to check a snapshot by hand with the wiki switched off, which is the
 * only honest way to verify the artifact is genuinely self-contained.
 *
 *   node scripts/preview-static-site.mjs <snapshot-dir> [port] [base-path]
 */

const [, , rootArg, portArg = '4180', basePathArg = '/'] = process.argv;
if (!rootArg) {
  process.stderr.write('usage: preview-static-site.mjs <snapshot-dir> [port] [base-path]\n');
  process.exit(1);
}

const root = path.resolve(rootArg);
const basePath = basePathArg.endsWith('/') ? basePathArg : `${basePathArg}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

createServer((request, response) => {
  let urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (basePath !== '/' && urlPath.startsWith(basePath.slice(0, -1))) {
    urlPath = urlPath.slice(basePath.length - 1) || '/';
  }

  let filePath = path.join(root, urlPath);
  if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFound = path.join(root, '404.html');
    if (fs.existsSync(notFound)) {
      response.writeHead(404, { 'content-type': TYPES['.html'] });
      response.end(fs.readFileSync(notFound));
      return;
    }
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
  });
  response.end(fs.readFileSync(filePath));
}).listen(Number(portArg), () => {
  process.stdout.write(`serving ${root} at http://localhost:${portArg}${basePath}\n`);
});
