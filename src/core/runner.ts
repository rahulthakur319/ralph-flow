import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import type { LoopConfig, RunOptions, MultiAgentConfig, RalphFlowConfig } from './types.js';
import { loadConfig, resolveLoop, resolveFlowDir } from './config.js';
import { spawnClaude } from './claude.js';
import type Database from 'better-sqlite3';
import { getDb, isLoopComplete, markLoopRunning, incrementIteration, markLoopComplete, resetLoopState } from './db.js';

// ---------------------------------------------------------------------------
// Agent registry — PID-based lock files in .agents/ directory
// ---------------------------------------------------------------------------

function agentsDir(flowDir: string, loop: LoopConfig): string {
  // Put .agents/ next to the tracker, e.g. .ralph-flow/<flow>/01-research-loop/.agents/
  const loopDir = join(flowDir, loop.tracker, '..');
  return join(loopDir, '.agents');
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = just check if process exists
    return true;
  } catch {
    return false;
  }
}

function cleanStaleAgents(dir: string): void {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.lock')) continue;
    const pidStr = readFileSync(join(dir, file), 'utf-8').trim();
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid) || !isProcessAlive(pid)) {
      unlinkSync(join(dir, file));
    }
  }
}

function acquireAgentId(dir: string, maxAgents: number): string {
  mkdirSync(dir, { recursive: true });
  cleanStaleAgents(dir);

  // Find next available slot
  for (let n = 1; n <= maxAgents; n++) {
    const lockFile = join(dir, `agent-${n}.lock`);
    if (!existsSync(lockFile)) {
      writeFileSync(lockFile, String(process.pid));
      return `agent-${n}`;
    }
  }

  throw new Error(`All ${maxAgents} agent slots are occupied. Wait for one to finish or increase max_agents.`);
}

function releaseAgentId(dir: string, agentName: string): void {
  const lockFile = join(dir, `${agentName}.lock`);
  try { unlinkSync(lockFile); } catch { /* already gone */ }
}

function isMultiAgentLoop(loop: LoopConfig): boolean {
  return loop.multi_agent !== false &&
    (loop.multi_agent as MultiAgentConfig).enabled === true;
}

// ---------------------------------------------------------------------------
// Completion detection — check tracker file for <promise>...</promise>
// Level 1-2: literal completion string; Level 3: all checkboxes checked;
// Level 4: metadata fields
// ---------------------------------------------------------------------------

function checkTrackerForCompletion(flowDir: string, loop: LoopConfig): boolean {
  const trackerPath = join(flowDir, loop.tracker);
  if (!existsSync(trackerPath)) return false;
  const content = readFileSync(trackerPath, 'utf-8');
  // Check for completion string with <promise> wrapper (preferred)
  // and also as plain text — agents often write completion strings without the wrapper
  return content.includes(`<promise>${loop.completion}</promise>`) ||
    content.includes(loop.completion);
}

/**
 * Check for completion by examining all completed_* metadata fields.
 * If the tracker has "- completed_tasks: [TASK-1, TASK-2, ...]" and no unclaimed tasks remain,
 * this provides an additional signal alongside checkbox counting.
 */
function checkTrackerMetadataCompletion(flowDir: string, loop: LoopConfig): boolean {
  const trackerPath = join(flowDir, loop.tracker);
  if (!existsSync(trackerPath)) return false;
  const content = readFileSync(trackerPath, 'utf-8');

  // If there are unchecked checkboxes, the loop is NOT complete —
  // metadata alone cannot override visible incomplete work
  const unchecked = (content.match(/- \[ \]/g) || []).length;
  if (unchecked > 0) return false;

  // Check if all items in the queue are marked completed via metadata
  const completedMatch = content.match(/^- completed_(?:tasks|stories): \[(.+)\]$/m);
  if (!completedMatch) return false;

  const completedItems = completedMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  if (completedItems.length === 0) return false;

  // Cross-check: every checkbox line that has {status: ...} should be completed
  const inProgressLines = content.match(/\{[^}]*status:\s*in_progress[^}]*\}/g);
  if (inProgressLines && inProgressLines.length > 0) return false;

  const pendingLines = content.match(/\{[^}]*status:\s*pending[^}]*\}/g);
  if (pendingLines && pendingLines.length > 0) return false;

  // All items have completed status, no in_progress or pending items
  return true;
}

/**
 * Level 3: All checkboxes checked — if every checkbox is [x] and none are [ ],
 * the loop is complete regardless of metadata or completion strings.
 */
function checkTrackerAllChecked(flowDir: string, loop: LoopConfig): boolean {
  const trackerPath = join(flowDir, loop.tracker);
  if (!existsSync(trackerPath)) return false;
  const content = readFileSync(trackerPath, 'utf-8');
  const checked = (content.match(/- \[x\]/gi) || []).length;
  const unchecked = (content.match(/- \[ \]/g) || []).length;
  return checked > 0 && unchecked === 0;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run a loop by name.
 *
 * Single-agent: just a while loop — `cat prompt | claude -p`, check exit, repeat.
 * Multi-agent (--multi-agent): same while loop, but acquires an agent ID first
 * and substitutes {{AGENT_NAME}} in the prompt. Each terminal is one agent.
 */
export async function runLoop(loopName: string, options: RunOptions): Promise<void> {
  const flowDir = resolveFlowDir(options.cwd, options.flow);
  const config = loadConfig(flowDir);
  const { key, loop } = resolveLoop(config, loopName);

  let agentName: string | undefined;
  let agentDir: string | undefined;

  if (options.multiAgent || isMultiAgentLoop(loop)) {
    if (loop.multi_agent === false) {
      throw new Error(`Loop "${loop.name}" does not support multi-agent mode.`);
    }
    const ma = loop.multi_agent as MultiAgentConfig;
    agentDir = agentsDir(flowDir, loop);
    agentName = acquireAgentId(agentDir, ma.max_agents);
  }

  console.log();
  console.log(
    chalk.bold(`  RalphFlow — ${loop.name}`) +
    (agentName ? chalk.dim(` [${agentName}]`) : '')
  );
  console.log();

  // Ensure cleanup on exit
  const cleanup = () => {
    if (agentDir && agentName) {
      releaseAgentId(agentDir, agentName);
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    await iterationLoop(key, loop, flowDir, options, agentName);
  } finally {
    cleanup();
  }
}

async function iterationLoop(
  configKey: string,
  loop: LoopConfig,
  flowDir: string,
  options: RunOptions,
  agentName?: string,
  db?: Database.Database,
  flowName?: string,
  forceFirstIteration?: boolean,
): Promise<void> {
  const loopKey = loop.name;
  const appName = basename(flowDir);

  for (let i = 1; i <= options.maxIterations; i++) {
    // Pre-flight: check DB first, then tracker
    // Skip pre-flight on iteration 1 when forced (e2e story loop re-scan)
    if (!(forceFirstIteration && i === 1)) {
      if (db && flowName && isLoopComplete(db, flowName, loopKey)) {
        console.log(chalk.green(`  \u2713 ${loop.name} \u2014 already complete`));
        return;
      }
      if (checkTrackerForCompletion(flowDir, loop) || checkTrackerMetadataCompletion(flowDir, loop) || checkTrackerAllChecked(flowDir, loop)) {
        if (db && flowName) markLoopComplete(db, flowName, loopKey);
        console.log(chalk.green(`  \u2713 ${loop.name} \u2014 complete`));
        return;
      }
    }

    const label = agentName
      ? chalk.dim(`  [${agentName}] Iteration ${i}/${options.maxIterations}`)
      : chalk.dim(`  Iteration ${i}/${options.maxIterations}`);
    console.log(label);

    const prompt = readPrompt(loop, flowDir, agentName);
    // CLI --model overrides per-loop config model; if neither set, Claude uses its default
    const effectiveModel = options.model || loop.model;
    const result = await spawnClaude({
      prompt,
      model: effectiveModel,
      cwd: options.cwd,
      env: {
        RALPHFLOW_APP: appName,
        RALPHFLOW_LOOP: configKey,
      },
      claudeArgs: loop.claude_args,
      skipPermissions: loop.skip_permissions,
    });

    // After Claude returns: update DB iteration count
    if (db && flowName) incrementIteration(db, flowName, loopKey);

    // After each iteration, check tracker for completion
    if (checkTrackerForCompletion(flowDir, loop) || checkTrackerMetadataCompletion(flowDir, loop) || checkTrackerAllChecked(flowDir, loop)) {
      if (db && flowName) markLoopComplete(db, flowName, loopKey);
      console.log();
      console.log(chalk.green(`  Loop complete: ${loop.completion}`));
      return;
    }

    // SIGINT (agent called kill -INT $PPID) — normal iteration boundary
    if (result.signal === 'SIGINT' || result.exitCode === 130) {
      console.log(chalk.dim(`  Iteration ${i} complete, restarting...`));
      console.log();
      continue;
    }

    // Normal exit (0) — continue to next iteration
    if (result.exitCode === 0 || result.exitCode === null) {
      console.log(chalk.dim(`  Iteration ${i} finished, continuing...`));
      console.log();
      continue;
    }

    // Unexpected exit
    console.log(chalk.red(`  Claude exited with code ${result.exitCode}`));
    return;
  }

  console.log(chalk.yellow(`  Max iterations (${options.maxIterations}) reached.`));
}

/**
 * Run all loops in a flow sequentially, sorted by order.
 */
export async function runAllLoops(options: RunOptions): Promise<void> {
  const flowDir = resolveFlowDir(options.cwd, options.flow);
  const config = loadConfig(flowDir);
  const sortedLoops = Object.entries(config.loops)
    .sort(([, a], [, b]) => a.order - b.order);

  console.log();
  console.log(chalk.bold('  RalphFlow — Running all loops'));
  console.log();

  for (const [key, loop] of sortedLoops) {
    console.log(chalk.bold(`  Starting: ${loop.name}`));

    let agentName: string | undefined;
    let agentDir: string | undefined;

    if (isMultiAgentLoop(loop)) {
      agentDir = agentsDir(flowDir, loop);
      agentName = acquireAgentId(agentDir, (loop.multi_agent as MultiAgentConfig).max_agents);
    }

    try {
      await iterationLoop(key, loop, flowDir, options, agentName);
    } finally {
      if (agentDir && agentName) releaseAgentId(agentDir, agentName);
    }
  }

  console.log(chalk.green('  All loops complete.'));
}

/**
 * Run all loops end-to-end with SQLite orchestration.
 * Always re-enters the first loop (story discovery) to scan for new work.
 * Cycles back when undelivered stories remain after all loops complete.
 */
export async function runE2E(options: RunOptions): Promise<void> {
  const flowDir = resolveFlowDir(options.cwd, options.flow);
  const config = loadConfig(flowDir);
  const flowName = options.flow || basename(flowDir);
  const db = getDb(options.cwd);

  // Reset DB state — rely on tracker detection, not stale DB from previous runs
  for (const loop of Object.values(config.loops)) {
    resetLoopState(db, flowName, loop.name);
  }

  let cycle = 1;

  while (true) {
    const sortedLoops = Object.entries(config.loops)
      .sort(([, a], [, b]) => a.order - b.order);

    console.log();
    console.log(chalk.bold(`  RalphFlow \u2014 E2E` + (cycle > 1 ? ` (cycle ${cycle})` : '')));
    console.log();

    let anyLoopRan = false;

    for (let idx = 0; idx < sortedLoops.length; idx++) {
      const [key, loop] = sortedLoops[idx];
      const loopKey = loop.name;
      const isFirstLoop = idx === 0;

      // First loop (story discovery) always re-enters to scan for new work.
      // Other loops: skip if already complete.
      if (!isFirstLoop) {
        // DB check: skip loops completed earlier in this cycle
        if (isLoopComplete(db, flowName, loopKey)) {
          console.log(chalk.green(`  \u2713 ${loop.name} \u2014 complete, skipping`));
          continue;
        }
        // Tracker check: detect completion from tracker state
        if (checkTrackerForCompletion(flowDir, loop) || checkTrackerMetadataCompletion(flowDir, loop) || checkTrackerAllChecked(flowDir, loop)) {
          markLoopComplete(db, flowName, loopKey);
          console.log(chalk.green(`  \u2713 ${loop.name} \u2014 complete, skipping`));
          continue;
        }
      }

      anyLoopRan = true;
      markLoopRunning(db, flowName, loopKey);
      console.log(chalk.bold(`  \u2192 ${loop.name}`));

      let agentName: string | undefined;
      let agentDir: string | undefined;

      if (isMultiAgentLoop(loop)) {
        agentDir = agentsDir(flowDir, loop);
        agentName = acquireAgentId(agentDir, (loop.multi_agent as MultiAgentConfig).max_agents);
      }

      try {
        await iterationLoop(key, loop, flowDir, options, agentName, db, flowName, isFirstLoop);
      } finally {
        if (agentDir && agentName) releaseAgentId(agentDir, agentName);
      }

      // Summary after loop
      if (isLoopComplete(db, flowName, loopKey)) {
        console.log(chalk.green(`  \u2713 ${loop.name} \u2014 done`));
      } else {
        console.log(chalk.yellow(`  \u26a0 ${loop.name} \u2014 max iterations, advancing`));
      }
      console.log();
    }

    // Check if there are undelivered stories — if so, cycle again
    if (!hasUndeliveredStories(flowDir, config)) {
      break;
    }

    console.log(chalk.cyan('  \u21bb Undelivered stories found \u2014 starting new cycle'));
    prepareNextCycle(flowDir, config, db, flowName);
    cycle++;
  }

  console.log(chalk.green('  \u2713 E2E complete'));
}

// ---------------------------------------------------------------------------
// Cycling helpers — detect undelivered stories and reset for next cycle
// ---------------------------------------------------------------------------

function hasUndeliveredStories(flowDir: string, config: RalphFlowConfig): boolean {
  const storyEntity = config.entities?.STORY;
  if (!storyEntity) return false;

  // Read all story IDs from stories.md
  const storiesPath = join(flowDir, storyEntity.data_file);
  if (!existsSync(storiesPath)) return false;
  const storiesContent = readFileSync(storiesPath, 'utf-8');
  const storyIds = [...storiesContent.matchAll(/^## (STORY-\d+):/gm)].map(m => m[1]);
  if (storyIds.length === 0) return false;

  // Find delivery loop (last by order)
  const sortedLoops = Object.values(config.loops).sort((a, b) => a.order - b.order);
  const deliveryLoop = sortedLoops[sortedLoops.length - 1];
  if (!deliveryLoop) return false;

  // Read delivered story IDs from the Delivered section
  const deliveryTrackerPath = join(flowDir, deliveryLoop.tracker);
  if (!existsSync(deliveryTrackerPath)) return true; // no tracker = nothing delivered
  const deliveryContent = readFileSync(deliveryTrackerPath, 'utf-8');

  const deliveredSection = deliveryContent.split('## Delivered')[1] || '';
  const deliveredIds = [...deliveredSection.matchAll(/\[x\]\s*(STORY-\d+)/gi)].map(m => m[1]);

  return storyIds.some(id => !deliveredIds.includes(id));
}

function prepareNextCycle(
  flowDir: string,
  config: RalphFlowConfig,
  db: Database.Database,
  flowName: string,
): void {
  const sortedLoops = Object.entries(config.loops).sort(([, a], [, b]) => a.order - b.order);

  // Reset DB state for all loops
  for (const [, loop] of sortedLoops) {
    resetLoopState(db, flowName, loop.name);
  }

  // --- Story tracker: remove completion string, add new stories as unchecked ---
  const storyLoop = sortedLoops.find(([key]) => key.includes('story'));
  if (storyLoop) {
    const [, storyLoopConfig] = storyLoop;
    const trackerPath = join(flowDir, storyLoopConfig.tracker);
    if (existsSync(trackerPath)) {
      let content = readFileSync(trackerPath, 'utf-8');

      // Remove completion strings
      content = content.replace(new RegExp(`<promise>${storyLoopConfig.completion}</promise>`, 'g'), '');
      content = content.replace(new RegExp(storyLoopConfig.completion, 'g'), '');

      // Find stories not yet in the queue
      const storyEntity = config.entities?.STORY;
      if (storyEntity) {
        const storiesPath = join(flowDir, storyEntity.data_file);
        if (existsSync(storiesPath)) {
          const storiesContent = readFileSync(storiesPath, 'utf-8');
          const allStories = [...storiesContent.matchAll(/^## (STORY-\d+): (.+)$/gm)]
            .map(m => ({ id: m[1], title: m[2] }));

          const existingIds = [...content.matchAll(/\[[ x]\]\s*(STORY-\d+)/gi)].map(m => m[1]);
          const newStories = allStories.filter(s => !existingIds.includes(s.id));

          if (newStories.length > 0) {
            // Add new stories as unchecked items to the Stories Queue section
            const queueSection = '## Stories Queue';
            const queueIdx = content.indexOf(queueSection);
            if (queueIdx !== -1) {
              const afterQueue = content.indexOf('\n##', queueIdx + queueSection.length);
              const insertPos = afterQueue !== -1 ? afterQueue : content.length;
              const newEntries = newStories.map(s => `- [ ] ${s.id}: ${s.title}`).join('\n');
              content = content.slice(0, insertPos) + '\n' + newEntries + '\n' + content.slice(insertPos);
            }
          }
        }
      }

      // Reset metadata
      content = content.replace(/^- active_story: .+$/m, '- active_story: none');
      content = content.replace(/^- stage: .+$/m, '- stage: analyze');
      // Update completed/pending lists — leave completed as-is, clear pending
      content = content.replace(/^- pending_stories: .+$/m, '- pending_stories: []');

      writeFileSync(trackerPath, content);
    }
  }

  // --- Delivery tracker: remove completion string, clear queue, keep Delivered ---
  const deliveryLoop = sortedLoops[sortedLoops.length - 1];
  if (deliveryLoop) {
    const [, deliveryLoopConfig] = deliveryLoop;
    const trackerPath = join(flowDir, deliveryLoopConfig.tracker);
    if (existsSync(trackerPath)) {
      let content = readFileSync(trackerPath, 'utf-8');

      // Remove completion strings
      content = content.replace(new RegExp(`<promise>${deliveryLoopConfig.completion}</promise>`, 'g'), '');
      content = content.replace(new RegExp(deliveryLoopConfig.completion, 'g'), '');

      // Clear Delivery Queue section (between ## Delivery Queue and ## Delivered)
      content = content.replace(
        /(## Delivery Queue\n)[\s\S]*?(## Delivered)/,
        '$1\n$2',
      );

      // Reset metadata
      content = content.replace(/^- active_story: .+$/m, '- active_story: none');
      content = content.replace(/^- stage: .+$/m, '- stage: idle');
      content = content.replace(/^- feedback: .+$/m, '- feedback: none');

      writeFileSync(trackerPath, content);
    }
  }
}

function readPrompt(loop: LoopConfig, flowDir: string, agentName?: string): string {
  const promptPath = join(flowDir, loop.prompt);
  let prompt = readFileSync(promptPath, 'utf-8');

  // Substitute app name (flow directory name, e.g. "initial-code")
  const appName = basename(flowDir);
  prompt = prompt.replaceAll('{{APP_NAME}}', appName);

  // Substitute agent name placeholder for multi-agent
  if (agentName && loop.multi_agent !== false) {
    const ma = loop.multi_agent as MultiAgentConfig;
    if (ma.agent_placeholder) {
      prompt = prompt.replaceAll(ma.agent_placeholder, agentName);
    }
  }

  return prompt;
}
