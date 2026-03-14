import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCustomTemplate, type TemplateDefinition, type TemplateLoopDefinition } from '../core/template.js';
import { generatePromptFromConfig, buildPromptLoopConfig } from '../core/prompt-generator.js';

export const createTemplateCommand = new Command('create-template')
  .description('Create a custom template from a JSON definition')
  .option('--config <json>', 'Template definition as inline JSON')
  .option('--config-file <path>', 'Path to a JSON file with the template definition')
  .action(async (opts) => {
    try {
      const cwd = process.cwd();

      // Parse input from --config or --config-file
      let raw: string;
      if (opts.config) {
        raw = opts.config;
      } else if (opts.configFile) {
        const filePath = resolve(cwd, opts.configFile);
        raw = readFileSync(filePath, 'utf-8');
      } else {
        console.error(chalk.red('\n  Provide --config <json> or --config-file <path>\n'));
        process.exit(1);
      }

      let definition: TemplateDefinition;
      try {
        definition = JSON.parse(raw);
      } catch {
        console.error(chalk.red('\n  Invalid JSON. Check syntax and try again.\n'));
        process.exit(1);
      }

      // Validate required fields
      if (!definition.name) {
        console.error(chalk.red('\n  Template name is required.\n'));
        process.exit(1);
      }
      if (!definition.loops || definition.loops.length === 0) {
        console.error(chalk.red('\n  At least one loop is required.\n'));
        process.exit(1);
      }
      for (const loop of definition.loops) {
        if (!loop.name) {
          console.error(chalk.red('\n  Each loop must have a name.\n'));
          process.exit(1);
        }
        if (!loop.stages || loop.stages.length === 0) {
          console.error(chalk.red('\n  Each loop must have at least one stage.\n'));
          process.exit(1);
        }
        if (!loop.completion) {
          console.error(chalk.red('\n  Each loop must have a completion string.\n'));
          process.exit(1);
        }
      }

      // Auto-generate prompts for loops that don't have explicit prompt content
      const allPromptLoopConfigs = definition.loops.map(l => buildPromptLoopConfig(l));

      for (let i = 0; i < definition.loops.length; i++) {
        const loopDef = definition.loops[i];
        if (!loopDef.prompt || !loopDef.prompt.trim()) {
          loopDef.prompt = generatePromptFromConfig(allPromptLoopConfigs[i], i, allPromptLoopConfigs);
        }
      }

      // Create the template
      createCustomTemplate(cwd, definition);

      // Output success
      const templatePath = `.ralph-flow/.templates/${definition.name}/`;
      console.log();
      console.log(chalk.green('  ✓ Template created: ') + chalk.bold(definition.name));
      console.log(chalk.dim(`    ${templatePath}`));
      console.log();
      console.log(chalk.dim('  Next steps:'));
      console.log(chalk.dim(`    ralphflow init -t ${definition.name} -n my-project`));
      console.log(chalk.dim('    ralphflow run <loop>'));
      console.log();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  ${msg}\n`));
      process.exit(1);
    }
  });
