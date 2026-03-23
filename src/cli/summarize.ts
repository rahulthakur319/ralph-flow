import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnClaude } from '../core/claude.js';

const SUMMARIZE_PROMPT = `You are summarizing an archived workflow run. Read all .md files in the current directory (stories.md, tasks.md, tracker files, and any other artifacts). Understand the stories, task groups, tasks, their relationships, and completion status.

Write a file called summary.md in the current directory containing:

1. A stats header line: stories count, task groups count, tasks completed/total
2. An ASCII tree diagram showing Story → Task Group → Task flow with ✓ (completed) and ○ (incomplete) markers
3. A brief narrative per story — what was built and why, in 1-2 sentences
4. Key decisions or trade-offs noted in the work

Keep it concise — the whole summary should fit on one screen. Use clean markdown formatting.

After writing summary.md, you are done. Do not modify any other files.`;

export const summarizeCommand = new Command('summarize')
  .description('Generate a summary of an archived workflow run')
  .argument('<app>', 'App name (e.g., code-implementation)')
  .argument('<archive-date>', 'Archive timestamp (e.g., 2026-03-14_15-30)')
  .option('-m, --model <model>', 'Claude model to use')
  .action(async (app, archiveDate, opts) => {
    // Path safety
    if (app.includes('..') || app.includes('/') || app.includes('\\')) {
      console.error(chalk.red('\n  Invalid app name.\n'));
      process.exit(1);
    }
    if (archiveDate.includes('..') || archiveDate.includes('/') || archiveDate.includes('\\')) {
      console.error(chalk.red('\n  Invalid archive date.\n'));
      process.exit(1);
    }

    const archiveDir = resolve(process.cwd(), '.ralph-flow', '.archives', app, archiveDate);

    if (!existsSync(archiveDir)) {
      // Check if the app has any archives at all
      const appArchivesDir = join(process.cwd(), '.ralph-flow', '.archives', app);
      if (!existsSync(appArchivesDir)) {
        console.error(chalk.red(`\n  No archives found for app "${app}".`));
        console.error(chalk.dim(`  Archive an app first via the dashboard.\n`));
      } else {
        // List available archives to help the user
        const { readdirSync } = await import('node:fs');
        const available = readdirSync(appArchivesDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
          .sort()
          .reverse();
        console.error(chalk.red(`\n  Archive "${archiveDate}" not found for app "${app}".`));
        if (available.length > 0) {
          console.error(chalk.dim(`  Available archives:`));
          for (const a of available) {
            console.error(chalk.dim(`    ${a}`));
          }
        }
        console.error('');
      }
      process.exit(1);
    }

    console.log(chalk.dim(`\n  Summarizing archive: ${app}/${archiveDate}\n`));

    try {
      await spawnClaude({
        prompt: SUMMARIZE_PROMPT,
        model: opts.model,
        cwd: archiveDir,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  ${msg}\n`));
      process.exit(1);
    }
  });
