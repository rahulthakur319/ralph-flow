import { Hono } from 'hono';
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, cpSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, basename, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { listFlows, resolveFlowDir, loadConfig } from '../core/config.js';
import { parseTracker } from '../core/status.js';
import { getDb, getAllLoopStates, deleteFlowState } from '../core/db.js';
import {
  copyTemplate,
  resolveTemplatePath,
  resolveTemplatePathWithCustom,
  BUILT_IN_TEMPLATES,
  getAvailableTemplates,
  listCustomTemplates,
  createCustomTemplate,
  deleteCustomTemplate,
  cloneBuiltInTemplate,
  validateTemplateName,
} from '../core/template.js';
import type { TemplateDefinition } from '../core/template.js';
import type { RalphFlowConfig } from '../core/types.js';

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

// ---------------------------------------------------------------------------
// In-memory decision store
// ---------------------------------------------------------------------------

interface Decision {
  id: string;
  timestamp: string;
  app: string;
  loop: string;
  item: string;
  agent: string;
  decision: string;
  reasoning: string;
}

const decisions: Decision[] = [];

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

    // Validate template — check built-in and custom templates
    const allTemplateNames = [
      ...BUILT_IN_TEMPLATES,
      ...listCustomTemplates(cwd),
    ];
    if (!template || !allTemplateNames.includes(template)) {
      return c.json({ error: `Invalid template. Available: ${allTemplateNames.join(', ')}` }, 400);
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

    // Scaffold the app (pass cwd for custom template resolution)
    try {
      copyTemplate(template, flowDir, cwd);
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

    // Remove matching decisions from in-memory store
    for (let i = decisions.length - 1; i >= 0; i--) {
      if (decisions[i].app === appName) {
        decisions.splice(i, 1);
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
        templateDir = resolveTemplatePathWithCustom(config.name, cwd);
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

      // Step 4: Purge in-memory notifications and decisions for this app
      for (let i = notifications.length - 1; i >= 0; i--) {
        if (notifications[i].app === appName) {
          notifications.splice(i, 1);
        }
      }
      for (let i = decisions.length - 1; i >= 0; i--) {
        if (decisions[i].app === appName) {
          decisions.splice(i, 1);
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

  // ---------------------------------------------------------------------------
  // Template CRUD endpoints
  // ---------------------------------------------------------------------------

  // GET /api/templates — list all templates (built-in + custom)
  api.get('/api/templates', (c) => {
    return c.json(getAvailableTemplates(cwd));
  });

  // POST /api/templates — create a custom template from a definition
  api.post('/api/templates', async (c) => {
    let definition: TemplateDefinition;
    try {
      definition = await c.req.json<TemplateDefinition>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!definition.name) {
      return c.json({ error: 'Template name is required' }, 400);
    }

    const validation = validateTemplateName(definition.name);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    if (!definition.loops || !Array.isArray(definition.loops) || definition.loops.length === 0) {
      return c.json({ error: 'At least one loop is required' }, 400);
    }

    // Validate each loop has required fields
    for (let i = 0; i < definition.loops.length; i++) {
      const loop = definition.loops[i];
      if (!loop.name) {
        return c.json({ error: `Loop ${i + 1}: name is required` }, 400);
      }
      if (!loop.stages || !Array.isArray(loop.stages) || loop.stages.length === 0) {
        return c.json({ error: `Loop "${loop.name}": at least one stage is required` }, 400);
      }
      if (!loop.completion) {
        return c.json({ error: `Loop "${loop.name}": completion string is required` }, 400);
      }
    }

    // Check for duplicate
    const customDir = join(cwd, '.ralph-flow', '.templates', definition.name);
    if (existsSync(customDir)) {
      return c.json({ error: `Template "${definition.name}" already exists` }, 409);
    }

    try {
      createCustomTemplate(cwd, definition);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to create template: ${msg}` }, 500);
    }

    return c.json({
      ok: true,
      templateName: definition.name,
      message: `Template "${definition.name}" created successfully`,
    }, 201);
  });

  // DELETE /api/templates/:name — delete a custom template
  api.delete('/api/templates/:name', (c) => {
    const name = c.req.param('name');

    // Path safety
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return c.json({ error: 'Invalid name: must not contain "..", "/", or "\\"' }, 400);
    }

    // Block deletion of built-in templates
    if ((BUILT_IN_TEMPLATES as readonly string[]).includes(name)) {
      return c.json({ error: 'Cannot delete built-in templates' }, 403);
    }

    try {
      deleteCustomTemplate(cwd, name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 500);
    }

    return c.json({ ok: true, templateName: name });
  });

  // POST /api/templates/:name/clone — clone a built-in template into a custom template
  api.post('/api/templates/:name/clone', async (c) => {
    const sourceName = c.req.param('name');

    // Path safety
    if (sourceName.includes('..') || sourceName.includes('/') || sourceName.includes('\\')) {
      return c.json({ error: 'Invalid name: must not contain "..", "/", or "\\"' }, 400);
    }

    // Source must be a built-in template
    if (!(BUILT_IN_TEMPLATES as readonly string[]).includes(sourceName)) {
      return c.json({ error: `"${sourceName}" is not a built-in template. Only built-in templates can be cloned.` }, 400);
    }

    let body: { newName?: string };
    try {
      body = await c.req.json<{ newName?: string }>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { newName } = body;
    if (!newName || newName.trim().length === 0) {
      return c.json({ error: 'newName is required' }, 400);
    }

    const validation = validateTemplateName(newName.trim());
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    // Check for existing custom template with that name
    const customDir = join(cwd, '.ralph-flow', '.templates', newName.trim());
    if (existsSync(customDir)) {
      return c.json({ error: `Template "${newName.trim()}" already exists` }, 409);
    }

    try {
      cloneBuiltInTemplate(cwd, sourceName, newName.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        return c.json({ error: msg }, 409);
      }
      return c.json({ error: `Clone failed: ${msg}` }, 500);
    }

    return c.json({
      ok: true,
      source: sourceName,
      templateName: newName.trim(),
      message: `Template "${sourceName}" cloned as "${newName.trim()}"`,
    }, 201);
  });

  // ---------------------------------------------------------------------------
  // Template config and prompt endpoints
  // ---------------------------------------------------------------------------

  // GET /api/templates/:name/config — get parsed template configuration
  api.get('/api/templates/:name/config', (c) => {
    const name = c.req.param('name');

    // Path safety
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return c.json({ error: 'Invalid name' }, 400);
    }

    // Resolve template path (built-in or custom)
    let templateDir: string;
    try {
      templateDir = resolveTemplatePathWithCustom(name, cwd);
    } catch {
      return c.json({ error: `Template "${name}" not found` }, 404);
    }

    // Load and parse config
    try {
      const config = loadConfig(templateDir);
      return c.json(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });

  // GET /api/templates/:name/loops/:loopKey/prompt — read a template's prompt file
  api.get('/api/templates/:name/loops/:loopKey/prompt', (c) => {
    const name = c.req.param('name');
    const loopKey = c.req.param('loopKey');

    // Path safety
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    if (loopKey.includes('..') || loopKey.includes('/') || loopKey.includes('\\')) {
      return c.json({ error: 'Invalid loop key' }, 400);
    }

    // Resolve template path (built-in or custom)
    let templateDir: string;
    try {
      templateDir = resolveTemplatePathWithCustom(name, cwd);
    } catch {
      return c.json({ error: `Template "${name}" not found` }, 404);
    }

    // Load config to find prompt path
    let config: RalphFlowConfig;
    try {
      config = loadConfig(templateDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }

    const loopConfig = config.loops[loopKey];
    if (!loopConfig) {
      return c.json({ error: `Loop "${loopKey}" not found in template` }, 404);
    }

    // Resolve prompt path within template (files are under loops/ subdirectory)
    const promptPath = resolve(templateDir, 'loops', loopConfig.prompt);
    if (!promptPath.startsWith(resolve(templateDir))) {
      return c.json({ error: 'Invalid path' }, 403);
    }
    if (!existsSync(promptPath)) {
      return c.json({ error: 'prompt.md not found', content: '' }, 404);
    }

    const content = readFileSync(promptPath, 'utf-8');
    return c.json({ path: loopConfig.prompt, content });
  });

  // PUT /api/templates/:name/loops/:loopKey/prompt — write a template's prompt file
  api.put('/api/templates/:name/loops/:loopKey/prompt', async (c) => {
    const name = c.req.param('name');
    const loopKey = c.req.param('loopKey');

    // Path safety
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return c.json({ error: 'Invalid name' }, 400);
    }
    if (loopKey.includes('..') || loopKey.includes('/') || loopKey.includes('\\')) {
      return c.json({ error: 'Invalid loop key' }, 400);
    }

    // Block writes to built-in templates
    if ((BUILT_IN_TEMPLATES as readonly string[]).includes(name)) {
      return c.json({ error: 'Cannot modify built-in template prompts' }, 403);
    }

    // Resolve custom template path
    const customDir = join(cwd, '.ralph-flow', '.templates', name);
    if (!existsSync(customDir) || !existsSync(join(customDir, 'ralphflow.yaml'))) {
      return c.json({ error: `Custom template "${name}" not found` }, 404);
    }

    // Load config to find prompt path
    let config: RalphFlowConfig;
    try {
      config = loadConfig(customDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }

    const loopConfig = config.loops[loopKey];
    if (!loopConfig) {
      return c.json({ error: `Loop "${loopKey}" not found in template` }, 404);
    }

    // Resolve prompt path within template (files are under loops/ subdirectory)
    const promptPath = resolve(customDir, 'loops', loopConfig.prompt);
    if (!promptPath.startsWith(resolve(customDir))) {
      return c.json({ error: 'Invalid path' }, 403);
    }

    const body = await c.req.json<{ content: string }>();
    writeFileSync(promptPath, body.content, 'utf-8');
    return c.json({ ok: true });
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

  // ---------------------------------------------------------------------------
  // Decision reporting endpoints
  // ---------------------------------------------------------------------------

  // POST /api/decision — receive a decision report from an agent
  api.post('/api/decision', async (c) => {
    const app = c.req.query('app') || 'unknown';
    const loop = c.req.query('loop') || 'unknown';

    let body: { item?: string; agent?: string; decision?: string; reasoning?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.item || !body.decision) {
      return c.json({ error: 'item and decision are required' }, 400);
    }

    const decision: Decision = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      app,
      loop,
      item: body.item,
      agent: body.agent || 'unknown',
      decision: body.decision,
      reasoning: body.reasoning || '',
    };

    decisions.push(decision);
    broadcastWs(wss, { type: 'decision:reported', decision });

    return c.json(decision, 200);
  });

  // GET /api/decisions — return all undismissed decisions
  api.get('/api/decisions', (c) => {
    return c.json(decisions);
  });

  // DELETE /api/decision/:id — dismiss a decision by ID
  api.delete('/api/decision/:id', (c) => {
    const id = c.req.param('id');
    const idx = decisions.findIndex((d) => d.id === id);
    if (idx === -1) {
      return c.json({ error: 'Decision not found' }, 404);
    }
    decisions.splice(idx, 1);
    broadcastWs(wss, { type: 'decision:dismissed', id });
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

/**
 * Parse summary stats from an archived app directory.
 * Counts STORY-{N} and TASK-{N} headers in data files.
 */
function parseArchiveSummary(archiveDir: string): { storyCount: number; taskCount: number } {
  let storyCount = 0;
  let taskCount = 0;

  // Walk all .md files looking for story and task headers
  const mdFiles = listFilesRecursive(archiveDir, archiveDir)
    .filter(f => f.path.endsWith('.md'));

  for (const file of mdFiles) {
    try {
      const content = readFileSync(join(archiveDir, file.path), 'utf-8');
      const storyMatches = content.match(/^## STORY-\d+:/gm);
      if (storyMatches) storyCount += storyMatches.length;
      const taskMatches = content.match(/^## TASK-\d+:/gm);
      if (taskMatches) taskCount += taskMatches.length;
    } catch {
      // Skip unreadable files
    }
  }

  return { storyCount, taskCount };
}

/**
 * Count all files (not directories) recursively in a directory.
 */
function countFiles(dir: string): number {
  let count = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

/**
 * List all files recursively in a directory, returning paths relative to baseDir.
 */
function listFilesRecursive(dir: string, baseDir: string): { path: string; isDirectory: false }[] {
  const results: { path: string; isDirectory: false }[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, baseDir));
    } else {
      results.push({ path: relPath, isDirectory: false });
    }
  }
  return results;
}
