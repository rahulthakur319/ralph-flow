# Configuration Reference

RalphFlow is configured via `ralphflow.yaml` in each app directory (`.ralph-flow/<app>/ralphflow.yaml`). This page documents every field in the configuration schema.

## Top-Level Fields

```yaml
name: my-app
description: A three-loop pipeline for code projects
version: 1
dir: .ralph-flow
entities:
  STORY:
    prefix: STORY
    data_file: 00-story-loop/stories.md
loops:
  story-loop:
    # ... loop config
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | — | App name. Used as the directory name under `.ralph-flow/`. |
| `description` | `string` | Yes | — | Human-readable description of the pipeline. |
| `version` | `number` | Yes | — | Config schema version. Currently `1`. |
| `dir` | `string` | No | `.ralph-flow` | Root directory for all RalphFlow data. |
| `entities` | `object` | No | `{}` | Global entity type mappings. Keys are entity names. |
| `loops` | `object` | Yes | — | All loops in the pipeline. Keys are kebab-case loop identifiers. |

## Entities

Entities define the types of work items tracked across loops (e.g., stories, tasks). Each entity maps a prefix to a data file.

```yaml
entities:
  STORY:
    prefix: STORY
    data_file: 00-story-loop/stories.md
  TASK:
    prefix: TASK
    data_file: 01-tasks-loop/tasks.md
```

| Field | Type | Description |
|-------|------|-------------|
| `prefix` | `string` | ID prefix for this entity type (e.g., `STORY`, `TASK`). |
| `data_file` | `string` | Path to the markdown data file, relative to the app directory. |

## Loop Configuration

Each loop is an entry under the `loops` key, identified by a kebab-case key (e.g., `story-loop`, `tasks-loop`).

```yaml
loops:
  tasks-loop:
    order: 1
    name: Tasks
    prompt: 01-tasks-loop/prompt.md
    tracker: 01-tasks-loop/tracker.md
    stages:
      - development
      - testing
    completion: ALL TASKS COMPLETE
    model: claude-sonnet-4-6
    feeds:
      - delivery-loop
    fed_by:
      - story-loop
    data_files:
      - 01-tasks-loop/tasks.md
    entities:
      - TASK
    directories: []
    multi_agent:
      enabled: true
      max_agents: 4
      strategy: task-based
      agent_placeholder: "{{AGENT_NAME}}"
    lock:
      file: 01-tasks-loop/.tracker-lock
      type: echo
      stale_seconds: 60
    worktree:
      strategy: shared
      auto_merge: true
    cadence: 0
```

### Core Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `order` | `number` | Yes | — | Pipeline position (0-indexed). Determines left-to-right display order. |
| `name` | `string` | Yes | — | Display name shown in the dashboard pipeline view. |
| `prompt` | `string` | Yes | — | Path to the prompt file, relative to the app directory. |
| `tracker` | `string` | Yes | — | Path to the tracker file, relative to the app directory. |
| `stages` | `string[]` | Yes | — | Ordered list of stage names for this loop (e.g., `["analyze", "implement"]`). |
| `completion` | `string` | Yes | — | String that signals the loop is complete. Detected via the [4-level hierarchy](/guide/core-concepts#completion-detection). |

### Pipeline Flow

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `feeds` | `string[]` | No | — | Loop keys that this loop feeds into (downstream). |
| `fed_by` | `string[]` | No | — | Loop keys that feed into this loop (upstream). |

These fields define the pipeline graph. A loop with `feeds: [tasks-loop]` means its output is consumed by `tasks-loop`.

### Model Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `model` | `string` | No | Claude default | Claude model to use for this loop. |

Model resolution order (highest priority first):
1. CLI `--model` flag (global override for all loops)
2. Per-loop `model` field in `ralphflow.yaml`
3. Claude's own default model

Valid model values include `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`.

The model can be changed at runtime via the dashboard's Edit panel model selector, which calls `PUT /api/apps/:app/config/model`. Setting the model to "Default" removes the `model` field from the config.

### Data & Files

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `data_files` | `string[]` | No | — | Markdown files associated with this loop (e.g., `stories.md`, `tasks.md`). |
| `entities` | `string[]` | No | — | Entity types used in this loop (references keys in top-level `entities`). |
| `directories` | `string[]` | No | — | Additional subdirectories to create in the loop folder. |
| `cadence` | `number` | No | `0` | Cadence limit. `0` means no limit. |

### Multi-Agent Configuration

Set `multi_agent` to `false` to disable, or provide a configuration object:

```yaml
multi_agent:
  enabled: true
  max_agents: 4
  strategy: task-based
  agent_placeholder: "{{AGENT_NAME}}"
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | `boolean` | Yes | — | Whether multi-agent mode is active. |
| `max_agents` | `number` | Yes | — | Maximum concurrent agents (2–10). |
| `strategy` | `string` | Yes | — | Coordination strategy: `"parallel"`, `"sequential"`, or `"task-based"`. |
| `agent_placeholder` | `string` | Yes | — | Template variable for agent identity. Substituted at runtime (e.g., `{{AGENT_NAME}}` becomes `agent-1`). |

When multi-agent is enabled, PID-based lock files in an `.agents/` directory coordinate agent access. See [Multi-Agent Coordination](/guide/core-concepts#multi-agent-coordination) for details.

### Lock Configuration

Used when multi-agent mode is enabled to manage tracker file locking:

```yaml
lock:
  file: 01-tasks-loop/.tracker-lock
  type: echo
  stale_seconds: 60
```

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Lock file path, relative to the loop directory. |
| `type` | `string` | Lock mechanism type. Currently `"echo"`. |
| `stale_seconds` | `number` | Seconds after which a lock is considered stale (crashed agent). |

### Worktree Configuration

Controls git worktree behavior for multi-agent loops:

```yaml
worktree:
  strategy: shared
  auto_merge: true
```

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | `string` | Worktree strategy: `"shared"` (all agents share the working tree). |
| `auto_merge` | `boolean` | Whether to auto-merge worktree changes. |

## Complete Example

::: code-group

```yaml [code-implementation]
name: code-implementation
description: Three-loop pipeline for code projects
version: 1
dir: .ralph-flow
entities: {}

loops:
  story-loop:
    order: 0
    name: Story
    prompt: 00-story-loop/prompt.md
    tracker: 00-story-loop/tracker.md
    stages:
      - analyze
      - prioritize
    completion: ALL STORIES COMPLETE
    model: claude-sonnet-4-6
    feeds:
      - tasks-loop
    data_files:
      - 00-story-loop/stories.md
    multi_agent: false
    cadence: 0

  tasks-loop:
    order: 1
    name: Tasks
    prompt: 01-tasks-loop/prompt.md
    tracker: 01-tasks-loop/tracker.md
    stages:
      - development
      - testing
    completion: ALL TASKS COMPLETE
    model: claude-sonnet-4-6
    fed_by:
      - story-loop
    feeds:
      - delivery-loop
    data_files:
      - 01-tasks-loop/tasks.md
    multi_agent:
      enabled: true
      max_agents: 4
      strategy: task-based
      agent_placeholder: "{{AGENT_NAME}}"
    lock:
      file: 01-tasks-loop/.tracker-lock
      type: echo
      stale_seconds: 60
    worktree:
      strategy: shared
      auto_merge: true
    cadence: 0

  delivery-loop:
    order: 2
    name: Delivery
    prompt: 02-delivery-loop/prompt.md
    tracker: 02-delivery-loop/tracker.md
    stages:
      - review
      - feedback
    completion: DELIVERY COMPLETE
    model: claude-sonnet-4-6
    fed_by:
      - tasks-loop
    data_files:
      - 02-delivery-loop/feedback.md
    multi_agent: false
    cadence: 0
```

```yaml [research]
name: research
description: Four-loop pipeline for research projects
version: 1
dir: .ralph-flow
entities: {}

loops:
  discovery-loop:
    order: 0
    name: Discovery
    prompt: 00-discovery-loop/prompt.md
    tracker: 00-discovery-loop/tracker.md
    stages:
      - explore
      - identify
    completion: ALL TOPICS IDENTIFIED
    model: claude-sonnet-4-6
    feeds:
      - research-loop
    multi_agent: false
    cadence: 0

  research-loop:
    order: 1
    name: Research
    prompt: 01-research-loop/prompt.md
    tracker: 01-research-loop/tracker.md
    stages:
      - investigate
      - analyze
    completion: ALL RESEARCH COMPLETE
    model: claude-sonnet-4-6
    fed_by:
      - discovery-loop
    feeds:
      - story-loop
    multi_agent:
      enabled: true
      max_agents: 3
      strategy: parallel
      agent_placeholder: "{{AGENT_NAME}}"
    cadence: 0

  story-loop:
    order: 2
    name: Story
    prompt: 02-story-loop/prompt.md
    tracker: 02-story-loop/tracker.md
    stages:
      - synthesize
      - structure
    completion: ALL STORIES COMPLETE
    model: claude-sonnet-4-6
    fed_by:
      - research-loop
    feeds:
      - document-loop
    multi_agent: false
    cadence: 0

  document-loop:
    order: 3
    name: Document
    prompt: 03-document-loop/prompt.md
    tracker: 03-document-loop/tracker.md
    stages:
      - draft
      - review
    completion: DOCUMENTATION COMPLETE
    model: claude-sonnet-4-6
    fed_by:
      - story-loop
    multi_agent: false
    cadence: 0
```

:::
