# API Reference

The RalphFlow dashboard exposes a REST API and WebSocket interface on `http://127.0.0.1:4242` (default port, customizable with `-p`).

## App Management

### List Apps

```
GET /api/apps
```

Returns all apps with their loop metadata.

**Response** `200`

```json
[
  {
    "appName": "code-implementation",
    "appType": "code-implementation",
    "description": "Three-loop pipeline for code projects",
    "loops": [
      {
        "key": "story-loop",
        "name": "Story",
        "order": 0,
        "stages": ["analyze", "prioritize"],
        "multiAgent": false,
        "model": "claude-sonnet-4-6"
      }
    ]
  }
]
```

### Create App

```
POST /api/apps
```

Create a new app from a template (built-in or custom).

**Request Body**

```json
{ "template": "code-implementation", "name": "my-project" }
```

**Response** `201`

```json
{
  "ok": true,
  "appName": "my-project",
  "warning": null,
  "commands": ["npx ralphflow run story-loop -f my-project"]
}
```

| Status | Meaning |
|--------|---------|
| `201` | App created |
| `400` | Invalid name or template |
| `409` | App already exists |

### Delete App

```
DELETE /api/apps/:app
```

Deletes the app directory and cleans up SQLite `loop_state` rows.

**Response** `200`

```json
{ "ok": true, "appName": "my-project" }
```

### Archive App

```
POST /api/apps/:app/archive
```

Snapshots the full app directory to `.ralph-flow/.archives/<app>/<timestamp>/`, then resets the app in place:

- Tracker files revert to template state
- Data files (stories.md, tasks.md) reset to headers only
- `.agents/` directories and lock files are cleaned up
- SQLite `loop_state` rows are deleted
- Prompt files and `ralphflow.yaml` are preserved

Timestamps use the format `YYYY-MM-DD_HH-mm`. Same-minute collisions append a sequence suffix (e.g., `2026-03-14_15-30-2`).

**Response** `200`

```json
{ "ok": true, "archivePath": ".ralph-flow/.archives/my-project/2026-03-14_15-30", "timestamp": "2026-03-14_15-30" }
```

### List Archives

```
GET /api/apps/:app/archives
```

Returns all archived snapshots, sorted newest-first.

**Response** `200`

```json
[
  {
    "timestamp": "2026-03-14_15-30",
    "summary": { "storyCount": 5, "taskCount": 12 },
    "fileCount": 18
  }
]
```

Returns an empty array (not an error) when no archives exist.

### List Archive Files

```
GET /api/apps/:app/archives/:timestamp/files
```

Returns a recursive file listing within a specific archive.

**Response** `200`

```json
[
  { "path": "ralphflow.yaml", "isDirectory": false },
  { "path": "00-story-loop/prompt.md", "isDirectory": false }
]
```

### Read Archive File

```
GET /api/apps/:app/archives/:timestamp/files/*
```

Reads a specific file's content from an archive. Append the relative file path after `/files/`.

**Response** `200`

```json
{ "path": "00-story-loop/prompt.md", "content": "# Story Loop\n..." }
```

All archive endpoints validate paths against directory traversal.

## Status & Configuration

### Get Loop Status

```
GET /api/apps/:app/status
```

Returns parsed tracker status for all loops in the app.

**Response** `200`

```json
[
  {
    "key": "tasks-loop",
    "loop": "Tasks",
    "stage": "development",
    "active": "TASK-3",
    "completed": 5,
    "total": 12,
    "agents": [
      {
        "agent": "agent-1",
        "active_task": "TASK-6",
        "stage": "execute",
        "last_heartbeat": "2026-03-14T10:45:30Z"
      }
    ]
  }
]
```

### Get App Config

```
GET /api/apps/:app/config
```

Returns the raw parsed `ralphflow.yaml` configuration plus `_rawYaml` (the original YAML string).

### Update Loop Model

```
PUT /api/apps/:app/config/model
```

Update a loop's Claude model in `ralphflow.yaml`.

**Request Body**

```json
{ "loop": "tasks-loop", "model": "claude-opus-4-6" }
```

Set `model` to `null` or `""` to remove the field (revert to default).

**Response** `200`

```json
{ "ok": true, "loop": "tasks-loop", "model": "claude-opus-4-6" }
```

### Get Database State

```
GET /api/apps/:app/db
```

Returns SQLite `loop_state` rows for the app.

## Loop File Endpoints

### Read Prompt

```
GET /api/apps/:app/loops/:loop/prompt
```

**Response** `200`

```json
{ "path": "01-tasks-loop/prompt.md", "content": "# Tasks Loop\n..." }
```

### Update Prompt

```
PUT /api/apps/:app/loops/:loop/prompt
```

**Request Body**

```json
{ "content": "# Updated prompt\n..." }
```

**Response** `200`

```json
{ "ok": true }
```

### Read Tracker

```
GET /api/apps/:app/loops/:loop/tracker
```

Returns the raw tracker markdown content.

**Response** `200`

```json
{ "path": "01-tasks-loop/tracker.md", "content": "- stage: development\n..." }
```

### List Loop Files

```
GET /api/apps/:app/loops/:loop/files
```

**Response** `200`

```json
{ "files": [{ "name": "prompt.md", "isDirectory": false }, { "name": ".agents", "isDirectory": true }] }
```

## Template Management

### List Templates

```
GET /api/templates
```

Returns all templates (built-in and custom) with metadata.

**Response** `200`

```json
[
  { "name": "code-implementation", "type": "built-in", "description": "Three-loop pipeline...", "loopCount": 3 },
  { "name": "my-pipeline", "type": "custom", "description": "Custom pipeline", "loopCount": 2 }
]
```

### Create Custom Template

```
POST /api/templates
```

**Request Body**

```json
{
  "name": "my-pipeline",
  "description": "Custom pipeline",
  "loops": [
    {
      "name": "analyze",
      "stages": ["research", "plan"],
      "completion": "ANALYSIS COMPLETE",
      "model": "claude-sonnet-4-6",
      "multi_agent": false,
      "data_files": ["data.md"],
      "entities": ["ITEM"],
      "prompt": "# Analyze Loop\n\nYour instructions here..."
    }
  ]
}
```

Loop keys are auto-suffixed with `-loop`. The `prompt` field is optional — if omitted, a default placeholder is written.

| Status | Meaning |
|--------|---------|
| `201` | Template created |
| `400` | Invalid name or configuration |
| `409` | Template already exists |

### Delete Custom Template

```
DELETE /api/templates/:name
```

Deletes a custom template. Built-in templates return `403`.

| Status | Meaning |
|--------|---------|
| `200` | Deleted |
| `403` | Cannot delete built-in template |
| `404` | Template not found |

### Clone Built-in Template

```
POST /api/templates/:name/clone
```

Copies a built-in template into a custom template.

**Request Body**

```json
{ "newName": "my-custom-pipeline" }
```

**Response** `201`

```json
{ "ok": true, "source": "code-implementation", "templateName": "my-custom-pipeline", "message": "..." }
```

| Status | Meaning |
|--------|---------|
| `201` | Cloned successfully |
| `400` | Source is not built-in, or invalid name |
| `409` | Target name already exists |

### Get Template Config

```
GET /api/templates/:name/config
```

Returns the parsed `ralphflow.yaml` for any template (built-in or custom).

### Read Template Prompt

```
GET /api/templates/:name/loops/:loopKey/prompt
```

Reads a template loop's prompt file content.

**Response** `200`

```json
{ "path": "loops/01-tasks-loop/prompt.md", "content": "# Tasks Loop\n..." }
```

### Update Template Prompt

```
PUT /api/templates/:name/loops/:loopKey/prompt
```

Writes prompt content to a custom template's prompt file. Built-in templates return `403`.

**Request Body**

```json
{ "content": "# Updated prompt\n..." }
```

## Notifications

### Post Notification

```
POST /api/notification?app=my-project&loop=tasks-loop
```

Receives attention notifications from the Claude Code hook. The `app` and `loop` query params identify the source. The request body is the JSON payload from Claude.

**Response** `200`

```json
{ "id": "abc123", "timestamp": "2026-03-14T10:45:30Z", "app": "my-project", "loop": "tasks-loop", "payload": {} }
```

### List Notifications

```
GET /api/notifications
```

Returns all active (undismissed) notifications.

### Dismiss Notification

```
DELETE /api/notification/:id
```

Dismisses a notification. Broadcasts a `notification:dismissed` WebSocket event.

## Context

### Get Dashboard Context

```
GET /api/context
```

**Response** `200`

```json
{ "cwd": "/Users/user/project", "projectName": "my-project", "port": 4242 }
```

## WebSocket Events

Connect to `ws://localhost:4242` for real-time updates. All events are JSON messages with a `type` field.

### `status:full`

Full status update. Sent on initial connection, on database state changes (polled every 2 seconds), and on tracker file changes.

```json
{
  "type": "status:full",
  "apps": [
    {
      "appName": "my-project",
      "appType": "code-implementation",
      "description": "...",
      "loops": [
        {
          "key": "tasks-loop",
          "name": "Tasks",
          "order": 1,
          "stages": ["development", "testing"],
          "status": {
            "stage": "development",
            "active": "TASK-3",
            "completed": 5,
            "total": 12
          }
        }
      ]
    }
  ]
}
```

### `tracker:updated`

Sent when a loop's `tracker.md` file changes. Debounced by 300ms.

```json
{
  "type": "tracker:updated",
  "app": "my-project",
  "loop": "tasks-loop",
  "status": {
    "key": "tasks-loop",
    "stage": "development",
    "active": "TASK-3",
    "completed": 5,
    "total": 12
  }
}
```

### `file:changed`

Sent when any `.md` or `.yaml` file changes in the `.ralph-flow/` directory.

```json
{
  "type": "file:changed",
  "app": "my-project",
  "path": "01-tasks-loop/tasks.md"
}
```

### `notification:attention`

Broadcast when the hook POST delivers a Claude notification.

```json
{
  "type": "notification:attention",
  "notification": {
    "id": "abc123",
    "timestamp": "2026-03-14T10:45:30Z",
    "app": "my-project",
    "loop": "tasks-loop",
    "payload": {}
  }
}
```

### `notification:dismissed`

Broadcast when a notification is dismissed via the API.

```json
{
  "type": "notification:dismissed",
  "id": "abc123"
}
```
