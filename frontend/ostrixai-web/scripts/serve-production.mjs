import { createServer } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function serveProduction(directory) {
  const root = resolve(directory ?? process.env.OSTRIX_BUILD_DIR ??
    fileURLToPath(new URL('../dist/ostrixai-web/browser/', import.meta.url)));
  await access(join(root, 'ngsw.json'));
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
      if (!file.startsWith(resolve(root) + sep)) throw Error();
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}
