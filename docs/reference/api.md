# API Reference

::: info
This page is a placeholder. Full API reference will be added in a future update.
:::

The RalphFlow dashboard exposes a REST API on `http://localhost:4242`.

## Apps

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/apps` | List all apps with metadata |
| `POST` | `/api/apps` | Create a new app from a template |
| `DELETE` | `/api/apps/:app` | Delete an app |
| `POST` | `/api/apps/:app/archive` | Archive and reset an app |
| `GET` | `/api/apps/:app/archives` | List archived snapshots |

## Loops

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/apps/:app/status` | Get status for all loops |
| `GET` | `/api/apps/:app/loops/:loop/prompt` | Read a loop's prompt file |
| `PUT` | `/api/apps/:app/loops/:loop/prompt` | Update a loop's prompt file |
| `GET` | `/api/apps/:app/loops/:loop/tracker` | Read a loop's tracker file |

## Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/templates` | List all templates |
| `POST` | `/api/templates` | Create a custom template |
| `DELETE` | `/api/templates/:name` | Delete a custom template |
| `POST` | `/api/templates/:name/clone` | Clone a built-in template |
| `GET` | `/api/templates/:name/config` | Get template configuration |

## WebSocket

Connect to `ws://localhost:4242` for real-time events:

- `status:full` — Full status update (sent on connect and state changes)
- `tracker:updated` — Tracker file changed (debounced 300ms)
- `file:changed` — Any `.md`/`.yaml` file changed in `.ralph-flow/`
- `notification:attention` — Agent needs attention
- `notification:dismissed` — Notification dismissed
