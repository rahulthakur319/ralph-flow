import { Command } from 'commander';
import chalk from 'chalk';
import { runE2E } from '../core/runner.js';

export const e2eCommand = new Command('e2e')
  .description('Run all loops end-to-end with SQLite orchestration (skips completed loops)')
  .option('-m, --model <model>', 'Claude model to use')
  .option('-n, --max-iterations <n>', 'Maximum iterations per loop', '30')
  .option('-f, --flow <name>', 'Which flow to run (auto-detected if only one)')
  .option('--ui', 'Start web dashboard alongside execution')
  .action(async (opts) => {
    try {
      let dashboardHandle: { close: () => void } | undefined;
      if (opts.ui) {
        const { startDashboard } = await import('../dashboard/server.js');
        dashboardHandle = await startDashboard({ cwd: process.cwd() });
      }
      await runE2E({
        multiAgent: false,
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
