# Templates

::: info
This page is a placeholder. Full template documentation will be added in a future update.
:::

Templates define the structure of a RalphFlow pipeline — the loops, their order, prompts, trackers, and data files.

## Built-in Templates

### code-implementation

A three-loop pipeline for code projects:

| Loop | Purpose |
|------|---------|
| Story Loop | Break features into stories and tasks |
| Tasks Loop | Implement tasks with single or multi-agent support |
| Delivery Loop | Review completed work and gather feedback |

### research

A four-loop pipeline for research projects:

| Loop | Purpose |
|------|---------|
| Discovery Loop | Identify topics and research areas |
| Research Loop | Investigate topics with multi-agent support |
| Story Loop | Synthesize findings into narratives |
| Document Loop | Produce final documentation |

## Custom Templates

Custom templates are stored in `.ralph-flow/.templates/<name>/` and can be created via the dashboard's Template Creator or the API.

## Cloning Templates

Built-in templates can be cloned into custom templates for modification:

```bash
# Via the API
curl -X POST http://localhost:4242/api/templates/code-implementation/clone \
  -H 'Content-Type: application/json' \
  -d '{"newName": "my-pipeline"}'
```
