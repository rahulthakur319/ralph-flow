# Configuration Reference

::: info
This page is a placeholder. Full configuration reference will be added in a future update.
:::

RalphFlow is configured via `ralphflow.yaml` in each app directory (`.ralph-flow/<app>/ralphflow.yaml`).

## Basic Structure

```yaml
name: my-app
template: code-implementation
loops:
  story-loop:
    prompt: 00-story-loop/prompt.md
    tracker: 00-story-loop/tracker.md
    completion: ALL STORIES COMPLETE
    model: claude-sonnet-4-6
    feeds: tasks-loop
    data_files:
      - 00-story-loop/stories.md
  tasks-loop:
    prompt: 01-tasks-loop/prompt.md
    tracker: 01-tasks-loop/tracker.md
    completion: ALL TASKS COMPLETE
    model: claude-sonnet-4-6
    fed_by: story-loop
    feeds: delivery-loop
    multi_agent:
      enabled: true
      max_agents: 4
      strategy: task-based
    data_files:
      - 01-tasks-loop/tasks.md
```

## Loop Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Path to the prompt file (relative to app dir) |
| `tracker` | `string` | Path to the tracker file |
| `completion` | `string` | Completion detection string |
| `model` | `string` | Claude model to use (optional) |
| `feeds` | `string` | Next loop in the pipeline |
| `fed_by` | `string` | Previous loop in the pipeline |
| `multi_agent` | `object` | Multi-agent configuration (optional) |
| `data_files` | `string[]` | Associated data files |
| `entities` | `string[]` | Entity types used in this loop |
