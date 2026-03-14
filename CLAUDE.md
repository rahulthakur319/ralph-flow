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
docs/
├── .vitepress/config.ts     — VitePress configuration (nav, sidebar, dark theme, local search)
├── index.md                 — Homepage with hero section and feature cards
├── guide/
│   ├── quick-start.md       — Install, init, run, dashboard walkthrough
│   ├── core-concepts.md     — Loops, trackers, pipelines, multi-agent, completion detection
│   └── dashboard.md         — Web dashboard features and usage
└── reference/
    ├── configuration.md     — ralphflow.yaml schema reference
    ├── templates.md         — Built-in and custom template documentation
    └── api.md               — REST API and WebSocket endpoint reference
.github/workflows/docs.yml  — GitHub Actions: build VitePress + deploy to GitHub Pages
```

## Tech Stack

- **Language:** TypeScript 5.6, ESM (`"type": "module"`, `.js` import extensions)
- **Bundler:** tsup (esbuild-based), single entry point → `dist/`
- **CLI:** commander.js for commands
- **Database:** better-sqlite3 with WAL mode for loop state persistence
- **Web:** Hono + @hono/node-server (HTTP), ws (WebSocket), chokidar (file watching)
- **Utilities:** chalk (terminal colors), cli-table3 (ASCII tables), yaml (YAML parsing), simple-git
- **Docs:** VitePress (static site generation for documentation)
- **Target:** Node.js >= 18

## Dev Commands

```bash
npm run build        # tsup → dist/ (ESM, node18 target)
npm run dev          # tsup --watch
npx tsc --noEmit     # Typecheck (no emit)
npm run lint         # eslint src/
npm run docs:dev     # VitePress local dev server
npm run docs:build   # VitePress → docs/.vitepress/dist/
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

### Pipeline Progress Calculation
`calculatePipelineProgress(loops)` in `ui/index.html` computes weighted aggregate progress across loops. Returns `{ perLoop: [{key, completed, total, fraction}], completed, total, percentage }`. Loops with 0 total items are excluded from the denominator. Used by pipeline node rendering (TASK-4) and sidebar progress bars (TASK-6).

### Pipeline Node Progress Display
Each pipeline node shows a completion ratio (e.g., "3/7") and a 4px green progress bar below the status row. Progress data comes from `calculatePipelineProgress()` keyed by loop. Nodes with 0/0 items show an em dash and empty bar. The bar fill uses a 0.3s CSS transition for smooth updates. Classes: `.node-progress` (container), `.node-progress-text` (ratio), `.node-progress-bar` (track), `.node-progress-fill` (green fill).

### Pipeline Connector Coloring
Connectors between pipeline nodes turn green (`var(--green)`) when the left-adjacent loop is complete (`getLoopStatusClass() === 'complete'`). This creates a visual "flow" of green from left to right through completed loops. A CSS transition (0.3s) smooths color changes. The `.pipeline-connector.complete` class is toggled during pipeline rendering based on the previous loop's status.

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

### Clone Built-in Templates (core/template.ts, dashboard/api.ts)
`cloneBuiltInTemplate(cwd, sourceName, newName)` copies a built-in template's entire directory tree to `.ralph-flow/.templates/<newName>/` and patches the `name` field in the cloned `ralphflow.yaml`. `POST /api/templates/:name/clone` accepts `{ newName }` and returns 201 on success, 400 if source isn't built-in or name is invalid, 409 if target name exists. Only built-in templates can be cloned; custom templates already have full CRUD. The cloned template appears in `GET /api/templates` as type "custom" and is fully editable/deletable.

### Template Config & Prompt API (dashboard/api.ts)
Three endpoints for template configuration and prompt management: `GET /api/templates/:name/config` returns the parsed `ralphflow.yaml` for any template (built-in or custom). `GET /api/templates/:name/loops/:loopKey/prompt` reads a template's prompt file content. `PUT /api/templates/:name/loops/:loopKey/prompt` writes prompt content back to a custom template's prompt file. Built-in templates return 403 on write attempts. All endpoints validate path traversal. Prompt files are resolved via `templateDir/loops/<prompt_path>` since template loop files live under the `loops/` subdirectory.

### Template Creator UI (ui/index.html)
The sidebar has a "Manage" section with a "Templates" nav item. Clicking it shows the Templates page listing all templates (built-in read-only, custom with edit/delete buttons). "Create Template" opens a builder form with: template name/description, a pipeline minimap, dynamic loop cards (add/remove) each with name, model selector, stage tag input (Enter/comma to add), completion string, multi-agent toggle (max_agents/strategy/agent_placeholder sub-fields), optional fields (data_files, entities), and a collapsible prompt editor. A live YAML preview updates on every change. Saving calls `POST /api/templates`. The Create App modal's template dropdown dynamically loads from `GET /api/templates` (includes custom templates). Custom templates can be deleted via confirmation modal calling `DELETE /api/templates/:name`. Page state managed via `currentPage` ('app'|'templates') with `showTemplateBuilder`, `templateBuilderState`, and `editingTemplateName` for the builder form. Each loop in the builder state has `showPrompt` (toggle) and `prompt` (content) fields.

### Template Edit Mode (ui/index.html)
Custom template cards show an "Edit" button (built-in cards do not). Clicking it calls `loadTemplateForEdit(name)` which fetches `GET /api/templates/:name/config` and converts the config loops to builder state (loop names, stages, models, completion strings, multi-agent settings, data_files, entities). Prompt content for each loop is loaded via `GET /api/templates/:name/loops/:loopKey/prompt`. The builder header shows "Edit Template" and the save button shows "Update Template". Saving in edit mode deletes the old template (`DELETE /api/templates/:name`) then creates the updated one (`POST /api/templates`), supporting name changes. `editingTemplateName` tracks the original name being edited; it is cleared on back, cancel, save, or nav away.

### Builder Pipeline Minimap (ui/index.html)
The template builder renders a pipeline minimap between the Basic Info and Loops sections. Each loop appears as a connected node (`.builder-minimap-node`) with the loop name (or "Loop N" placeholder) and a numeric index. Nodes are connected by `.builder-minimap-connector` lines. A "+" button (`.builder-minimap-add`) at the end adds new loops. Clicking a minimap node scrolls to the corresponding `.loop-card` with smooth scrolling and a 1.5s highlight animation (`.loop-card.highlighted`). Bidirectional sync: an `IntersectionObserver` watches loop cards and highlights the corresponding minimap node (`.active` class) as the user scrolls. Loop name changes live-update minimap labels without re-render. The minimap is sticky-positioned at the top of the builder for persistent visibility during scrolling.

### Loop Drag-and-Drop Reordering (ui/index.html)
Both minimap nodes and loop cards support drag-and-drop reordering via the native HTML Drag and Drop API. Minimap nodes have `draggable="true"` with `cursor: grab`. Loop cards have `draggable="true"` with a grip handle (`⠿`, `.loop-card-drag-handle`) in the card header. Dragging shows visual feedback: the source gets `.dragging` (opacity 0.4, dashed border), drop targets get `.drag-over` (accent border + box-shadow). The `setupBuilderDragAndDrop()` function binds all drag events; `reorderLoops(fromIdx, toIdx)` calls `captureBuilderInputs()` then splices the loop array and re-renders. Card `dragleave` checks `e.relatedTarget` containment to prevent flicker from child elements. All loop configuration (name, stages, model, completion, multi-agent, prompts) is preserved during reorder. The YAML preview updates to reflect the new loop order.

### Loop Card Prompt Editor (ui/index.html)
Each loop card in the template builder has a collapsible "Show prompt" / "Hide prompt" toggle below the optional fields section. Expanding it reveals a monospace textarea (`.prompt-textarea`, `min-height: 160px`, `max-height: 400px`, `resize: vertical`) for writing prompt content. In create mode, the textarea starts empty with a placeholder. A "Use Builder" button below the textarea opens the block-based prompt builder. Prompt content is captured in the builder state and included in the `POST /api/templates` payload via `TemplateLoopDefinition.prompt`. The `createCustomTemplate()` function writes custom prompt content to `prompt.md` if provided, otherwise uses a default placeholder.

### Prompt Builder (ui/index.html)
A block-based prompt editor integrated into the template builder's prompt section. Activated via "Use Builder" button, it replaces the textarea with a three-panel layout (`.prompt-builder`, CSS grid `180px 1fr 1fr`): **Palette** (left) lists 7 structural block types — Header/Identity, State Machine, Tracker Protocol, Stage Instructions, Output Format, Rules, and Custom Section — plus a **Variable palette** below a divider showing clickable chips for `APP_NAME`, `AGENT_NAME`, and `LOOP_NAME`. **Sections** (center) shows added blocks as editable cards with drag-and-drop reordering (native HTML DnD API), up/down arrow buttons, duplicate, and remove actions. Each block's skeleton template contains meaningful placeholders (e.g., `{loop_name}`, `{stage_list}`, `{{APP_NAME}}`). **Preview** (right) shows the assembled prompt in real-time, updating on every keystroke; template variables (`{{VAR}}`) are visually highlighted in purple via `highlightVariables()`. Clicking a variable chip inserts `{{VAR_NAME}}` at the cursor position in the active block's textarea. "Done" compiles all blocks (joined by `---` separators) into the prompt textarea and returns to textarea mode. "Back to textarea" does the same without discarding changes. State per loop: `useBuilder` (boolean), `blocks` (array of `{id, label, content}`). The `PROMPT_BLOCK_TYPES` constant defines all block skeletons. The `PROMPT_VARIABLES` constant defines available variables with descriptions (shown as tooltips). `assemblePromptFromBlocks()` joins block content with `\n\n---\n\n` separators. When switching to builder mode with existing prompt text, it imports as a single Custom Section block.

### Archive Viewer UI (ui/index.html)
The app detail view has a "Loops" / "Archives" tab bar below the app header. The "Loops" tab shows the existing pipeline, commands, and three-panel loop layout. The "Archives" tab fetches snapshots from `GET /api/apps/:app/archives` and renders them as expandable timeline cards (newest-first) showing date, story count, task count, and file count. Clicking a card loads its file listing; clicking a file displays its content inline in a read-only monospace viewer. Empty state shown when no archives exist. Tab selection (`activeAppTab`) persists when switching loops within the same app; resets to "Loops" on app change.

### Dashboard Notification UI (ui/index.html)
The Interactive panel (left column, top) renders per-loop attention notifications. Notifications are stored in `notificationsList` (client-side array hydrated from `GET /api/notifications` on load). Each card shows timestamp, message, and dismiss (X) button. Sidebar loop items display a `.notif-badge` count for undismissed notifications. Browser `Notification` API permission is requested on first notification; desktop toasts fire when the tab is in the background. An audible two-note chime (Web Audio API, ~250ms) plays on each notification — AudioContext is lazily initialized on first user interaction to satisfy browser autoplay policies.

### Documentation Site (docs/)
VitePress-powered documentation site deployed to GitHub Pages via `.github/workflows/docs.yml`. The site is configured in `docs/.vitepress/config.ts` with nav bar (Guide, Reference, version dropdown), sidebar groups (Getting Started, Using RalphFlow, Reference), local search, dark theme, and edit links. The `base` is set to `/ralph-flow/` matching the GitHub Pages URL. Pages live in `docs/guide/` (quick-start, core-concepts, dashboard) and `docs/reference/` (configuration, templates, api). The GitHub Actions workflow triggers on push to main, builds with `npm run docs:build`, and deploys via `actions/deploy-pages`. Local development: `npm run docs:dev`.

### Documentation Content (docs/)
Guide pages: `quick-start.md` covers install/init/run/dashboard walkthrough; `core-concepts.md` explains loops, trackers, pipelines, multi-agent, completion detection; `dashboard.md` covers full dashboard features (pipeline view, loop panels, archiving, templates, hooks, real-time updates). Reference pages: `configuration.md` documents every `ralphflow.yaml` field with types, defaults, and complete examples for both built-in templates; `templates.md` covers built-in/custom/clone workflows, directory structure, validation rules, prompt variables; `api.md` lists all REST endpoints with HTTP methods, request/response JSON schemas, status codes, plus WebSocket event schemas.

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
