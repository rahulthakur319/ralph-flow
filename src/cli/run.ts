import { Command } from 'commander';
import chalk from 'chalk';
import { runLoop } from '../core/runner.js';

export const runCommand = new Command('run')
  .description('Run a loop')
  .argument('<loop>', 'Loop to run (story, tasks, delivery, discovery, research, document)')
  .option('--multi-agent', 'Run as a multi-agent instance (auto-assigns agent ID)')
  .option('-m, --model <model>', 'Claude model to use')
  .option('-n, --max-iterations <n>', 'Maximum iterations', '30')
  .option('-f, --flow <name>', 'Which flow to run (auto-detected if only one)')
  .option('--ui', 'Start web dashboard alongside execution')
  .action(async (loop, opts) => {
    try {
      let dashboardHandle: { close: () => void; port: number } | undefined;
      if (opts.ui) {
        const { startDashboard } = await import('../dashboard/server.js');
        dashboardHandle = await startDashboard({ cwd: process.cwd() });
      }
      await runLoop(loop, {
        multiAgent: !!opts.multiAgent,
        model: opts.model,
        maxIterations: parseInt(opts.maxIterations, 10),
        flow: opts.flow,
        cwd: process.cwd(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  ${msg}\n`));
      process.exit(1);
    }
  });
