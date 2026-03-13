import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import chalk from 'chalk';
import { createApiRoutes } from './api.js';
import { setupWatcher } from './watcher.js';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveUiPath(): string {
  const candidates = [
    join(__dirname, '..', 'dashboard', 'ui', 'index.html'),     // dev: src/dashboard/ -> src/dashboard/ui/
    join(__dirname, '..', 'src', 'dashboard', 'ui', 'index.html'), // bundled: dist/ -> src/dashboard/ui/
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Dashboard UI not found. Searched:\n${candidates.join('\n')}`
  );
}

export async function startDashboard(options: { cwd: string; port?: number }): Promise<{ close: () => void }> {
  const { cwd, port = 4242 } = options;

  const app = new Hono();

  // CORS for localhost
  app.use('*', cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'PUT', 'POST', 'DELETE'],
  }));

  // Mount API routes
  const apiRoutes = createApiRoutes(cwd, port);
  app.route('/', apiRoutes);

  // Serve index.html at root
  app.get('/', (c) => {
    const htmlPath = resolveUiPath();
    const html = readFileSync(htmlPath, 'utf-8');
    return c.html(html);
  });

  // Start HTTP server
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: '127.0.0.1',
  });

  // WebSocket server in noServer mode
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /ws path
  (server as any).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Setup file watcher + WS broadcasting
  const watcherHandle = setupWatcher(cwd, wss);

  console.log();
  console.log(chalk.bold(`  Dashboard ${chalk.dim('→')} http://localhost:${port}`));
  console.log(chalk.dim(`  Watching ${cwd}/.ralph-flow/`));
  console.log();

  return {
    close() {
      watcherHandle.close();
      wss.close();
      (server as any).close();
    },
  };
}
