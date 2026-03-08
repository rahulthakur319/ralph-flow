import { Command } from 'commander';
import chalk from 'chalk';
import { showStatus } from '../core/status.js';

export const statusCommand = new Command('status')
  .description('Show pipeline status')
  .option('-f, --flow <name>', 'Show status for a specific flow')
  .action(async (opts) => {
    try {
      await showStatus(process.cwd(), opts.flow);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  ${msg}\n`));
      process.exit(1);
    }
  });
