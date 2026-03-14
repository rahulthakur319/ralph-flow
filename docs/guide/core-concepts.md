# Core Concepts

Understanding the building blocks of RalphFlow.

## Loops

A **loop** is a repeating cycle where a Claude agent:

1. Reads a **prompt** (instructions for this loop)
2. Checks a **tracker** (current state of work)
3. Does work (writes code, generates content, etc.)
4. Updates the tracker
5. Exits — the framework restarts the cycle

Loops continue until a **completion signal** is detected.

## Pipelines

Loops are organized into **pipelines** — ordered sequences where each loop's output feeds into the next. The `code-implementation` template defines this pipeline:

```
Story Loop → Tasks Loop → Delivery Loop
```

Each loop has `feeds` and `fed_by` fields in the config that define the data flow between loops.

## Trackers

A **tracker** (`tracker.md`) is the single source of truth for a loop's state. It's a structured markdown file containing:

- Current stage
- Active task/item
- Completed items list
- Agent status table (for multi-agent loops)
- Task queue with metadata
- Dependencies between items
- Activity log

```markdown
- stage: execute
- active_task: TASK-3
- completed_tasks: [TASK-1, TASK-2]

| agent | active_task | stage | last_heartbeat |
|-------|-------------|-------|----------------|

- [x] TASK-1: Description {agent: agent-1, status: completed}
- [ ] TASK-2: Description {agent: agent-2, status: in_progress}
```

## Completion Detection

RalphFlow uses a 4-level hierarchy to detect when a loop is done:

1. **Promise tag** — `<promise>COMPLETION_STRING</promise>` in the tracker
2. **Plain text** — The completion string appears anywhere in the tracker
3. **Checkbox count** — All checkboxes are checked (`[x]` > 0, `[ ]` = 0)
4. **Metadata** — All items have `status: completed`, none `in_progress` or `pending`

The completion string is configured per loop in `ralphflow.yaml`.

## Multi-Agent Coordination

For loops that support multi-agent mode, RalphFlow coordinates parallel agents:

- **Agent IDs** are assigned sequentially (`agent-1`, `agent-2`, ...) via PID-based lock files in the `.agents/` directory
- **Stale agent detection** — if a lock file's PID is no longer alive, the lock is cleaned up
- **Tracker-based coordination** — agents read and update the shared tracker to claim tasks, report progress, and avoid conflicts
- **Prompt substitution** — `{{AGENT_NAME}}` and `{{APP_NAME}}` are replaced at runtime

Run multi-agent mode by opening multiple terminals:

```bash
# Terminal 1
npx ralphflow run tasks --multi-agent

# Terminal 2
npx ralphflow run tasks --multi-agent

# Terminal 3
npx ralphflow run tasks --multi-agent
```

## Per-Loop Model Configuration

Each loop can use a different Claude model:

```yaml
loops:
  story-loop:
    model: claude-sonnet-4-6
  tasks-loop:
    model: claude-opus-4-6
```

**Resolution order:** CLI `--model` flag > per-loop `model` from config > Claude default.
