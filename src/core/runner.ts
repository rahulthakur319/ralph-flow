import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import type { LoopConfig, RunOptions, MultiAgentConfig } from './types.js';
import { loadConfig, resolveLoop, resolveFlowDir } from './config.js';
import { spawnClaude } from './claude.js';
import type Database from 'better-sqlite3';
import { getDb, isLoopComplete, markLoopRunning, incrementIteration, markLoopComplete } from './db.js';

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

// ---------------------------------------------------------------------------
// Completion detection — check tracker file for <promise>...</promise>
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

function checkTrackerCheckboxes(flowDir: string, loop: LoopConfig): boolean {
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

  if (options.multiAgent) {
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
    await iterationLoop(loop, flowDir, options, agentName);
  } finally {
    cleanup();
  }
}

async function iterationLoop(
  loop: LoopConfig,
  flowDir: string,
  options: RunOptions,
  agentName?: string,
  db?: Database.Database,
  flowName?: string,
): Promise<void> {
  const loopKey = loop.name;

  for (let i = 1; i <= options.maxIterations; i++) {
    // Pre-flight: check DB first, then tracker
    if (db && flowName && isLoopComplete(db, flowName, loopKey)) {
      console.log(chalk.green(`  \u2713 ${loop.name} \u2014 already complete`));
      return;
    }
    if (checkTrackerForCompletion(flowDir, loop) || checkTrackerCheckboxes(flowDir, loop) || checkTrackerMetadataCompletion(flowDir, loop)) {
      if (db && flowName) markLoopComplete(db, flowName, loopKey);
      console.log(chalk.green(`  \u2713 ${loop.name} \u2014 complete`));
      return;
    }

    const label = agentName
      ? chalk.dim(`  [${agentName}] Iteration ${i}/${options.maxIterations}`)
      : chalk.dim(`  Iteration ${i}/${options.maxIterations}`);
    console.log(label);

    const prompt = readPrompt(loop, flowDir, agentName);
    const result = await spawnClaude({
      prompt,
      model: options.model,
      cwd: options.cwd,
    });

    // After Claude returns: update DB iteration count
    if (db && flowName) incrementIteration(db, flowName, loopKey);

    // After each iteration, check tracker for completion
    if (checkTrackerForCompletion(flowDir, loop) || checkTrackerCheckboxes(flowDir, loop) || checkTrackerMetadataCompletion(flowDir, loop)) {
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
    await iterationLoop(loop, flowDir, options);
  }

  console.log(chalk.green('  All loops complete.'));
}

/**
 * Run all loops end-to-end with SQLite orchestration.
 * Skips loops already marked complete in DB or detected complete via tracker.
 */
export async function runE2E(options: RunOptions): Promise<void> {
  const flowDir = resolveFlowDir(options.cwd, options.flow);
  const config = loadConfig(flowDir);
  const flowName = options.flow || basename(flowDir);
  const db = getDb(options.cwd);
  const sortedLoops = Object.entries(config.loops)
    .sort(([, a], [, b]) => a.order - b.order);

  console.log();
  console.log(chalk.bold('  RalphFlow \u2014 E2E'));
  console.log();

  for (const [key, loop] of sortedLoops) {
    const loopKey = loop.name;

    // DB check: skip completed loops
    if (isLoopComplete(db, flowName, loopKey)) {
      console.log(chalk.green(`  \u2713 ${loop.name} \u2014 complete, skipping`));
      continue;
    }
    // Tracker check: maybe completed since last run
    if (checkTrackerForCompletion(flowDir, loop) || checkTrackerCheckboxes(flowDir, loop) || checkTrackerMetadataCompletion(flowDir, loop)) {
      markLoopComplete(db, flowName, loopKey);
      console.log(chalk.green(`  \u2713 ${loop.name} \u2014 complete, skipping`));
      continue;
    }

    markLoopRunning(db, flowName, loopKey);
    console.log(chalk.bold(`  \u2192 ${loop.name}`));
    await iterationLoop(loop, flowDir, options, undefined, db, flowName);

    // Summary after loop
    if (isLoopComplete(db, flowName, loopKey)) {
      console.log(chalk.green(`  \u2713 ${loop.name} \u2014 done`));
    } else {
      console.log(chalk.yellow(`  \u26a0 ${loop.name} \u2014 max iterations, advancing`));
    }
    console.log();
  }

  console.log(chalk.green('  \u2713 E2E complete'));
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
