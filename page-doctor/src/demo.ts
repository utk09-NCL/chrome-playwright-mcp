import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { diagnose } from './diagnose.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const demoDir = path.join(here, '..', 'demo');

/**
 * Start a local demo server that serves the intentionally broken example page.
 * @returns {Promise<import('node:http').Server>} A listening HTTP server instance.
 */
function startServer(): Promise<import('node:http').Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = url.pathname === '/' ? '/broken-page.html' : url.pathname;

    if (file.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not found"}');
      return;
    }

    try {
      const resolved = path.join(demoDir, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
      if (!resolved.startsWith(demoDir)) throw new Error('outside demo dir');

      const body = await fs.readFile(resolved);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Failed to determine demo server address');
}
const { port } = address;
const url = `http://127.0.0.1:${port}/`;

console.log(chalk.bold.cyan('\n Page Doctor - demo\n'));
console.log(chalk.gray(`Serving demo/broken-page.html at ${url}`));
console.log(chalk.gray('This page has deliberate problems: a JS error, an unhandled'));
console.log(chalk.gray('rejection, a 404, layout shift, and mostly-unused CSS.\n'));

try {
  await diagnose(url, { throttle: 'mobile', settleMs: 3000 });
} finally {
  server.close();
}
