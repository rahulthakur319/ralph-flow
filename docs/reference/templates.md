# Templates

Templates define the structure of a RalphFlow pipeline — the loops, their order, prompts, trackers, and data files. RalphFlow ships with built-in templates and supports creating custom templates via the dashboard or the API.

## Built-in Templates

### code-implementation

A three-loop pipeline for code projects. Takes features from story decomposition through multi-agent implementation to delivery review.

```
Story → Tasks → Delivery
```

| Loop | Stages | Multi-Agent | Purpose |
|------|--------|-------------|---------|
| Story | analyze, prioritize | No | Break features into stories and tasks |
| Tasks | development, testing | Yes (4 agents) | Implement tasks with parallel agent support |
| Delivery | review, feedback | No | Review completed work and gather feedback |

### research

A four-loop pipeline for research projects. Guides work from topic discovery through multi-agent research to final documentation.

```
Discovery → Research → Story → Document
```

| Loop | Stages | Multi-Agent | Purpose |
|------|--------|-------------|---------|
| Discovery | explore, identify | No | Identify topics and research areas |
| Research | investigate, analyze | Yes (3 agents) | Investigate topics in parallel |
| Story | synthesize, structure | No | Synthesize findings into narratives |
| Document | draft, review | No | Produce final documentation |

## Template Directory Structure

Both built-in and custom templates follow the same directory layout:

```
<template>/
├── ralphflow.yaml              # Pipeline configuration
└── loops/
    ├── 00-story-loop/
    │   ├── prompt.md           # Loop prompt (instructions for Claude)
    │   ├── tracker.md          # Progress tracker (reset on each run)
    │   └── stories.md          # Data file (optional)
    ├── 01-tasks-loop/
    │   ├── prompt.md
    │   ├── tracker.md
    │   └── tasks.md
    └── 02-delivery-loop/
        ├── prompt.md
        ├── tracker.md
        └── feedback.md
```

- **Built-in templates** are bundled with the package at `src/templates/`.
- **Custom templates** are stored at `.ralph-flow/.templates/<name>/`.

Loop directories are prefixed with a two-digit order number (e.g., `00-`, `01-`) matching the loop's `order` field in the config.

## Custom Templates

Custom templates give you full control over pipeline structure, prompts, and loop configuration. They can be created three ways:

### Via the Dashboard Template Builder

1. Navigate to the **Templates** page in the sidebar
2. Click **Create Template**
3. Fill in the template name, description, and loop configuration
4. Use the pipeline minimap to visualize the loop structure
5. Optionally write prompts inline using the prompt editor or block-based builder
6. Review the YAML preview and click **Save Template**

### Via the API

```bash
curl -X POST http://localhost:4242/api/templates \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-pipeline",
    "description": "Custom three-loop pipeline",
    "loops": [
      {
        "name": "analyze",
        "stages": ["research", "plan"],
        "completion": "ANALYSIS COMPLETE",
        "model": "claude-sonnet-4-6",
        "multi_agent": false
      },
      {
        "name": "build",
        "stages": ["implement", "test"],
        "completion": "BUILD COMPLETE",
        "model": "claude-sonnet-4-6",
        "multi_agent": {
          "enabled": true,
          "max_agents": 3,
          "strategy": "parallel",
          "agent_placeholder": "{{AGENT_NAME}}"
        },
        "prompt": "# Build Loop\n\nImplement the plan..."
      },
      {
        "name": "review",
        "stages": ["verify", "document"],
        "completion": "REVIEW COMPLETE"
      }
    ]
  }'
```

Loop keys are automatically suffixed with `-loop` (e.g., `analyze` becomes `analyze-loop`). If you include a `prompt` field, it is written to `prompt.md`; otherwise a default placeholder is used.

### Via Cloning a Built-in Template

Clone a built-in template to get a fully populated custom template that you can modify:

```bash
curl -X POST http://localhost:4242/api/templates/code-implementation/clone \
  -H 'Content-Type: application/json' \
  -d '{"newName": "my-custom-pipeline"}'
```

This copies the entire directory tree — including all prompt files, trackers, and data files — and patches the `name` field in the cloned `ralphflow.yaml`. The clone appears in the template list as a custom template with full edit and delete support.

::: tip
Cloning is only available for built-in templates. Custom templates already have full CRUD support — use the Edit button or API to modify them directly.
:::

## Editing Custom Templates

Custom template cards in the dashboard show an **Edit** button. Clicking it loads the template configuration into the builder form:

- Loop names, stages, models, and completion strings are pre-populated
- Multi-agent settings, data files, and entities are restored
- Prompt content is loaded from the template's prompt files
- The pipeline minimap reflects the existing loop structure

Saving in edit mode deletes the old template and creates the updated one, supporting name changes. Built-in templates cannot be edited — clone them first.

## Deleting Custom Templates

Custom templates can be deleted via the dashboard (Delete button on the template card) or the API:

```bash
curl -X DELETE http://localhost:4242/api/templates/my-pipeline
```

Built-in templates cannot be deleted (returns `403`).

## Template Name Validation

Template names must follow these rules:

- Alphanumeric characters, hyphens (`-`), and underscores (`_`) only
- 1–50 characters long
- Cannot match a built-in template name (`code-implementation`, `research`)
- No path traversal characters (`..`, `/`, `\`)

## Prompt Variable Substitution

Prompts support template variables that are substituted at runtime:

| Variable | Substituted With | Example |
|----------|-----------------|---------|
| `{{AGENT_NAME}}` | Agent identifier | `agent-1` |
| `{{APP_NAME}}` | Flow directory basename | `code-implementation` |

Variables are wrapped in double curly braces and can appear anywhere in the prompt text. The prompt builder's variable palette makes it easy to insert these variables at the cursor position.

## Creating Apps from Templates

Once a template exists (built-in or custom), create an app from it:

::: code-group

```bash [CLI]
npx ralphflow init -t code-implementation -n my-project
```

```bash [API]
curl -X POST http://localhost:4242/api/apps \
  -H 'Content-Type: application/json' \
  -d '{"template": "code-implementation", "name": "my-project"}'
```

:::

This scaffolds the full directory structure under `.ralph-flow/my-project/` with all loop directories, prompt files, trackers, and data files copied from the template.
