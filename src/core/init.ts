import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { copyTemplate } from './template.js';

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(chalk.cyan('? ') + question + ' ', (answer) => {
      resolve(answer.trim());
    });
  });
}

const TEMPLATES = ['code-implementation', 'research'] as const;

export async function initProject(cwd: string, options: { template?: string; name?: string } = {}): Promise<void> {
  const ralphFlowDir = join(cwd, '.ralph-flow');
  const claudeMdPath = join(cwd, 'CLAUDE.md');

  // Step 1: Check CLAUDE.md
  if (!existsSync(claudeMdPath)) {
    console.log();
    console.log(chalk.yellow('  No CLAUDE.md found.'));
    console.log(chalk.dim('  Create one with: claude "Initialize CLAUDE.md for this project"'));
    console.log(chalk.dim('  Or create it manually with your project description, stack, and commands.'));
    console.log();
    return;
  }

  // Step 2: Check for existing flows
  if (existsSync(ralphFlowDir)) {
    const existing = listFlows(ralphFlowDir);
    if (existing.length > 0 && !options.template) {
      console.log();
      console.log(chalk.bold('  Existing flows:'));
      for (const flow of existing) {
        console.log(chalk.dim(`    - ${flow}`));
      }
      console.log();
      console.log(chalk.dim('  To add another: npx ralphflow init --template code-implementation --name my-feature'));
      console.log(chalk.dim('  To check status: npx ralphflow status'));
      console.log();
      return;
    }
  }

  // Step 3: Pick template and name
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log();

  let template = options.template;
  if (!template) {
    console.log(chalk.dim(`  Templates: ${TEMPLATES.join(', ')}`));
    template = await ask(rl, 'Which template?') || 'code-implementation';
  }

  // Validate template
  if (!TEMPLATES.includes(template as typeof TEMPLATES[number])) {
    console.log(chalk.red(`  Unknown template "${template}". Available: ${TEMPLATES.join(', ')}`));
    rl.close();
    return;
  }

  let flowName = options.name;
  if (!flowName) {
    flowName = await ask(rl, 'Flow name? (Enter for default)') || template;
  }

  rl.close();
  console.log();

  // Step 4: Copy template files → .ralph-flow/<flowName>/
  const flowDir = join(ralphFlowDir, flowName);
  if (existsSync(flowDir)) {
    console.log(chalk.yellow(`  Flow "${flowName}" already exists at .ralph-flow/${flowName}/`));
    return;
  }

  copyTemplate(template, flowDir);

  console.log(chalk.green(`  Created .ralph-flow/${flowName}/`) + ' (loops, trackers, prompts)');
  console.log();
  console.log(chalk.dim(`  Next: npx ralphflow run story --flow ${flowName}`));
  console.log();
}

function listFlows(ralphFlowDir: string): string[] {
  try {
    return readdirSync(ralphFlowDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch {
    return [];
  }
}
