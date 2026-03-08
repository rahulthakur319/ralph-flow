import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { LoopConfig, RunOptions, MultiAgentConfig } from './types.js';
import { loadConfig, resolveLoop, resolveFlowDir } from './config.js';
import { spawnClaude } from './claude.js';

const AGENT_COLORS = [
  chalk.cyan,
  chalk.magenta,
  chalk.yellow,
  chalk.green,
  chalk.blue,
  chalk.red,
];

/**
 * Run a loop by name. Handles iteration, signal detection, and multi-agent spawning.
 */
export async function runLoop(loopName: string, options: RunOptions): Promise<void> {
  const flowDir = resolveFlowDir(options.cwd, options.flow);
  const config = loadConfig(flowDir);
  const { key, loop } = resolveLoop(config, loopName);

  const isMultiAgent = options.agents > 1 && loop.multi_agent !== false;

  console.log();
  console.log(
    chalk.bold(`  RalphFlow — ${loop.name}`) +
    (isMultiAgent ? chalk.dim(` (${options.agents} agents)`) : '')
  );
  console.log();

  if (isMultiAgent) {
    await runMultiAgent(loop, flowDir, options);
  } else {
    await runSingleAgent(loop, flowDir, options);
  }
}

async function runSingleAgent(
  loop: LoopConfig,
  flowDir: string,
  options: RunOptions,
): Promise<void> {
  for (let i = 1; i <= options.maxIterations; i++) {
    console.log(chalk.dim(`  Iteration ${i}/${options.maxIterations}`));

    const prompt = readPrompt(loop, flowDir, options.agentName);
    const result = await spawnClaude({
      prompt,
      model: options.model,
      printMode: false,
      cwd: options.cwd,
    });

    // Check for completion promise
    if (result.output.includes(`<promise>${loop.completion}</promise>`)) {
      console.log();
      console.log(chalk.green(`  Loop complete: ${loop.completion}`));
      return;
    }

    // Check for SIGINT (agent called kill -INT $PPID)
    if (result.signal === 'SIGINT' || result.exitCode === 130) {
      console.log(chalk.dim(`  Iteration ${i} complete, restarting...`));
      console.log();
      continue;
    }

    // Unexpected exit
    if (result.exitCode !== 0 && result.exitCode !== null) {
      console.log(chalk.red(`  Claude exited with code ${result.exitCode}`));
      return;
    }

    // Normal exit without completion — continue
    console.log(chalk.dim(`  Iteration ${i} finished, continuing...`));
    console.log();
  }

  console.log(chalk.yellow(`  Max iterations (${options.maxIterations}) reached.`));
}

async function runMultiAgent(
  loop: LoopConfig,
  flowDir: string,
  options: RunOptions,
): Promise<void> {
  const agentCount = options.agents;
  let completed = false;

  const agentRunners = Array.from({ length: agentCount }, (_, idx) => {
    const agentNum = idx + 1;
    const agentName = `agent-${agentNum}`;
    const colorFn = AGENT_COLORS[idx % AGENT_COLORS.length];

    return runAgentLoop(loop, flowDir, {
      ...options,
      agentName,
    }, colorFn, () => completed, () => { completed = true; });
  });

  await Promise.allSettled(agentRunners);

  console.log();
  console.log(chalk.green(`  All agents finished.`));
}

async function runAgentLoop(
  loop: LoopConfig,
  flowDir: string,
  options: RunOptions,
  colorFn: (s: string) => string,
  isCompleted: () => boolean,
  setCompleted: () => void,
): Promise<void> {
  const agentName = options.agentName!;

  for (let i = 1; i <= options.maxIterations; i++) {
    if (isCompleted()) {
      console.log(colorFn(`  [${agentName}] Stopping — completion detected.`));
      return;
    }

    console.log(colorFn(`  [${agentName}] Iteration ${i}/${options.maxIterations}`));

    const prompt = readPrompt(loop, flowDir, agentName);
    const result = await spawnClaude({
      prompt,
      model: options.model,
      printMode: true,
      agentName,
      cwd: options.cwd,
    });

    // Check for completion promise
    if (result.output.includes(`<promise>${loop.completion}</promise>`)) {
      console.log(colorFn(`  [${agentName}] Loop complete: ${loop.completion}`));
      setCompleted();
      return;
    }

    // Check for SIGINT (agent called kill -INT $PPID)
    if (result.signal === 'SIGINT' || result.exitCode === 130) {
      console.log(colorFn(`  [${agentName}] Iteration ${i} complete, restarting...`));
      continue;
    }

    // Unexpected exit
    if (result.exitCode !== 0 && result.exitCode !== null) {
      console.log(chalk.red(`  [${agentName}] Claude exited with code ${result.exitCode}`));
      return;
    }
  }

  console.log(chalk.yellow(`  [${agentName}] Max iterations reached.`));
}

function readPrompt(loop: LoopConfig, flowDir: string, agentName?: string): string {
  const promptPath = join(flowDir, loop.prompt);
  let prompt = readFileSync(promptPath, 'utf-8');

  // Substitute agent name placeholder for multi-agent
  if (agentName && loop.multi_agent !== false) {
    const ma = loop.multi_agent as MultiAgentConfig;
    if (ma.agent_placeholder) {
      prompt = prompt.replaceAll(ma.agent_placeholder, agentName);
    }
  }

  return prompt;
}
