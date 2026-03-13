import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Marker embedded in the hook command so we can identify RalphFlow-managed hooks
 * during removal without depending on port matching.
 */
const RALPHFLOW_MARKER = '# ralphflow-managed';

interface HookEntry {
  type: string;
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface SettingsLocal {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

function settingsPath(cwd: string): string {
  return join(cwd, '.claude', 'settings.local.json');
}

function readSettings(cwd: string): SettingsLocal {
  const path = settingsPath(cwd);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return {};
    return JSON.parse(raw) as SettingsLocal;
  } catch {
    // Malformed JSON — treat as empty
    return {};
  }
}

function writeSettings(cwd: string, settings: SettingsLocal): void {
  const dir = join(cwd, '.claude');
  mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(cwd), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function buildHookCommand(port: number): string {
  return `cat | curl --connect-timeout 2 --max-time 5 -s -X POST http://127.0.0.1:${port}/api/notification -H 'Content-Type: application/json' -d @- ${RALPHFLOW_MARKER}`;
}

function isRalphFlowHook(entry: HookEntry): boolean {
  return entry.command?.includes(RALPHFLOW_MARKER) ?? false;
}

/**
 * Install the Notification hook into .claude/settings.local.json.
 * Creates .claude/ and the file if needed. Merges with existing hooks.
 */
export function installNotificationHook(cwd: string, port: number): void {
  const settings = readSettings(cwd);

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const notificationHooks = settings.hooks.Notification ?? [];

  // Remove any existing RalphFlow-managed entries (e.g. stale from previous port)
  const cleaned = notificationHooks.map((matcher) => ({
    ...matcher,
    hooks: matcher.hooks.filter((h) => !isRalphFlowHook(h)),
  })).filter((matcher) => matcher.hooks.length > 0);

  // Add our hook as a new matcher entry
  cleaned.push({
    matcher: '',
    hooks: [{ type: 'command', command: buildHookCommand(port) }],
  });

  settings.hooks.Notification = cleaned;

  writeSettings(cwd, settings);
}

/**
 * Remove the RalphFlow-managed Notification hook from .claude/settings.local.json.
 * Preserves all other hooks and hook entries.
 */
export function removeNotificationHook(cwd: string): void {
  const path = settingsPath(cwd);
  if (!existsSync(path)) return;

  const settings = readSettings(cwd);
  if (!settings.hooks?.Notification) return;

  // Filter out RalphFlow-managed hooks from each matcher
  settings.hooks.Notification = settings.hooks.Notification
    .map((matcher) => ({
      ...matcher,
      hooks: matcher.hooks.filter((h) => !isRalphFlowHook(h)),
    }))
    .filter((matcher) => matcher.hooks.length > 0);

  // Clean up empty Notification array
  if (settings.hooks.Notification.length === 0) {
    delete settings.hooks.Notification;
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(cwd, settings);
}
