# RalphFlow

<p align="center">
  <img src="WiggumFlow.png" alt="RalphFlow" width="400" />
</p>

Multi-agent AI workflow orchestration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Define pipelines as loops, coordinate parallel agents via file-based trackers, and ship structured work — from single-agent interactive sessions to multi-agent autonomous execution.

## Quick Start

```bash
# In your project with a CLAUDE.md
npx ralphflow
```

This starts the web dashboard at `http://localhost:4242` and opens it in your browser. From the dashboard you can create apps, run loops, edit prompts, monitor agents, and browse archives — all in one place.

### CLI Commands

```bash
# Initialize a new flow
npx ralphflow init --template code-implementation --name my-app

# Run loops
npx ralphflow run story
npx ralphflow run tasks
npx ralphflow run tasks --multi-agent   # Multi-agent — one terminal per agent
npx ralphflow run delivery

# Run with live dashboard alongside
npx ralphflow run tasks --ui
npx ralphflow e2e --ui

# Check status
npx ralphflow status
```

## How It Works

RalphFlow organizes work into **loops** — repeating cycles where Claude agents read a prompt, check a tracker, do work, update the tracker, and exit. The framework handles iteration, signal detection, and multi-agent coordination.

The default `code-implementation` template ships with three loops:

| Loop | Purpose | Mode |
|------|---------|------|
| **Story Loop** | Break features into stories and tasks | Interactive Claude Code session |
| **Tasks Loop** | Implement tasks, commit code, update CLAUDE.md | Single or multi-agent (`--multi-agent`) |
| **Delivery Loop** | Review completed work, gather feedback | Interactive Claude Code session |

### Pipeline Flow

```
Story Loop          Tasks Loop              Delivery Loop
┌──────────┐       ┌──────────────┐        ┌──────────────┐
│ Describe  │──────▶│ Implement    │───────▶│ Review       │
│ features  │       │ tasks        │        │ & feedback   │
└──────────┘       └──────────────┘        └──────────────┘
                    ▲  ▲  ▲
                    │  │  │
                   agent-1 agent-2 agent-3
```

## Web Dashboard

The dashboard (`http://localhost:4242`) is the primary interface for managing workflows.

**Features:**
- **Live pipeline view** — color-coded loop status (complete/running/pending)
- **Per-loop detail** — stage, active item, progress bar, agent table
- **Prompt editor** — edit prompt files with Cmd+S save and dirty indicator
- **Tracker viewer** — auto-updates as agents write via WebSocket
- **Model selector** — per-loop model configuration (claude-sonnet-4-6, claude-opus-4-6, etc.)
- **Attention notifications** — real-time alerts when Claude needs input, with desktop notifications and audio chime
- **App archiving** — snapshot and reset flows to start fresh
- **Archive browser** — browse past snapshots with timeline view and file viewer
- **Template creator** — build custom templates with a visual config builder and live YAML preview
- **Create app** — initialize new flows from built-in or custom templates

```bash
npx ralphflow dashboard              # Default port 4242
npx ralphflow dashboard -p 3000      # Custom port
npx ralphflow ui                     # Alias
```

## Commands

### `npx ralphflow` (no args)

Starts the dashboard and opens it in your browser. This is the recommended way to use RalphFlow.

### `npx ralphflow init`

Scaffolds a new flow in `.ralph-flow/<name>/`.

```bash
npx ralphflow init                                          # Interactive — pick template and name
npx ralphflow init --template code-implementation --name api # Non-interactive
npx ralphflow init --template research --name kashi          # Research pipeline
```

**Options:**
- `-t, --template <name>` — Template to use (`code-implementation`, `research`, or any custom template)
- `-n, --name <name>` — Custom name for the flow

### `npx ralphflow run <loop>`

Runs a loop. Handles the iteration cycle — spawning Claude, detecting completion signals, and restarting.

```bash
npx ralphflow run story                    # Run story loop (interactive Claude session)
npx ralphflow run tasks                    # Run tasks loop (single agent)
npx ralphflow run tasks --multi-agent      # Run as a multi-agent instance
npx ralphflow run tasks --ui              # Run with live dashboard alongside
npx ralphflow run tasks -m claude-opus-4-6  # Use a specific model
```

**Multi-agent mode:** Each terminal is one agent. Open multiple terminals, run `--multi-agent` in each, and they auto-assign sequential agent IDs (`agent-1`, `agent-2`, ...) via PID-based lock files.

**Options:**
- `--multi-agent` — Run as a multi-agent instance
- `--ui` — Start the web dashboard alongside execution
- `-m, --model <model>` — Claude model to use (overrides per-loop config)
- `-n, --max-iterations <n>` — Maximum iterations (default: 30)
- `-f, --flow <name>` — Which flow to run

### `npx ralphflow e2e`

Runs all loops end-to-end with SQLite orchestration. Skips loops already completed.

```bash
npx ralphflow e2e                   # Run all loops
npx ralphflow e2e --ui              # With live dashboard
```

**Options:**
- `--ui` — Start the web dashboard alongside
- `-m, --model <model>` — Claude model to use
- `-n, --max-iterations <n>` — Maximum iterations per loop (default: 30)
- `-f, --flow <name>` — Which flow to run

### `npx ralphflow status`

Shows the current state of all loops.

```
  RalphFlow — my-app

  Loop           Stage    Active  Progress
  Story Loop     analyze  none    0/0
  Tasks Loop     —        none    3/6
  Delivery Loop  idle     none    0/0
```

## Per-Loop Model Configuration

Each loop in `ralphflow.yaml` supports an optional `model` field:

```yaml
loops:
  story-loop:
    model: claude-sonnet-4-6
  tasks-loop:
    model: claude-opus-4-6
```

**Resolution order:** CLI `--model` flag → per-loop `model` from config → Claude default. The dashboard includes a model selector dropdown to configure this per loop.

## Templates

### Built-in

- **`code-implementation`** — Story → Tasks → Delivery pipeline for code projects
- **`research`** — Discovery → Research → Story → Document pipeline for research projects

### Custom Templates

Create custom templates via the dashboard's Template Creator or the API. Custom templates are stored in `.ralph-flow/.templates/` and appear alongside built-in templates when creating new apps.

## Multiple Flows

Run multiple flows in the same project for separate workstreams:

```bash
npx ralphflow init --template code-implementation --name frontend
npx ralphflow init --template code-implementation --name backend
npx ralphflow init --template research --name market-research
```

## Project Structure

After `npx ralphflow init --template code-implementation --name my-app`:

```
your-project/
├── CLAUDE.md                              # Project context (read + updated by agents)
└── .ralph-flow/
    └── my-app/
        ├── ralphflow.yaml                 # Pipeline config
        ├── 00-story-loop/
        │   ├── prompt.md                  # Agent instructions
        │   ├── tracker.md                 # State tracking
        │   └── stories.md                 # Story definitions
        ├── 01-tasks-loop/
        │   ├── prompt.md
        │   ├── tracker.md
        │   └── tasks.md
        └── 02-delivery-loop/
            ├── prompt.md
            └── tracker.md
```

## CLAUDE.md

`CLAUDE.md` is a first-class citizen of the workflow:

- **Story loop** reads it for project context
- **Tasks loop** reads it for architecture, stack, conventions, and commands — and updates it after each task
- **Delivery loop** reads it for project context and patterns

RalphFlow requires `CLAUDE.md` to exist before initializing a flow.

## Install

No install required — use `npx ralphflow` directly. Or install globally:

```bash
npm install -g ralphflow
```

## Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## License

[MIT](LICENSE)
