# Quick Start

Get RalphFlow running in your project in under a minute.

## Prerequisites

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- A project with a `CLAUDE.md` file

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

## Run a Loop

```bash
# Run the story loop (interactive Claude session)
npx ralphflow run story

# Run the tasks loop (single agent)
npx ralphflow run tasks

# Run tasks with multiple agents (one terminal per agent)
npx ralphflow run tasks --multi-agent

# Run with the dashboard alongside
npx ralphflow run tasks --ui
```

## Run End-to-End

```bash
# Execute all loops sequentially with SQLite orchestration
npx ralphflow e2e --ui
```

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

## What's Next?

- Read [Core Concepts](/guide/core-concepts) to understand loops, trackers, and pipelines
- Explore the [Dashboard Guide](/guide/dashboard) for the full web interface
- See the [Configuration Reference](/reference/configuration) for all `ralphflow.yaml` options
