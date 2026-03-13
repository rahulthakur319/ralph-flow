import { watch } from 'chokidar';
import { join, relative, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { listFlows, resolveFlowDir, loadConfig } from '../core/config.js';
import { parseTracker } from '../core/status.js';
import { getDb, getAllLoopStates } from '../core/db.js';
import type { TrackerStatus } from '../core/types.js';

interface WsTrackerEvent {
  type: 'tracker:updated';
  app: string;
  loop: string;
  status: TrackerStatus & { key: string };
}

interface WsFileEvent {
  type: 'file:changed';
  app: string;
  path: string;
}

interface WsFullStatusEvent {
  type: 'status:full';
  apps: AppStatus[];
}

interface AppStatus {
  appName: string;
  appType: string;
  description: string;
  loops: Array<{
    key: string;
    name: string;
    order: number;
    stages: string[];
    status: TrackerStatus;
  }>;
}

type WsEvent = WsTrackerEvent | WsFileEvent | WsFullStatusEvent;

export function setupWatcher(cwd: string, wss: WebSocketServer): { close: () => void } {
  const ralphFlowDir = join(cwd, '.ralph-flow');

  // File debounce map
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  // Watch .ralph-flow directory for all changes, filter to md/yaml in handler
  const watcher = watch(ralphFlowDir, {
    ignoreInitial: true,
  });

  watcher.on('change', (filePath: string) => {
    // Only process .md and .yaml files
    if (!filePath.endsWith('.md') && !filePath.endsWith('.yaml')) return;
    // Debounce per-file at 300ms
    const existing = debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    debounceTimers.set(filePath, setTimeout(() => {
      debounceTimers.delete(filePath);
      handleFileChange(filePath, cwd, wss);
    }, 300));
  });

  // DB polling — every 2 seconds
  let cachedDbState = '';
  const dbPollInterval = setInterval(() => {
    try {
      const db = getDb(cwd);
      const flows = listFlows(cwd);
      const allStates: Record<string, unknown[]> = {};
      for (const flow of flows) {
        allStates[flow] = getAllLoopStates(db, flow);
      }
      const stateStr = JSON.stringify(allStates);
      if (stateStr !== cachedDbState) {
        cachedDbState = stateStr;
        // Broadcast full status on DB change
        const fullStatus = buildFullStatus(cwd);
        broadcast(wss, { type: 'status:full', apps: fullStatus });
      }
    } catch {
      // DB might not exist yet — ignore
    }
  }, 2000);

  // On new WS connection, send full status
  wss.on('connection', (ws: WebSocket) => {
    const fullStatus = buildFullStatus(cwd);
    ws.send(JSON.stringify({ type: 'status:full', apps: fullStatus }));
  });

  return {
    close() {
      watcher.close();
      clearInterval(dbPollInterval);
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
    },
  };
}

function handleFileChange(filePath: string, cwd: string, wss: WebSocketServer) {
  const ralphFlowDir = join(cwd, '.ralph-flow');
  const rel = relative(ralphFlowDir, filePath);
  const parts = rel.split(sep);

  // parts[0] = app name, parts[1+] = loop dir / file
  if (parts.length < 2) return;
  const appName = parts[0];

  // Check if this is a tracker file
  if (filePath.endsWith('tracker.md')) {
    try {
      const flowDir = resolveFlowDir(cwd, appName);
      const config = loadConfig(flowDir);

      // Find which loop this tracker belongs to
      for (const [key, loop] of Object.entries(config.loops)) {
        const trackerFullPath = join(flowDir, loop.tracker);
        if (trackerFullPath === filePath) {
          const status = parseTracker(loop.tracker, flowDir, loop.name);
          broadcast(wss, {
            type: 'tracker:updated',
            app: appName,
            loop: key,
            status: { key, ...status },
          });
          return;
        }
      }
    } catch {
      // Config might be invalid during edit — ignore
    }
  }

  // Generic file change event
  broadcast(wss, {
    type: 'file:changed',
    app: appName,
    path: rel,
  });
}

function buildFullStatus(cwd: string): AppStatus[] {
  const flows = listFlows(cwd);
  return flows.map((appName) => {
    try {
      const flowDir = resolveFlowDir(cwd, appName);
      const config = loadConfig(flowDir);
      const sortedLoops = Object.entries(config.loops)
        .sort(([, a], [, b]) => a.order - b.order);

      return {
        appName,
        appType: config.name,
        description: config.description || '',
        loops: sortedLoops.map(([key, loop]) => ({
          key,
          name: loop.name,
          order: loop.order,
          stages: loop.stages,
          status: parseTracker(loop.tracker, flowDir, loop.name),
        })),
      };
    } catch {
      return {
        appName,
        appType: 'unknown',
        description: '',
        loops: [],
      };
    }
  });
}

function broadcast(wss: WebSocketServer, event: WsEvent) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
