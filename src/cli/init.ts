import { Command } from 'commander';
import chalk from 'chalk';
import { initProject } from '../core/init.js';

export const initCommand = new Command('init')
  .description('Initialize a new RalphFlow flow')
  .option('-t, --template <name>', 'Template to use (code-implementation, research, tdd-implementation, systematic-debugging, design-review, code-review)')
  .option('-n, --name <name>', 'Custom name for the flow')
  .action(async (opts) => {
    try {
      await initProject(process.cwd(), { template: opts.template, name: opts.name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  ${msg}\n`));
      process.exit(1);
    }
  });
