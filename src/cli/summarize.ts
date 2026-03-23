import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnClaude } from '../core/claude.js';

const SUMMARIZE_PROMPT = `You are summarizing an archived RalphFlow workflow run.

## What to read

This directory is an archived app snapshot. It contains:
- Loop subdirectories (e.g. \`00-story-loop/\`, \`01-tasks-loop/\`, \`02-delivery-loop/\`) — each has:
  - \`stories.md\` or \`tasks.md\` — the work items with \`## STORY-N:\` or \`## TASK-N:\` headers
  - \`tracker.md\` — completion state with \`- [x]\` (done) and \`- [ ]\` (incomplete) checkboxes, \`completed_tasks\`/\`completed_stories\` lists, and agent activity logs
- \`ralphflow.yaml\` — pipeline configuration

Read ALL \`.md\` files across all subdirectories. Parse stories, task groups (\`# TASK-GROUP-N:\` headers in tasks.md), and individual tasks. Determine completion from tracker checkboxes: \`[x]\` = completed, \`[ ]\` = incomplete.

## What to write

Write a file called \`summary.md\` in the current directory with this exact structure:

\`\`\`
# Archive Summary

**N stories · N task groups · N/N tasks completed · N agents**

## Pipeline

\\\`\\\`\\\`
STORY-1: Title
├── TASK-GROUP-1: Title
│   ├── ✓ TASK-1: Title
│   ├── ✓ TASK-2: Title
│   └── ○ TASK-3: Title
└── TASK-GROUP-2: Title
    └── ✓ TASK-4: Title

STORY-2: Title
└── TASK-GROUP-3: Title
    ├── ✓ TASK-5: Title
    └── ✓ TASK-6: Title
\\\`\\\`\\\`

## What was built

**STORY-1: Title** — 1-2 sentence narrative of what was accomplished and why.

**STORY-2: Title** — 1-2 sentence narrative.

## Key decisions

- Decision or trade-off noted in tracker logs or task descriptions
- Another significant decision
\`\`\`

Rules:
- Use \`✓\` for completed tasks, \`○\` for incomplete
- The ASCII tree uses box-drawing characters (\`├── └── │\`)
- Stats line counts: stories (from stories.md headers), task groups, tasks completed vs total, unique agents (from tracker agent columns)
- Story narratives should capture *what was built and why* — not just list tasks
- Key decisions come from tracker logs, task descriptions, or trade-offs visible in the work
- Keep the whole file under 80 lines — it should fit on one screen
- If no tasks.md exists (e.g. a research pipeline), adapt: use whatever entity headers exist (topics, stories, etc.)

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
