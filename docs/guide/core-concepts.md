# Core Concepts

Understanding the building blocks of RalphFlow.

## Loops

A **loop** is a repeating cycle where a Claude agent:

1. Reads a **prompt** (instructions for this loop)
2. Checks a **tracker** (current state of work)
3. Does work (writes code, generates content, etc.)
4. Updates the tracker
5. Exits — the framework restarts the cycle

```
┌─────────────────────────────────────┐
│            Loop Iteration           │
│                                     │
│  Read Prompt → Check Tracker →      │
│  Do Work → Update Tracker → Exit    │
│                                     │
└──────────────┬──────────────────────┘
               │ restart
               ▼
┌─────────────────────────────────────┐
│          Next Iteration             │
│  (until completion detected)        │
└─────────────────────────────────────┘
```

Each iteration spawns a fresh Claude session with the prompt. The tracker persists state between iterations — Claude reads where things left off and continues from there.

Loops continue until a **completion signal** is detected (see [Completion Detection](#completion-detection) below).

### Iteration Limits

By default, a loop runs for up to **30 iterations**. You can override this with `--max-iterations`:

```bash
npx ralphflow run tasks --max-iterations 50
```

### Exit Codes

The runner interprets Claude's exit codes:
- **SIGINT (130):** Normal iteration boundary — Claude exits itself to let the framework restart it fresh
- **0 or null:** Normal exit — continue to next iteration
- **Other codes:** Error — stop the loop

## Pipelines

Loops are organized into **pipelines** — ordered sequences where each loop's output feeds into the next. Pipelines define the overall workflow structure.

### Code Implementation Pipeline

```
Story Loop  →  Tasks Loop  →  Delivery Loop
(analyze)      (implement)     (review)
```

| Loop | Purpose | Stages |
|------|---------|--------|
| Story Loop | Break features into stories and tasks | analyze, clarify, decompose |
| Tasks Loop | Implement tasks (supports multi-agent) | understand-execute, verify-document |
| Delivery Loop | Review completed work | review, present-and-feedback, resolution |

### Research Pipeline

```
Discovery  →  Research  →  Story  →  Document
(explore)     (investigate) (draft)   (compile)
```

| Loop | Purpose | Stages |
|------|---------|--------|
| Discovery | Identify topics and research areas | scope, explore, decompose |
| Research | Investigate topics (supports multi-agent) | investigate, synthesize |
| Story | Synthesize findings into narratives | draft, refine |
| Document | Produce final documentation | compile |

### Pipeline Connections

Each loop declares its position in the pipeline with `feeds` and `fed_by` fields in the config:

```yaml
loops:
  story-loop:
    feeds: tasks-loop        # Output goes to tasks-loop
  tasks-loop:
    fed_by: story-loop       # Input comes from story-loop
    feeds: delivery-loop
  delivery-loop:
    fed_by: tasks-loop
```

These connections determine execution order in `e2e` mode and create the visual pipeline in the dashboard.

## Trackers

A **tracker** (`tracker.md`) is the single source of truth for a loop's state. It's a structured markdown file that Claude reads at the start of each iteration and updates before exiting.

### Tracker Structure

```markdown
# Story Loop — Tracker

- stage: decompose
- active_story: STORY-3
- completed_stories: [STORY-1, STORY-2]

## Stories Queue

- [x] STORY-1: User authentication {status: completed}
- [x] STORY-2: Dashboard layout {status: completed}
- [ ] STORY-3: API endpoints {status: in_progress}
- [ ] STORY-4: Search feature {status: pending}
```

Key elements:
- **Metadata** — key-value pairs like `stage`, `active_task`, `completed_tasks`
- **Checkboxes** — `- [x]` for done, `- [ ]` for pending/in-progress
- **Status metadata** — `{status: completed}`, `{status: in_progress}`, `{status: pending}`
- **Agent table** — tracks active agents in multi-agent loops

### Multi-Agent Tracker

In multi-agent mode, the tracker includes an agent status table and per-task agent assignments:

```markdown
- completed_tasks: [TASK-1, TASK-2]

## Agent Status

| agent | active_task | stage | last_heartbeat |
|-------|-------------|-------|----------------|
| agent-1 | TASK-3 | execute | 2026-03-14T10:30:00Z |
| agent-2 | TASK-4 | verify | 2026-03-14T10:29:45Z |

## Tasks Queue

- [x] TASK-1: Setup database {agent: agent-1, status: completed}
- [x] TASK-2: Create models {agent: agent-2, status: completed}
- [ ] TASK-3: Build API {agent: agent-1, status: in_progress}
- [ ] TASK-4: Write tests {agent: agent-2, status: in_progress}
- [ ] TASK-5: Deploy {agent: -, status: blocked}
```

The tracker is the coordination mechanism — agents read it to find available work, claim tasks by writing their agent name, and mark tasks complete when done.

## Completion Detection

RalphFlow uses a 4-level hierarchy to detect when a loop is done. The runner checks these in order after each iteration — the first match wins:

### Level 1: Promise Tag (Highest Priority)

A promise wrapper in the tracker signals explicit completion:

```markdown
<promise>ALL STORIES PROCESSED</promise>
```

The completion string (e.g., `ALL STORIES PROCESSED`) is configured per loop in `ralphflow.yaml`.

### Level 2: Plain Text Match

The completion string appears anywhere in the tracker as plain text:

```markdown
ALL STORIES PROCESSED
```

### Level 3: All Checkboxes Checked

Every checkbox in the tracker is checked — there are checked items (`[x]` > 0) and no unchecked items (`[ ]` = 0):

```markdown
- [x] STORY-1: Done
- [x] STORY-2: Done
- [x] STORY-3: Done
```

### Level 4: Metadata Status

All items have `status: completed` and none have `status: in_progress` or `status: pending`:

```markdown
- [x] TASK-1: Setup {status: completed}
- [x] TASK-2: Build {status: completed}
- [x] TASK-3: Deploy {status: completed}
```

### Configuring Completion

Each loop defines its completion string in `ralphflow.yaml`:

```yaml
loops:
  story-loop:
    completion: ALL STORIES PROCESSED
  tasks-loop:
    completion: ALL TASKS COMPLETE
  delivery-loop:
    completion: ALL DELIVERABLES PRESENTED
```

## Multi-Agent Coordination

For loops that support multi-agent mode (like the tasks loop), RalphFlow coordinates parallel Claude instances working on the same codebase.

### Agent ID Assignment

When you run with `--multi-agent`, each process gets a unique agent ID:

```
agent-1, agent-2, agent-3, ...
```

IDs are assigned via PID-based lock files in the `.agents/` directory next to the tracker. Each lock file contains the process PID:

```
.agents/
├── agent-1.lock    # Contains PID of agent-1's process
├── agent-2.lock    # Contains PID of agent-2's process
└── agent-3.lock
```

### Stale Agent Cleanup

If an agent crashes, its lock file remains but the PID is no longer alive. On startup, the runner checks all existing lock files with `kill -0` — if the PID isn't running, the lock is cleaned up and the ID is available for reuse.

### Prompt Substitution

Multi-agent prompts use template variables that get replaced at runtime:

| Variable | Replaced With | Example |
|----------|--------------|---------|
| `{{AGENT_NAME}}` | The agent's assigned ID | `agent-2` |
| `{{APP_NAME}}` | The flow directory name | `code-implementation` |

### Task Coordination

Agents coordinate exclusively through the tracker file:

1. **Claim** — An agent writes its name on an unclaimed task: `{agent: agent-2, status: in_progress}`
2. **Work** — The agent implements the task, committing code
3. **Complete** — The agent marks the task done: `{agent: agent-2, status: completed}`
4. **Next** — The agent reads the tracker for the next available task

A lock protocol prevents race conditions when multiple agents write to the tracker simultaneously.

### Configuration

Multi-agent is enabled per loop in `ralphflow.yaml`:

```yaml
loops:
  tasks-loop:
    multi_agent:
      enabled: true
      max_agents: 4
      strategy: task-based
      agent_placeholder: "{{AGENT_NAME}}"
```

## Per-Loop Model Configuration

Each loop can use a different Claude model:

```yaml
loops:
  story-loop:
    model: claude-sonnet-4-6    # Fast, for story decomposition
  tasks-loop:
    model: claude-opus-4-6      # Capable, for complex coding
```

### Resolution Order

The effective model for a loop is determined by this priority:

1. **CLI `--model` flag** — overrides everything (applies to all loops)
2. **Per-loop `model` field** — set in `ralphflow.yaml`
3. **Claude default** — if neither is set, Claude uses its internal default

```bash
# Override all loops to use opus
npx ralphflow e2e --model claude-opus-4-6
```

The model can also be changed per loop from the dashboard's Edit panel.

## Environment Variables

The runner sets environment variables on every spawned Claude session:

| Variable | Value | Example |
|----------|-------|---------|
| `RALPHFLOW_APP` | Flow directory basename | `code-implementation` |
| `RALPHFLOW_LOOP` | Config key of the current loop | `tasks-loop` |

These are used by notification hooks to route events to the correct loop in the dashboard.

## E2E Orchestration

The `e2e` command runs all loops in pipeline order with SQLite-based state tracking:

1. Loops run sequentially by their `order` field (0, 1, 2, ...)
2. SQLite tracks which loops completed in the current cycle
3. Completed loops are skipped on re-entry
4. The first loop (story discovery) always re-enters to check for new work
5. After all loops complete, the runner checks for undelivered work
6. If undelivered work is found, it resets and cycles again

This creates an automated workflow: define stories → implement tasks → review deliverables → cycle back if needed.

## What's Next?

- Follow the [Quick Start](/guide/quick-start) to set up your first pipeline
- Explore the [Dashboard Guide](/guide/dashboard) for the web interface
- See the [Configuration Reference](/reference/configuration) for all config options
- Learn about [Templates](/reference/templates) for built-in and custom pipelines
