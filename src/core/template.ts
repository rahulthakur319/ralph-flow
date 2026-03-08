import { readFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the path to a template directory.
 * Works both in dev (src/core/ -> src/templates/) and when bundled (dist/ -> src/templates/).
 */
function resolveTemplatePath(templateName: string): string {
  const candidates = [
    join(__dirname, '..', 'templates', templateName),              // dev: src/core/ -> src/templates/
    join(__dirname, '..', 'src', 'templates', templateName),       // bundled: dist/ -> src/templates/
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Template "${templateName}" not found. Searched:\n${candidates.join('\n')}`
  );
}

/**
 * Copy template loop files to target directory.
 */
export function copyTemplate(templateName: string, targetDir: string): void {
  const templatePath = resolveTemplatePath(templateName);
  const loopsDir = join(templatePath, 'loops');

  if (!existsSync(loopsDir)) {
    throw new Error(`Template "${templateName}" has no loops/ directory`);
  }

  mkdirSync(targetDir, { recursive: true });

  // Copy loops
  cpSync(loopsDir, targetDir, { recursive: true });

  // Copy ralphflow.yaml
  const yamlSrc = join(templatePath, 'ralphflow.yaml');
  if (existsSync(yamlSrc)) {
    const yamlDest = join(targetDir, 'ralphflow.yaml');
    cpSync(yamlSrc, yamlDest);
  }
}

/**
 * Resolve path to claude-md.template.md
 */
function resolveClaudeTemplate(): string {
  const candidates = [
    join(__dirname, '..', 'templates', 'claude-md.template.md'),
    join(__dirname, '..', 'src', 'templates', 'claude-md.template.md'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('claude-md.template.md not found');
}

/**
 * Render the CLAUDE.md template with project variables.
 */
export function renderClaudeMd(vars: Record<string, string>): string {
  const templateFile = resolveClaudeTemplate();
  const content = readFileSync(templateFile, 'utf-8');
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] ?? match;
  });
}
