import { Hono } from 'hono';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { listFlows, resolveFlowDir, loadConfig } from '../core/config.js';
import { parseTracker } from '../core/status.js';
import { getDb, getAllLoopStates } from '../core/db.js';
import { copyTemplate } from '../core/template.js';
import type { RalphFlowConfig } from '../core/types.js';

const TEMPLATES = ['code-implementation', 'research'] as const;

export function createApiRoutes(cwd: string, port: number = 4242): Hono {
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

  return api;
}

/**
 * Validate that a resolved path stays within the project's .ralph-flow/ directory.
 */
function validatePath(resolvedPath: string, cwd: string): boolean {
  const ralphFlowDir = resolve(cwd, '.ralph-flow');
  return resolvedPath.startsWith(ralphFlowDir) && !resolvedPath.includes('..');
}
