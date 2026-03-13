import { Command } from 'commander';

export const dashboardCommand = new Command('dashboard')
  .alias('ui')
  .description('Start the web dashboard')
  .option('-p, --port <port>', 'Port number', '4242')
  .action(async (opts) => {
    const { startDashboard } = await import('../dashboard/server.js');
    await startDashboard({ cwd: process.cwd(), port: parseInt(opts.port, 10) });
  });
