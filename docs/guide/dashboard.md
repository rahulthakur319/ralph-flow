# Dashboard Guide

::: info
This page is a placeholder. Detailed dashboard documentation will be added in a future update.
:::

The RalphFlow dashboard is the primary web interface for managing workflows. Start it with:

```bash
npx ralphflow dashboard         # Default port 4242
npx ralphflow ui                # Alias
npx ralphflow dashboard -p 3000 # Custom port
```

## Features Overview

- **Live pipeline view** with color-coded loop status
- **Per-loop detail panels** showing stage, progress, and agent activity
- **Prompt editor** with save and dirty indicator
- **Tracker viewer** with real-time WebSocket updates
- **Model selector** for per-loop model configuration
- **Attention notifications** with desktop alerts and audio chime
- **App archiving** to snapshot and reset flows
- **Archive browser** with timeline view and file viewer
- **Template creator** with visual config builder
- **App creation** from built-in or custom templates
