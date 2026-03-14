# Dashboard Guide

The RalphFlow dashboard is a web interface for managing workflows, monitoring agent progress, and configuring pipelines. It runs as a local server with real-time updates via WebSocket.

## Starting the Dashboard

```bash
npx ralphflow dashboard         # Default port 4242
npx ralphflow ui                # Alias
npx ralphflow dashboard -p 3000 # Custom port
```

The dashboard is also started automatically with the `--ui` flag on `run` and `e2e` commands:

```bash
npx ralphflow run story-loop --ui    # Run loop + dashboard
npx ralphflow e2e --ui               # Run all loops + dashboard
```

The browser opens automatically on startup. The dashboard runs on `http://127.0.0.1:4242`.

## Layout Overview

The dashboard has two main pages: **Apps** (default) and **Templates**, accessible via the sidebar.

### Sidebar

The left sidebar shows:

- **Apps section** — all apps in `.ralph-flow/`, each showing:
  - App name and template type badge
  - Per-app progress bar (aggregate completion percentage)
  - Expandable loop list with notification badges
- **Manage section** — navigation to the Templates page

Clicking an app selects it and shows its detail view. Clicking a loop within an app selects that loop.

## Pipeline View

The top of the app detail view shows the pipeline as connected horizontal nodes:

```
[Story ● complete · sonnet-4-6 3/3] ——— [Tasks ● running · sonnet-4-6 5/12] ——— [Delivery ● pending 0/0]
```

Each pipeline node displays:

- **Loop name** — the display name from config
- **Status badge** — `complete` (green), `running`/`in-progress` (blue), `pending`/`inactive` (gray)
- **Model label** — formatted model name (e.g., `sonnet-4-6`), or "default" in italic if none configured
- **Progress ratio** — completion count (e.g., `5/12`), or `—` for loops with no items
- **Progress bar** — 4px green bar showing completion percentage

**Connectors** between nodes turn green when the left-adjacent loop is complete, creating a visual "flow" of completion from left to right.

Clicking a pipeline node selects that loop and shows its detail panels.

## Loop Detail Panels

When a loop is selected, three panels appear below the pipeline:

### Interactive Panel (Left)

Shows attention notifications for the selected loop. Each notification card includes:

- Timestamp
- Message content from Claude
- Dismiss button (×)

When Claude needs human attention during a loop, the notification appears here with an audible two-note chime and a browser desktop notification (if the tab is in the background). The sidebar shows a red badge count for undismissed notifications per loop.

### Progress Panel (Center)

Displays the loop's current state:

- **Stage** — current stage from the tracker
- **Active task** — which task is being worked on
- **Progress bar** — visual completion indicator
- **Stage flow** — labels showing the loop's stage sequence
- **Agent table** — for multi-agent loops, shows each agent's active task, stage, and last heartbeat

All data updates in real-time via WebSocket as tracker files change.

### Edit Panel (Right)

A tabbed panel for viewing and editing loop files:

- **Prompt tab** — editable prompt content with a dirty indicator (dot) when unsaved. Changes are saved to disk via the API.
- **Tracker tab** — read-only view of the tracker markdown, updated in real-time.
- **Config tab** — model selector dropdown to change the loop's Claude model. Selecting "Default" removes the model field. Changes persist to `ralphflow.yaml`.

## Commands

Below the pipeline, the app detail view shows copyable CLI commands:

- Run the first loop: `npx ralphflow run story-loop -f my-project`
- Run end-to-end: `npx ralphflow e2e -f my-project`

Click the command to copy it to the clipboard.

## Creating Apps

Click the **+ Create App** button in the sidebar header to create a new app:

1. Select a template from the dropdown (loads both built-in and custom templates)
2. Enter an app name
3. Click **Create**

The app is scaffolded under `.ralph-flow/<name>/` and appears in the sidebar.

## App Archiving

Archive an app to snapshot its current state and reset it for a fresh run.

1. Click the **Archive** button in the app header
2. Review the confirmation modal (snapshot saved, data preserved, app reset)
3. Click **Confirm**

The archive process:
- Copies the full app directory to `.ralph-flow/.archives/<app>/<timestamp>/`
- Resets tracker and data files to their template defaults
- Cleans up agent lock files
- Clears database state

### Browsing Archives

Switch to the **Archives** tab in the app detail view to browse past snapshots:

- Archives appear as timeline cards, newest-first
- Each card shows the date, story count, task count, and file count
- Click a card to expand its file listing
- Click a file to view its content inline in a read-only viewer

## Template Management

Navigate to **Templates** in the sidebar to manage pipeline templates.

### Template Gallery

Templates are displayed as cards:

- **Built-in templates** — read-only, with a **Clone** button
- **Custom templates** — with **Edit** and **Delete** buttons

### Creating Templates

Click **Create Template** to open the template builder:

1. **Basic Info** — enter template name and description
2. **Pipeline Minimap** — visual representation of the loop chain. Click a node to scroll to its loop card. Click the "+" button to add a loop.
3. **Loop Cards** — configure each loop:
   - Name and model selector
   - Stages (type and press Enter or comma to add tags)
   - Completion string
   - Multi-agent toggle (expands to max_agents, strategy, agent_placeholder)
   - Optional fields (data files, entities)
   - Prompt editor (plain textarea or block-based builder)
4. **YAML Preview** — live preview of the generated configuration

Loop cards and minimap nodes support **drag-and-drop reordering** — drag a card's grip handle or a minimap node to change the pipeline order.

### Editing Templates

Click **Edit** on a custom template card to re-open it in the builder with all fields pre-populated. The builder header shows "Edit Template" and saving updates the existing template. Template name changes are supported.

### Cloning Built-in Templates

Click **Clone** on a built-in template card, enter a new name, and the entire template (config, prompts, trackers, data files) is copied as a new custom template that you can freely edit.

### Prompt Builder

The template builder's prompt section offers two editing modes:

- **Textarea mode** — plain monospace textarea for writing prompts directly
- **Builder mode** — activated via "Use Builder", a three-panel block editor:
  - **Palette** (left) — 7 structural block types: Header/Identity, State Machine, Tracker Protocol, Stage Instructions, Output Format, Rules, Custom Section
  - **Sections** (center) — added blocks as editable, reorderable cards with drag-and-drop, arrow buttons, duplicate, and remove
  - **Preview** (right) — live assembled prompt updating on every keystroke

Click "Done" to compile blocks into the prompt textarea. "Back to textarea" returns to raw editing.

## Notification Hooks

The dashboard automatically installs a Claude Code notification hook on startup and removes it on shutdown. This hook routes Claude's attention events to the dashboard via a `curl POST` to `/api/notification`.

### How It Works

1. Dashboard starts → writes hook to `.claude/settings.local.json`
2. Claude sends a notification → hook POSTs to the dashboard API
3. Dashboard broadcasts a WebSocket event → UI shows the notification card
4. Dashboard shuts down → removes the hook entry

The hook is identified by a `# ralphflow-managed` marker comment. Only the RalphFlow-managed hook is removed on shutdown — user-configured hooks are preserved.

### Environment Variables

The runner sets two environment variables on every spawned Claude session:

| Variable | Value | Example |
|----------|-------|---------|
| `RALPHFLOW_APP` | Flow directory basename | `code-implementation` |
| `RALPHFLOW_LOOP` | Config loop key | `tasks-loop` |

These are included as query parameters in hook requests so notifications route to the correct loop in the dashboard.

## Real-Time Updates

The dashboard maintains a WebSocket connection for live updates. No manual refresh is needed.

| Event | Trigger | Effect |
|-------|---------|--------|
| `status:full` | Connection, DB change (polled every 2s), tracker change | Full state refresh |
| `tracker:updated` | Tracker file change (debounced 300ms) | Loop progress update |
| `file:changed` | Any `.md`/`.yaml` change in `.ralph-flow/` | File content refresh |
| `notification:attention` | Claude hook POST | Notification card + chime + badge |
| `notification:dismissed` | Dismiss button clicked | Notification removed |

See the [API Reference](/reference/api#websocket-events) for full event schemas.
