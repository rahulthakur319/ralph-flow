# Quick Start

Get RalphFlow running in your project in under a minute.

## Prerequisites

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- A project with a `CLAUDE.md` file

## Install

```bash
npm install -g ralphflow
```

Or use it directly with `npx`:

```bash
npx ralphflow
```

## Launch the Dashboard

```bash
npx ralphflow
```

This starts the web dashboard at `http://localhost:4242` and opens it in your browser. From here you can create apps, run loops, edit prompts, and monitor agents.

## Create Your First App

### From the Dashboard

1. Click **"Create App"** in the sidebar
2. Select a template (`code-implementation` or `research`)
3. Enter a name for your flow
4. Click **Create**

### From the CLI

```bash
npx ralphflow init --template code-implementation --name my-app
```

This scaffolds the flow in `.ralph-flow/my-app/` with a pipeline config, prompts, trackers, and data files.

### Generated File Structure

After initialization, your project will have a `.ralph-flow/` directory with this structure:

```
.ralph-flow/my-app/
├── ralphflow.yaml              # Pipeline configuration
├── 00-story-loop/
│   ├── prompt.md               # Claude's instructions for this loop
│   ├── tracker.md              # Work state tracker
│   └── stories.md              # Data file for stories
├── 01-tasks-loop/
│   ├── prompt.md
│   ├── tracker.md
│   └── tasks.md                # Data file for tasks
└── 02-delivery-loop/
    ├── prompt.md
    └── tracker.md
```

The `ralphflow.yaml` file defines the pipeline — which loops exist, what order they run in, how they connect to each other, and what signals indicate completion.

## Run a Loop

Each loop is a repeating cycle where Claude reads the prompt, checks the tracker, does work, and exits. The framework restarts the cycle until completion is detected.

```bash
# Run the story loop (interactive Claude session)
npx ralphflow run story

# Run the tasks loop (single agent)
npx ralphflow run tasks

# Run tasks with multiple agents (one terminal per agent)
npx ralphflow run tasks --multi-agent

# Run with the dashboard alongside
npx ralphflow run tasks --ui

# Use a specific model
npx ralphflow run story --model claude-opus-4-6

# Limit iterations
npx ralphflow run tasks --max-iterations 10
```

### Loop Aliases

You don't need to type the full loop key. These shorthand aliases work:

| Alias | Loop Key |
|-------|----------|
| `story`, `stories` | `story-loop` |
| `tasks`, `task` | `tasks-loop` |
| `delivery`, `deliver` | `delivery-loop` |
| `discovery`, `discover` | `discovery-loop` |
| `research` | `research-loop` |
| `document`, `doc` | `document-loop` |

## Run End-to-End

The `e2e` command runs all loops in sequence with SQLite orchestration. It tracks which loops are complete and skips them on subsequent cycles.

```bash
# Execute all loops sequentially
npx ralphflow e2e

# With the dashboard alongside
npx ralphflow e2e --ui
```

The e2e runner automatically cycles through loops, detects undelivered work, and re-enters earlier loops as needed.

## Check Status

```bash
npx ralphflow status
```

```
  RalphFlow — my-app

  Loop           Stage    Active  Progress
  Story Loop     analyze  none    0/0
  Tasks Loop     —        none    3/6
  Delivery Loop  idle     none    0/0
```

Use `--flow` to specify which app if you have multiple:

```bash
npx ralphflow status --flow my-app
```

## Multi-Agent Mode

For loops that support it (like the tasks loop), you can run multiple agents in parallel. Open one terminal per agent:

```bash
# Terminal 1
npx ralphflow run tasks --multi-agent

# Terminal 2
npx ralphflow run tasks --multi-agent

# Terminal 3
npx ralphflow run tasks --multi-agent
```

Each agent gets a unique ID (`agent-1`, `agent-2`, etc.) and claims tasks from the shared tracker. Agents coordinate via file-based locks to avoid conflicts.

## CLI Reference

```
ralphflow
├── (no args)              → start dashboard + open browser
├── init                   → scaffold new flow
│   ├── -t, --template     template name
│   └── -n, --name         flow name
├── run <loop>             → run a loop
│   ├── --multi-agent      run as multi-agent instance
│   ├── --ui               start dashboard alongside
│   ├── -m, --model        Claude model to use
│   ├── -n, --max-iterations  max iterations (default: 30)
│   └── -f, --flow         flow name
├── e2e                    → run all loops end-to-end
│   ├── --ui               start dashboard alongside
│   ├── -m, --model        Claude model
│   ├── -n, --max-iterations  max per loop (default: 30)
│   └── -f, --flow         flow name
├── status                 → show pipeline status
│   └── -f, --flow         flow name
└── dashboard (alias: ui)  → start web dashboard
    └── -p, --port         port number (default: 4242)
```

## What's Next?

- Read [Core Concepts](/guide/core-concepts) to understand loops, trackers, and pipelines
- Explore the [Dashboard Guide](/guide/dashboard) for the full web interface
- See the [Configuration Reference](/reference/configuration) for all `ralphflow.yaml` options
- Browse the [Templates Reference](/reference/templates) for built-in and custom template details
