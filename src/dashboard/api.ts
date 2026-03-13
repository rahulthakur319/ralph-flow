import { Hono } from 'hono';
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, cpSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, basename, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { listFlows, resolveFlowDir, loadConfig } from '../core/config.js';
import { parseTracker } from '../core/status.js';
import { getDb, getAllLoopStates, deleteFlowState } from '../core/db.js';
import { copyTemplate, resolveTemplatePath } from '../core/template.js';
import type { RalphFlowConfig } from '../core/types.js';

const TEMPLATES = ['code-implementation', 'research'] as const;

// ---------------------------------------------------------------------------
// In-memory notification store
// ---------------------------------------------------------------------------

interface Notification {
  id: string;
  timestamp: string;
  app: string;
  loop: string;
  payload: unknown;
}

const notifications: Notification[] = [];

function broadcastWs(wss: WebSocketServer | undefined, event: unknown): void {
  if (!wss) return;
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function createApiRoutes(cwd: string, port: number = 4242, wss?: WebSocketServer): Hono {
  const api = new Hono();

  // GET /api/context — working directory info
  api.get('/api/context', (c) => {
    return c.json({
      cwd,
      projectName: basename(cwd),
      port,
    });
  });

  // GET /api/apps — list all apps with metadata
  api.get('/api/apps', (c) => {
    const flows = listFlows(cwd);
    const apps = flows.map((appName) => {
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
          multiAgent: !!(loop.multi_agent && typeof loop.multi_agent === 'object' && loop.multi_agent.enabled),
          model: loop.model || null,
        })),
      };
    });
    return c.json(apps);
  });

  // POST /api/apps — create a new app from a template
  api.post('/api/apps', async (c) => {
    const body = await c.req.json<{ template?: string; name?: string }>();
    const { template, name } = body;

    // Validate template
    if (!template || !TEMPLATES.includes(template as typeof TEMPLATES[number])) {
      return c.json({ error: `Invalid template. Available: ${TEMPLATES.join(', ')}` }, 400);
    }

    // Validate name
    if (!name || name.trim().length === 0) {
      return c.json({ error: 'Name is required' }, 400);
    }

    // Path safety: no traversal or slashes
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return c.json({ error: 'Invalid name: must not contain "..", "/", or "\\"' }, 400);
    }

    const appName = name.trim();
    const flowDir = join(cwd, '.ralph-flow', appName);

    // Check for duplicate
    if (existsSync(flowDir)) {
      return c.json({ error: `App "${appName}" already exists` }, 409);
    }

    // Check for CLAUDE.md
    const claudeMdPath = join(cwd, 'CLAUDE.md');
    const warning = existsSync(claudeMdPath)
      ? null
      : 'No CLAUDE.md found in project root. Consider creating one for better Claude context.';

    // Scaffold the app
    try {
      copyTemplate(template, flowDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to create app: ${msg}` }, 500);
    }

    return c.json({
      ok: true,
      appName,
      warning,
      commands: [
        `npx ralphflow run story --flow ${appName}`,
        `npx ralphflow e2e --flow ${appName}`,
      ],
    }, 201);
  });

  // DELETE /api/apps/:app — delete an app (directory + DB rows)
  api.delete('/api/apps/:app', (c) => {
    const appName = c.req.param('app');

    // Path safety: no traversal or slashes
    if (appName.includes('..') || appName.includes('/') || appName.includes('\\')) {
      return c.json({ error: 'Invalid name: must not contain "..", "/", or "\\"' }, 400);
    }

    const flowDir = join(cwd, '.ralph-flow', appName);
    if (!existsSync(flowDir)) {
      return c.json({ error: `App "${appName}" not found` }, 404);
    }

    // Remove directory
    rmSync(flowDir, { recursive: true, force: true });

    // Clean up DB rows (best-effort)
    try {
      const db = getDb(cwd);
      deleteFlowState(db, appName);
    } catch {
      // DB cleanup is best-effort
    }

    // Remove matching notifications from in-memory store
    for (let i = notifications.length - 1; i >= 0; i--) {
      if (notifications[i].app === appName) {
        notifications.splice(i, 1);
      }
    }

    return c.json({ ok: true, appName });
  });

  // POST /api/apps/:app/archive — archive current state and reset app
  api.post('/api/apps/:app/archive', (c) => {
    const appName = c.req.param('app');

    // Path safety
    if (appName.includes('..') || appName.includes('/') || appName.includes('\\')) {
      return c.json({ error: 'Invalid name: must not contain "..", "/", or "\\"' }, 400);
    }

    const flowDir = join(cwd, '.ralph-flow', appName);
    if (!existsSync(flowDir)) {
      return c.json({ error: `App "${appName}" not found` }, 404);
    }

    // Load config for template name and loop structure
    let config: RalphFlowConfig;
    try {
      config = loadConfig(flowDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to load config: ${msg}` }, 500);
    }

    // Build timestamp: YYYY-MM-DD_HH-mm
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');

    // Create archive directory (with sequence suffix if same-minute collision)
    const archivesBase = join(cwd, '.ralph-flow', '.archives', appName);
    let archiveDir = join(archivesBase, timestamp);
    let archiveTimestamp = timestamp;
    if (existsSync(archiveDir)) {
      let seq = 2;
      while (existsSync(`${archiveDir}-${seq}`)) seq++;
      archiveDir = `${archiveDir}-${seq}`;
      archiveTimestamp = `${timestamp}-${seq}`;
    }

    try {
      // Step 1: Copy entire app directory to archive
      mkdirSync(archiveDir, { recursive: true });
      cpSync(flowDir, archiveDir, { recursive: true });

      // Step 2: Reset tracker and data files using template originals
      let templateDir: string | undefined;
      try {
        templateDir = resolveTemplatePath(config.name);
      } catch {
        // Template not found — skip template-based reset
      }

      for (const loop of Object.values(config.loops)) {
        // Reset tracker file
        if (templateDir) {
          const templateTracker = join(templateDir, 'loops', loop.tracker);
          const appTracker = join(flowDir, loop.tracker);
          if (existsSync(templateTracker)) {
            writeFileSync(appTracker, readFileSync(templateTracker, 'utf-8'));
          }
        }

        // Reset data files
        if (loop.data_files && templateDir) {
          for (const dataFile of loop.data_files) {
            const templateData = join(templateDir, 'loops', dataFile);
            const appData = join(flowDir, dataFile);
            if (existsSync(templateData)) {
              writeFileSync(appData, readFileSync(templateData, 'utf-8'));
            }
          }
        }

        // Clean up .agents/ directory
        const loopDir = resolve(flowDir, loop.tracker, '..');
        const agentsPath = join(loopDir, '.agents');
        if (existsSync(agentsPath)) {
          rmSync(agentsPath, { recursive: true, force: true });
        }

        // Clean up lock files
        if (loop.lock) {
          const lockPath = join(flowDir, loop.lock.file);
          if (existsSync(lockPath)) {
            rmSync(lockPath);
          }
        }
      }

      // Step 3: Delete DB rows
      try {
        const db = getDb(cwd);
        deleteFlowState(db, appName);
      } catch {
        // DB cleanup is best-effort
      }

      // Step 4: Purge in-memory notifications for this app
      for (let i = notifications.length - 1; i >= 0; i--) {
        if (notifications[i].app === appName) {
          notifications.splice(i, 1);
        }
      }

      const archivePath = `.ralph-flow/.archives/${appName}/${archiveTimestamp}`;
      return c.json({ ok: true, archivePath, timestamp: archiveTimestamp });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Archive failed: ${msg}` }, 500);
    }
  });

  // GET /api/apps/:app/archives — list all archive snapshots for an app
  api.get('/api/apps/:app/archives', (c) => {
    const appName = c.req.param('app');

    // Path safety
    if (appName.includes('..') || appName.includes('/') || appName.includes('\\')) {
      return c.json({ error: 'Invalid name' }, 400);
    }

    const archivesDir = join(cwd, '.ralph-flow', '.archives', appName);
    if (!existsSync(archivesDir)) {
      return c.json([]);
    }

    const entries = readdirSync(archivesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const archiveDir = join(archivesDir, d.name);
        const summary = parseArchiveSummary(archiveDir);
        const fileCount = countFiles(archiveDir);
        return {
          timestamp: d.name,
          summary,
          fileCount,
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first

    return c.json(entries);
  });

  // GET /api/apps/:app/archives/:timestamp/files — list all files in an archive
  api.get('/api/apps/:app/archives/:timestamp/files', (c) => {
    const appName = c.req.param('app');
    const timestamp = c.req.param('timestamp');

    // Path safety
    if (appName.includes('..') || appName.includes('/') || appName.includes('\\')) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    if (timestamp.includes('..') || timestamp.includes('/') || timestamp.includes('\\')) {
      return c.json({ error: 'Invalid timestamp' }, 400);
    }

    const archiveDir = resolve(cwd, '.ralph-flow', '.archives', appName, timestamp);
    if (!validatePath(archiveDir, cwd)) {
      return c.json({ error: 'Invalid path' }, 403);
    }
    if (!existsSync(archiveDir)) {
      return c.json({ error: 'Archive not found' }, 404);
    }

    const files = listFilesRecursive(archiveDir, archiveDir);
    return c.json(files);
  });

  // GET /api/apps/:app/archives/:timestamp/files/* — read a specific archived file
  api.get('/api/apps/:app/archives/:timestamp/files/*', (c) => {
    const appName = c.req.param('app');
    const timestamp = c.req.param('timestamp');
    const filePath = c.req.path.replace(`/api/apps/${encodeURIComponent(appName)}/archives/${encodeURIComponent(timestamp)}/files/`, '');

    // Path safety
    if (appName.includes('..') || appName.includes('/') || appName.includes('\\')) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    if (timestamp.includes('..') || timestamp.includes('/') || timestamp.includes('\\')) {
      return c.json({ error: 'Invalid timestamp' }, 400);
    }
    if (!filePath || filePath.includes('..')) {
      return c.json({ error: 'Invalid file path' }, 400);
    }

    const fullPath = resolve(cwd, '.ralph-flow', '.archives', appName, timestamp, filePath);
    if (!validatePath(fullPath, cwd)) {
      return c.json({ error: 'Invalid path' }, 403);
    }
    if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) {
      return c.json({ error: 'File not found' }, 404);
    }

    const content = readFileSync(fullPath, 'utf-8');
    return c.json({ path: filePath, content });
  });

  // GET /api/apps/:app/status — parsed tracker status for all loops
  api.get('/api/apps/:app/status', (c) => {
    const appName = c.req.param('app');
    const flowDir = resolveFlowDir(cwd, appName);
    const config = loadConfig(flowDir);
    const sortedLoops = Object.entries(config.loops)
      .sort(([, a], [, b]) => a.order - b.order);

    const statuses = sortedLoops.map(([key, loop]) => ({
      key,
      ...parseTracker(loop.tracker, flowDir, loop.name),
    }));
    return c.json(statuses);
  });

  // GET /api/apps/:app/config — raw parsed ralphflow.yaml
  api.get('/api/apps/:app/config', (c) => {
    const appName = c.req.param('app');
    const flowDir = resolveFlowDir(cwd, appName);
    const config = loadConfig(flowDir);
    const configPath = join(flowDir, 'ralphflow.yaml');
    const rawYaml = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
    return c.json({ ...config, _rawYaml: rawYaml });
  });

  // PUT /api/apps/:app/config/model — update a loop's model in ralphflow.yaml
  api.put('/api/apps/:app/config/model', async (c) => {
    const appName = c.req.param('app');
    const flowDir = resolveFlowDir(cwd, appName);
    const configPath = join(flowDir, 'ralphflow.yaml');

    if (!existsSync(configPath)) {
      return c.json({ error: 'ralphflow.yaml not found' }, 404);
    }

    const body = await c.req.json<{ loop: string; model: string | null }>();
    const { loop: loopKey, model } = body;

    if (!loopKey) {
      return c.json({ error: 'loop is required' }, 400);
    }

    const rawYaml = readFileSync(configPath, 'utf-8');
    const config = parseYaml(rawYaml) as RalphFlowConfig;

    if (!config.loops || !config.loops[loopKey]) {
      return c.json({ error: `Loop "${loopKey}" not found in config` }, 404);
    }

    if (model === null || model === '') {
      delete config.loops[loopKey].model;
    } else {
      config.loops[loopKey].model = model;
    }

    writeFileSync(configPath, stringifyYaml(config, { lineWidth: 0 }), 'utf-8');
    return c.json({ ok: true, loop: loopKey, model: model || null });
  });

  // GET /api/apps/:app/db — SQLite loop_state rows
  api.get('/api/apps/:app/db', (c) => {
    const appName = c.req.param('app');
    const db = getDb(cwd);
    const rows = getAllLoopStates(db, appName);
    return c.json(rows);
  });

  // GET /api/apps/:app/loops/:loop/prompt — read prompt.md
  api.get('/api/apps/:app/loops/:loop/prompt', (c) => {
    const { app: appName, loop: loopKey } = c.req.param();
    const flowDir = resolveFlowDir(cwd, appName);
    const config = loadConfig(flowDir);
    const loopConfig = config.loops[loopKey];
    if (!loopConfig) return c.json({ error: `Loop "${loopKey}" not found` }, 404);

    const promptPath = resolve(flowDir, loopConfig.prompt);
    if (!validatePath(promptPath, cwd)) {
      return c.json({ error: 'Invalid path' }, 403);
    }
    if (!existsSync(promptPath)) {
      return c.json({ error: 'prompt.md not found' }, 404);
    }
    const content = readFileSync(promptPath, 'utf-8');
    return c.json({ path: loopConfig.prompt, content });
  });

  // PUT /api/apps/:app/loops/:loop/prompt — write prompt.md
  api.put('/api/apps/:app/loops/:loop/prompt', async (c) => {
    const { app: appName, loop: loopKey } = c.req.param();
    const flowDir = resolveFlowDir(cwd, appName);
    const config = loadConfig(flowDir);
    const loopConfig = config.loops[loopKey];
    if (!loopConfig) return c.json({ error: `Loop "${loopKey}" not found` }, 404);

    const promptPath = resolve(flowDir, loopConfig.prompt);
    if (!validatePath(promptPath, cwd)) {
      return c.json({ error: 'Invalid path' }, 403);
    }

    const body = await c.req.json<{ content: string }>();
    writeFileSync(promptPath, body.content, 'utf-8');
    return c.json({ ok: true });
  });

  // GET /api/apps/:app/loops/:loop/tracker — read raw tracker.md
  api.get('/api/apps/:app/loops/:loop/tracker', (c) => {
    const { app: appName, loop: loopKey } = c.req.param();
    const flowDir = resolveFlowDir(cwd, appName);
    const config = loadConfig(flowDir);
    const loopConfig = config.loops[loopKey];
    if (!loopConfig) return c.json({ error: `Loop "${loopKey}" not found` }, 404);

    const trackerPath = resolve(flowDir, loopConfig.tracker);
    if (!validatePath(trackerPath, cwd)) {
      return c.json({ error: 'Invalid path' }, 403);
    }
    if (!existsSync(trackerPath)) {
      return c.json({ error: 'tracker.md not found', content: '' }, 404);
    }
    const content = readFileSync(trackerPath, 'utf-8');
    return c.json({ path: loopConfig.tracker, content });
  });

  // GET /api/apps/:app/loops/:loop/files — list files in loop dir
  api.get('/api/apps/:app/loops/:loop/files', (c) => {
    const { app: appName, loop: loopKey } = c.req.param();
    const flowDir = resolveFlowDir(cwd, appName);
    const config = loadConfig(flowDir);
    const loopConfig = config.loops[loopKey];
    if (!loopConfig) return c.json({ error: `Loop "${loopKey}" not found` }, 404);

    // Loop directory is the parent of the prompt file
    const loopDir = resolve(flowDir, loopConfig.prompt, '..');
    if (!validatePath(loopDir, cwd)) {
      return c.json({ error: 'Invalid path' }, 403);
    }
    if (!existsSync(loopDir)) {
      return c.json({ files: [] });
    }
    const files = readdirSync(loopDir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
    }));
    return c.json({ files });
  });

  // POST /api/notification — receive a notification from a Claude hook
  api.post('/api/notification', async (c) => {
    const app = c.req.query('app') || 'unknown';
    const loop = c.req.query('loop') || 'unknown';

    let payload: unknown = {};
    try {
      payload = await c.req.json();
    } catch {
      // Body may be empty or malformed — store with empty payload
    }

    const notification: Notification = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      app,
      loop,
      payload,
    };

    notifications.push(notification);
    broadcastWs(wss, { type: 'notification:attention', notification });

    return c.json(notification, 200);
  });

  // GET /api/notifications — return all active (undismissed) notifications
  api.get('/api/notifications', (c) => {
    return c.json(notifications);
  });

  // DELETE /api/notification/:id — dismiss a notification by ID
  api.delete('/api/notification/:id', (c) => {
    const id = c.req.param('id');
    const idx = notifications.findIndex((n) => n.id === id);
    if (idx === -1) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    notifications.splice(idx, 1);
    broadcastWs(wss, { type: 'notification:dismissed', id });
    return c.json({ ok: true });
  });

  return api;
}

/**
 * Validate that a resolved path stays within the project's .ralph-flow/ directory.
 */
function validatePath(resolvedPath: string, cwd: string): boolean {
  const ralphFlowDir = resolve(cwd, '.ralph-flow');
  return resolvedPath.startsWith(ralphFlowDir) && !resolvedPath.includes('..');
}
