import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './init.js';
import { runCommand } from './run.js';
import { statusCommand } from './status.js';

export const program = new Command()
  .name('ralphflow')
  .description('Multi-agent AI workflow orchestration for Claude Code')
  .version('0.1.0')
  .addCommand(initCommand)
  .addCommand(runCommand)
  .addCommand(statusCommand);

// Graceful Ctrl+C handling at the top level
process.on('SIGINT', () => {
  console.log();
  console.log(chalk.dim('  Interrupted.'));
  process.exit(130);
});

// Clean error output
program.configureOutput({
  writeErr: (str) => {
    const clean = str.replace(/^error: /, '');
    if (clean.trim()) {
      console.error(chalk.red(`  ${clean.trim()}`));
    }
  },
});
