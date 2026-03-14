import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { initCommand } from './init.js';
import { runCommand } from './run.js';
import { e2eCommand } from './e2e.js';
import { statusCommand } from './status.js';
import { dashboardCommand } from './dashboard.js';
import { createTemplateCommand } from './create-template.js';

export const program = new Command()
  .name('ralphflow')
  .description('Multi-agent AI workflow orchestration for Claude Code')
  .version('0.1.0')
  .addCommand(initCommand)
  .addCommand(runCommand)
  .addCommand(e2eCommand)
  .addCommand(statusCommand)
  .addCommand(dashboardCommand)
  .addCommand(createTemplateCommand)
  .action(async () => {
    const port = 4242;
    const { startDashboard } = await import('../dashboard/server.js');
    await startDashboard({ cwd: process.cwd(), port });
    const url = `http://localhost:${port}`;
    exec(`open "${url}"`, (err) => {
      if (err) {
        console.log(chalk.dim(`  Open ${url} in your browser`));
      }
    });
  });

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
