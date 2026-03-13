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

The interactive menu lets you initialize apps, run individual loops, run all loops in sequence, launch the web dashboard, or check status — no flags needed.

### Advanced Usage

```bash
# Non-interactive commands (same as before)
npx ralphflow init --template code-implementation --name my-app
npx ralphflow run story
npx ralphflow run tasks
npx ralphflow run tasks --multi-agent   # Multi-agent — one terminal per agent
npx ralphflow run delivery
npx ralphflow status

# Web dashboard
npx ralphflow dashboard                 # Start dashboard at http://localhost:4242
npx ralphflow run tasks --ui            # Run with live dashboard alongside
npx ralphflow e2e --ui                  # E2E with live dashboard
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

## Commands

All commands are run via `npx ralphflow` — no global install needed.

### `npx ralphflow init`

Scaffolds a new flow in `.ralph-flow/<name>/`.

```bash
npx ralphflow init                                          # Interactive — pick template and name
npx ralphflow init --template code-implementation --name api # Non-interactive
npx ralphflow init --template research --name kashi          # Research pipeline
```

Requires `CLAUDE.md` to exist in your project root. If it doesn't, you'll be prompted to create one first.

**Options:**
- `-t, --template <name>` — Template to use (`code-implementation`, `research`)
- `-n, --name <name>` — Custom name for the flow

### `npx ralphflow run <loop>`

Runs a loop. Handles the iteration cycle — spawning Claude, detecting completion signals, and restarting on `kill -INT $PPID`.

```bash
npx ralphflow run story                    # Run story loop (interactive Claude session)
npx ralphflow run tasks                    # Run tasks loop (single agent)
npx ralphflow run tasks --multi-agent      # Run as a multi-agent instance (auto-assigns agent ID)
npx ralphflow run delivery                 # Run delivery loop
npx ralphflow run story --flow my-app      # Specify which flow (when multiple exist)
npx ralphflow run tasks --max-iterations 5 # Limit iterations
```

Each `run` command opens a full interactive Claude Code session. Claude owns the terminal — you see everything it does in real time.

**Multi-agent mode:** Instead of spawning N agents from one process, each terminal is one agent. Open multiple terminals, run `--multi-agent` in each, and they auto-assign sequential agent IDs (`agent-1`, `agent-2`, ...) via PID-based lock files. Stale agents are automatically cleaned up.

**Options:**
- `--multi-agent` — Run as a multi-agent instance (auto-assigns agent ID)
- `--ui` — Start the web dashboard alongside execution
- `-m, --model <model>` — Claude model to use
- `-n, --max-iterations <n>` — Maximum iterations (default: 30)
- `-f, --flow <name>` — Which flow to run (auto-detected if only one exists)

### `npx ralphflow dashboard`

Starts a real-time web dashboard at `http://localhost:4242`. Shows all apps, loop pipelines, tracker status, and lets you edit prompt files — all updated live via WebSocket as agents work.

```bash
npx ralphflow dashboard              # Default port 4242
npx ralphflow dashboard -p 3000      # Custom port
npx ralphflow ui                     # Alias
```

**Features:**
- Live pipeline view with color-coded status (complete/running/pending)
- Per-loop detail: stage, active item, progress bar, agent table
- Prompt editor with Cmd+S save and dirty indicator
- Live tracker viewer (auto-updates as agents write)
- WebSocket auto-reconnect with exponential backoff

**Options:**
- `-p, --port <port>` — Port number (default: 4242)

### `npx ralphflow e2e`

Runs all loops end-to-end with SQLite orchestration. Skips loops already completed.

```bash
npx ralphflow e2e                   # Run all loops
npx ralphflow e2e --ui              # With live dashboard
npx ralphflow e2e --flow my-app     # Specific flow
```

**Options:**
- `--ui` — Start the web dashboard alongside execution
- `-m, --model <model>` — Claude model to use
- `-n, --max-iterations <n>` — Maximum iterations per loop (default: 30)
- `-f, --flow <name>` — Which flow to run (auto-detected if only one exists)

### `npx ralphflow status`

Shows the current state of all loops across all flows.

```bash
npx ralphflow status                # All flows
npx ralphflow status --flow my-app  # Specific flow
```

```
  RalphFlow — my-app

  Loop           Stage    Active  Progress
  Story Loop     analyze  none    0/0
  Tasks Loop     —        none    3/6
  Delivery Loop  idle     none    0/0
```

**Options:**
- `-f, --flow <name>` — Show status for a specific flow

## Multiple Flows

You can run multiple flows in the same project — useful for separate workstreams:

```bash
npx ralphflow init --template code-implementation --name frontend
npx ralphflow init --template code-implementation --name backend
npx ralphflow init --template research --name market-research

npx ralphflow status  # Shows all three
```

When multiple flows exist, use `--flow <name>` with `run` and `status`.

## Templates

### `code-implementation`

Story → Tasks → Delivery pipeline for code projects. Battle-tested across 28 stories and 84 tasks.

### `research`

Discovery → Research → Story → Document pipeline for research projects. Four loops: discovery (decompose topics), research (investigate with multi-agent), story (synthesize narratives), and document (compile final output).

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
        │   ├── stories.md                 # Story definitions
        │   └── loop.md                    # Manual run instructions
        ├── 01-tasks-loop/
        │   ├── prompt.md
        │   ├── tracker.md
        │   ├── tasks.md
        │   ├── loop.md
        │   ├── phases/                    # Phase documentation
        │   └── testing/                   # Test documentation
        └── 02-delivery-loop/
            ├── prompt.md
            ├── tracker.md
            └── loop.md
```

## CLAUDE.md

`CLAUDE.md` is a first-class citizen of the workflow:

- **Story loop** reads it for project context
- **Tasks loop** reads it for architecture, stack, conventions, commands, and URLs
- **Tasks loop updates it** after each task (keeping changes under 150 words net)
- **Delivery loop** reads it for project context and patterns

RalphFlow requires `CLAUDE.md` to exist before initializing a flow. Create one with your project description, tech stack, dev commands, and conventions — or let Claude generate it for you.

## Install

No install required — use `npx ralphflow` directly. Or install globally:

```bash
npm install -g ralphflow
```

Then use without the `npx` prefix:

```bash
ralphflow init --template code-implementation --name my-app
ralphflow run story
ralphflow status
```

## Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

## License

[MIT](LICENSE)
