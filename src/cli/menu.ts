import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { listFlows, resolveFlowDir, loadConfig } from '../core/config.js';
import { initProject } from '../core/init.js';
import { runLoop, runAllLoops, runE2E } from '../core/runner.js';
import { showStatus } from '../core/status.js';

export async function interactiveMenu(cwd: string): Promise<void> {
  console.log();
  console.log(chalk.bold('  RalphFlow'));
  console.log();

  try {
    const flows = listFlows(cwd);

    if (flows.length === 0) {
      const action = await select({
        message: 'What would you like to do?',
        choices: [
          { name: 'Initialize a new app', value: 'init' },
        ],
      });

      if (action === 'init') {
        await handleInit(cwd);
      }
    } else {
      const action = await select({
        message: 'What would you like to do?',
        choices: [
          { name: 'Run end-to-end', value: 'e2e' },
          { name: 'Run a loop', value: 'run' },
          { name: 'Run all loops in sequence', value: 'run-all' },
          { name: 'Initialize a new app', value: 'init' },
          { name: 'Check status', value: 'status' },
          { name: 'Open dashboard', value: 'dashboard' },
        ],
      });

      switch (action) {
        case 'e2e':
          await handleE2E(cwd, flows);
          break;
        case 'run':
          await handleRunLoop(cwd, flows);
          break;
        case 'run-all':
          await handleRunAll(cwd, flows);
          break;
        case 'init':
          await handleInit(cwd);
          break;
        case 'status':
          await handleStatus(cwd);
          break;
        case 'dashboard':
          await handleDashboard(cwd);
          break;
      }
    }
  } catch (err: unknown) {
    // @inquirer/prompts throws ExitPromptError on Ctrl+C
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ExitPromptError') {
      console.log();
      console.log(chalk.dim('  Cancelled.'));
      process.exit(0);
    }
    throw err;
  }
}

const TEMPLATES = ['code-implementation', 'research'] as const;

async function handleInit(cwd: string): Promise<void> {
  const template = await select({
    message: 'Which template?',
    choices: TEMPLATES.map(t => ({ name: t, value: t })),
  });

  const name = await input({
    message: 'Flow name?',
    default: template,
  });

  await initProject(cwd, { template, name });

  const shouldRun = await confirm({
    message: 'Run the first loop now?',
    default: true,
  });

  if (shouldRun) {
    const flowDir = resolveFlowDir(cwd, name);
    const config = loadConfig(flowDir);
    const sortedLoops = Object.entries(config.loops)
      .sort(([, a], [, b]) => a.order - b.order);

    if (sortedLoops.length > 0) {
      const [firstKey] = sortedLoops[0];
      await runLoop(firstKey, {
        multiAgent: false,
        maxIterations: 30,
        cwd,
        flow: name,
      });
    }
  }
}

async function selectFlow(flows: string[]): Promise<string> {
  if (flows.length === 1) return flows[0];

  return await select({
    message: 'Which flow?',
    choices: flows.map(f => ({ name: f, value: f })),
  });
}

async function handleRunLoop(cwd: string, flows: string[]): Promise<void> {
  const flow = await selectFlow(flows);
  const flowDir = resolveFlowDir(cwd, flow);
  const config = loadConfig(flowDir);

  const sortedLoops = Object.entries(config.loops)
    .sort(([, a], [, b]) => a.order - b.order);

  const loopKey = await select({
    message: 'Which loop?',
    choices: sortedLoops.map(([key, loop]) => ({
      name: loop.name,
      value: key,
    })),
  });

  await runLoop(loopKey, {
    multiAgent: false,
    maxIterations: 30,
    cwd,
    flow,
  });
}

async function handleRunAll(cwd: string, flows: string[]): Promise<void> {
  const flow = await selectFlow(flows);

  await runAllLoops({
    multiAgent: false,
    maxIterations: 30,
    cwd,
    flow,
  });
}

async function handleE2E(cwd: string, flows: string[]): Promise<void> {
  const flow = await selectFlow(flows);

  await runE2E({
    multiAgent: false,
    maxIterations: 30,
    cwd,
    flow,
  });
}

async function handleStatus(cwd: string): Promise<void> {
  await showStatus(cwd);
}

async function handleDashboard(cwd: string): Promise<void> {
  const { startDashboard } = await import('../dashboard/server.js');
  await startDashboard({ cwd });
}
