# RalphFlow

Multi-agent AI workflow orchestration framework for Claude Code. Define pipelines as loops, coordinate parallel agents via file-based trackers, and ship structured work.

## Architecture

```
src/
├── bin/ralphflow.ts          — CLI entry point (shebang, parses commander program)
├── cli/
│   ├── index.ts              — Commander program: mounts all commands, default → start dashboard + open browser
│   ├── init.ts               — `init` command: scaffold flow from template
│   ├── run.ts                — `run <loop>` command: single/multi-agent loop execution, --ui flag
│   ├── e2e.ts                — `e2e` command: orchestrated all-loops execution with SQLite, --ui flag
│   ├── status.ts             — `status` command: renders loop status table
│   └── dashboard.ts          — `dashboard` command (alias: `ui`): starts web server
├── core/
│   ├── index.ts              — Public API re-exports
│   ├── types.ts              — All TypeScript interfaces (RalphFlowConfig, LoopConfig, TrackerStatus, etc.)
│   ├── config.ts             — YAML config loading, flow/loop resolution, alias matching
│   ├── runner.ts             — Iteration engine: spawn Claude, detect completion, multi-agent coordination
│   ├── claude.ts             — spawnClaude(): child_process.spawn with stdio: 'inherit'
│   ├── db.ts                 — SQLite (better-sqlite3, WAL mode): loop_state table, status tracking
│   ├── status.ts             — parseTracker(): regex-based tracker.md parsing (stage, checkboxes, agents)
│   ├── init.ts               — initProject(): scaffold .ralph-flow/<name>/ from template
│   └── template.ts           — Template path resolution (dev vs bundled), file copying, custom template CRUD
├── dashboard/
│   ├── server.ts             — Hono HTTP + WebSocket server on 127.0.0.1:4242
│   ├── api.ts                — REST endpoints: /api/apps, status, config, db, prompt CRUD, tracker, files, archives, templates
│   ├── hooks.ts              — Claude Code Notification hook management for .claude/settings.local.json
│   ├── watcher.ts            — Chokidar file watcher → WebSocket broadcast, DB polling every 2s
│   └── ui/index.html         — Single-file vanilla JS frontend (dark theme, no build step)
└── templates/
    ├── claude-md.template.md — CLAUDE.md template with {{VAR}} substitution
    ├── code-implementation/  — Story → Tasks → Delivery (3 loops, multi-agent on tasks)
    └── research/             — Discovery → Research → Story → Document (4 loops, multi-agent on research)
```

## Tech Stack

- **Language:** TypeScript 5.6, ESM (`"type": "module"`, `.js` import extensions)
- **Bundler:** tsup (esbuild-based), single entry point → `dist/`
- **CLI:** commander.js for commands
- **Database:** better-sqlite3 with WAL mode for loop state persistence
- **Web:** Hono + @hono/node-server (HTTP), ws (WebSocket), chokidar (file watching)
- **Utilities:** chalk (terminal colors), cli-table3 (ASCII tables), yaml (YAML parsing), simple-git
- **Target:** Node.js >= 18

## Dev Commands

```bash
npm run build        # tsup → dist/ (ESM, node18 target)
npm run dev          # tsup --watch
npx tsc --noEmit     # Typecheck (no emit)
npm run lint         # eslint src/
```

## CLI Command Tree

```
ralphflow
├── (no args)              → start dashboard + open browser
├── init                   → scaffold new flow
│   ├── -t, --template     (code-implementation | research)
│   └── -n, --name         flow name
├── run <loop>             → run a loop
│   ├── --multi-agent      run as multi-agent instance
│   ├── --ui               start dashboard alongside
│   ├── -m, --model        Claude model
│   ├── -n, --max-iterations (default 30)
│   └── -f, --flow         flow name
├── e2e                    → run all loops end-to-end (SQLite orchestration)
│   ├── --ui
│   ├── -m, --model
│   ├── -n, --max-iterations
│   └── -f, --flow
├── status                 → show loop status
│   └── -f, --flow
└── dashboard (alias: ui)  → start web dashboard
    └── -p, --port         (default 4242)
```

## Key Patterns

### Path Resolution (dev vs bundled)
Templates and UI assets use dual-path resolution:
- Dev: `__dirname` → `../../templates/` (src/core/ → src/templates/)
- Bundled: `__dirname` → `../../src/templates/` (dist/ → src/templates/)
Same pattern in `template.ts` and `server.ts`.

### Completion Detection (4-level hierarchy in runner.ts)
1. `<promise>COMPLETION_STRING</promise>` in tracker
2. Plain text `COMPLETION_STRING` anywhere in tracker
3. All checkboxes checked (`- [x]` > 0, `- [ ]` = 0)
4. Metadata: all items have `{status: completed}`, none `in_progress`/`pending`

### Per-Loop Model Configuration
Each loop in `ralphflow.yaml` supports an optional `model` field (e.g., `model: claude-sonnet-4-6`). The runner resolves the effective model as: CLI `--model` flag (global override) → per-loop `model` from config → Claude default. Both built-in templates default all loops to `claude-sonnet-4-6`. The dashboard Edit panel includes a model selector dropdown that calls `PUT /api/apps/:app/config/model` to update the loop's model in `ralphflow.yaml`. Selecting "Default" removes the model field. Pipeline nodes display the model inline with the status badge, separated by a middot (·). The `formatModelName()` function strips the `claude-` prefix for compactness (e.g., `sonnet-4-6`). Loops with no explicit model show "default" in dimmed italic styling.

### Multi-Agent Coordination
- PID-based lock files in `.agents/` directory next to tracker
- `acquireAgentId()` claims `agent-N.lock`, `releaseAgentId()` removes on exit
- Stale agents auto-cleaned if PID not alive
- Prompt substitution: `{{AGENT_NAME}}` → `agent-1`, `{{APP_NAME}}` → flow dir name

### Tracker Format (Markdown)
```markdown
- stage: analyze
- active_task: TASK-3
- completed_tasks: [TASK-1, TASK-2]

| agent | active_task | stage | last_heartbeat |
|-------|-------------|-------|----------------|

- [x] TASK-1: Description {agent: agent-1, status: completed}
- [ ] TASK-2: Description {agent: agent-2, status: in_progress}
```

### Claude Hooks Management (dashboard/hooks.ts)
`installNotificationHook(cwd, port)` writes a Notification hook to `.claude/settings.local.json` that pipes Claude's attention events to the dashboard via `curl POST`. `removeNotificationHook(cwd)` removes only the RalphFlow-managed entry (identified by `# ralphflow-managed` marker comment), preserving user hooks. Both functions handle missing dirs, missing files, and malformed JSON gracefully.

### Hook Lifecycle (dashboard/server.ts)
`startDashboard()` automatically installs the notification hook on startup and removes it on shutdown. SIGINT/SIGTERM signal handlers call `close()` for cleanup on Ctrl+C. A `process.on('exit')` fallback ensures hook removal even if another handler exits first. Hook errors are caught and logged as warnings — never crash the dashboard. This works identically via `dashboard`, `run --ui`, or `e2e --ui`.

### Loop Context Environment Variables
The runner sets `RALPHFLOW_APP` (flow directory basename, e.g. `code-implementation`) and `RALPHFLOW_LOOP` (config key, e.g. `tasks-loop`) on every spawned Claude session. The hook command includes these as query params (`?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP`) so notifications route to the correct loop in the dashboard. When Claude runs outside ralphflow, the vars are unset and the API defaults to `"unknown"`.

### Dashboard WebSocket Events
- `status:full` — sent on connect and DB changes
- `tracker:updated` — sent on tracker.md file change (debounced 300ms)
- `file:changed` — sent on any .md/.yaml change in .ralph-flow/
- `notification:attention` — broadcast when POST /api/notification receives a hook payload
- `notification:dismissed` — broadcast when DELETE /api/notification/:id removes one

### App Archiving (dashboard/api.ts)
`POST /api/apps/:app/archive` snapshots the full app directory to `.ralph-flow/.archives/<appName>/<YYYY-MM-DD_HH-mm>/`, then resets the app in place: tracker files revert to template state, data files (stories.md, tasks.md) reset to headers only, `.agents/` dirs and lock files are cleaned up, and SQLite `loop_state` rows are deleted. Prompt files and `ralphflow.yaml` are preserved. Uses `resolveTemplatePath(config.name)` to find template originals for reset. Same-minute collisions append a sequence suffix (e.g., `2026-03-14_15-30-2`). The `.archives/` directory is dotfile-prefixed so `listFlows()` ignores it.

### Archive Browsing API (dashboard/api.ts)
Three endpoints for browsing archived snapshots: `GET /api/apps/:app/archives` lists all archives sorted newest-first, each with `timestamp`, `summary` ({storyCount, taskCount} parsed from markdown headers), and `fileCount`. `GET /api/apps/:app/archives/:timestamp/files` returns a recursive file listing within a specific archive. `GET /api/apps/:app/archives/:timestamp/files/*` reads a specific file's content. All endpoints validate paths against directory traversal. Returns empty array (not error) when no archives exist.

### Custom Template Storage (core/template.ts, dashboard/api.ts)
Custom templates are stored at `.ralph-flow/.templates/<name>/` with a generated `ralphflow.yaml` and scaffolded `loops/` directory. `POST /api/templates` accepts a `TemplateDefinition` (name, description, loops array with stages/completion/model/multi_agent) and creates the full directory structure. `GET /api/templates` returns both built-in and custom templates with metadata (type, description, loopCount). `DELETE /api/templates/:name` removes custom templates; built-in templates return 403. `POST /api/apps` resolves custom templates via `resolveTemplatePathWithCustom()` alongside built-ins. Loop keys are auto-suffixed with `-loop` to follow convention. Template names are validated against traversal and built-in name collisions.

### Template Creator UI (ui/index.html)
The sidebar has a "Manage" section with a "Templates" nav item. Clicking it shows the Templates page listing all templates (built-in read-only, custom with delete button). "Create Template" opens a builder form with: template name/description, dynamic loop cards (add/remove) each with name, model selector, stage tag input (Enter/comma to add), completion string, multi-agent toggle (max_agents/strategy/agent_placeholder sub-fields), and optional fields (data_files, entities). A live YAML preview updates on every change. Saving calls `POST /api/templates`. The Create App modal's template dropdown dynamically loads from `GET /api/templates` (includes custom templates). Custom templates can be deleted via confirmation modal calling `DELETE /api/templates/:name`. Page state managed via `currentPage` ('app'|'templates') with `showTemplateBuilder` and `templateBuilderState` for the builder form.

### Archive Viewer UI (ui/index.html)
The app detail view has a "Loops" / "Archives" tab bar below the app header. The "Loops" tab shows the existing pipeline, commands, and three-panel loop layout. The "Archives" tab fetches snapshots from `GET /api/apps/:app/archives` and renders them as expandable timeline cards (newest-first) showing date, story count, task count, and file count. Clicking a card loads its file listing; clicking a file displays its content inline in a read-only monospace viewer. Empty state shown when no archives exist. Tab selection (`activeAppTab`) persists when switching loops within the same app; resets to "Loops" on app change.

### Dashboard Notification UI (ui/index.html)
The Interactive panel (left column, top) renders per-loop attention notifications. Notifications are stored in `notificationsList` (client-side array hydrated from `GET /api/notifications` on load). Each card shows timestamp, message, and dismiss (X) button. Sidebar loop items display a `.notif-badge` count for undismissed notifications. Browser `Notification` API permission is requested on first notification; desktop toasts fire when the tab is in the background. An audible two-note chime (Web Audio API, ~250ms) plays on each notification — AudioContext is lazily initialized on first user interaction to satisfy browser autoplay policies.

## Conventions

- All imports use `.js` extensions (ESM)
- `__dirname` via `dirname(fileURLToPath(import.meta.url))`
- Loop keys are kebab-case: `story-loop`, `tasks-loop`
- Agent IDs are sequential: `agent-1`, `agent-2`, ...
- Config lives in `.ralph-flow/<appName>/ralphflow.yaml`
- No test framework — verification is manual and via the dashboard
- `package.json` `files` field: `dist/`, `src/templates/`, `src/dashboard/ui/`
- External dep `better-sqlite3` is marked external in tsup (not bundled)

## Publishing

```bash
npm run build         # prepublishOnly runs this automatically
npm publish --otp=... # Publishes to npm as "ralphflow"
git push origin main  # GitHub: rahulthakur319/ralph-flow
```
