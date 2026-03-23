import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAdaptorServer } from '@hono/node-server';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import chalk from 'chalk';
import { createApiRoutes } from './api.js';
import { setupWatcher } from './watcher.js';
import { installNotificationHook, removeNotificationHook } from './hooks.js';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_PORT_ATTEMPTS = 10;

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.html': 'text/html',
};

function resolveUiDir(): string {
  const candidates = [
    join(__dirname, '..', 'dashboard', 'ui'),     // dev: src/dashboard/ -> src/dashboard/ui/
    join(__dirname, '..', 'src', 'dashboard', 'ui'), // bundled: dist/ -> src/dashboard/ui/
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  throw new Error(
    `Dashboard UI not found. Searched:\n${candidates.map(c => join(c, 'index.html')).join('\n')}`
  );
}

function tryListen(server: ReturnType<typeof createAdaptorServer>, hostname: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const addr = server.address();
      const boundPort = (addr && typeof addr === 'object') ? addr.port : port;
      resolve(boundPort);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, hostname);
  });
}

export async function startDashboard(options: { cwd: string; port?: number }): Promise<{ close: () => void; port: number }> {
  const { cwd, port: requestedPort = 4242 } = options;

  const app = new Hono();

  // WebSocket server in noServer mode (created early so API routes can broadcast)
  const wss = new WebSocketServer({ noServer: true });

  // Mutable port ref — updated after successful bind so /api/context reports the actual port
  const portRef = { value: requestedPort };

  // CORS for localhost
  app.use('*', cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'PUT', 'POST', 'DELETE'],
  }));

  // Mount API routes (with wss for notification broadcasting)
  const apiRoutes = createApiRoutes(cwd, portRef, wss);
  app.route('/', apiRoutes);

  // Serve static UI files
  const uiDir = resolveUiDir();

  app.get('/', (c) => {
    const html = readFileSync(join(uiDir, 'index.html'), 'utf-8');
    return c.html(html);
  });

  app.get('/:file{.+\\.(css|js)$}', (c) => {
    const file = c.req.param('file');
    const filePath = join(uiDir, file);
    if (!filePath.startsWith(uiDir) || !existsSync(filePath)) {
      return c.notFound();
    }
    const content = readFileSync(filePath, 'utf-8');
    const contentType = CONTENT_TYPES[extname(filePath)] || 'text/plain';
    return c.text(content, 200, { 'Content-Type': contentType });
  });

  // Create HTTP server (without auto-listen) and try binding with port retry
  let server = createAdaptorServer({ fetch: app.fetch });
  let actualPort = requestedPort;

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const candidatePort = requestedPort + attempt;
    try {
      actualPort = await tryListen(server, '127.0.0.1', candidatePort);
      break;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'EADDRINUSE') throw err;
      if (attempt >= MAX_PORT_ATTEMPTS - 1) {
        throw new Error(
          `Could not find an available port (tried ${requestedPort}–${requestedPort + MAX_PORT_ATTEMPTS - 1})`
        );
      }
      // Port busy — create a fresh server for the next attempt
      server = createAdaptorServer({ fetch: app.fetch });
    }
  }

  // Update the mutable port ref so /api/context reports the actual port
  portRef.value = actualPort;

  // Handle upgrade requests for /ws path
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
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

  // Install Claude notification hook (using the actual bound port)
  try {
    installNotificationHook(cwd, actualPort);
    console.log(chalk.dim(`  Configured Claude hook → .claude/settings.local.json`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.yellow(`  ⚠ Could not configure Claude hook: ${msg}`));
  }

  console.log();
  if (actualPort !== requestedPort) {
    console.log(chalk.yellow(`  Port ${requestedPort} was busy, using ${actualPort} instead`));
  }
  console.log(chalk.bold(`  Dashboard ${chalk.dim('→')} http://localhost:${actualPort}`));
  console.log(chalk.dim(`  Watching ${cwd}/.ralph-flow/`));
  console.log();

  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    watcherHandle.close();
    wss.close();
    server.close();
    try {
      removeNotificationHook(cwd);
      console.log(chalk.dim('  Removed Claude hook'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  ⚠ Could not remove Claude hook: ${msg}`));
    }
  };

  // Signal handlers for graceful shutdown
  const onSignal = () => {
    close();
    process.exit();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  // Fallback: ensure hook removal even if another handler calls process.exit() first
  process.on('exit', () => {
    if (!closed) {
      try { removeNotificationHook(cwd); } catch { /* best effort */ }
    }
  });

  return { close, port: actualPort };
}
