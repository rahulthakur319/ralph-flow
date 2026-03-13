import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as stringifyYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BUILT_IN_TEMPLATES = ['code-implementation', 'research'] as const;

/**
 * Resolve the path to a template directory.
 * Works both in dev (src/core/ -> src/templates/) and when bundled (dist/ -> src/templates/).
 */
export function resolveTemplatePath(templateName: string): string {
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
 * Resolve a template path, checking custom templates first, then built-in.
 */
export function resolveTemplatePathWithCustom(templateName: string, cwd: string): string {
  // Check custom templates first
  const customPath = join(cwd, '.ralph-flow', '.templates', templateName);
  if (existsSync(customPath) && existsSync(join(customPath, 'ralphflow.yaml'))) {
    return customPath;
  }
  // Fall back to built-in
  return resolveTemplatePath(templateName);
}

/**
 * Copy template loop files to target directory.
 * Supports both built-in and custom templates when cwd is provided.
 */
export function copyTemplate(templateName: string, targetDir: string, cwd?: string): void {
  const templatePath = cwd
    ? resolveTemplatePathWithCustom(templateName, cwd)
    : resolveTemplatePath(templateName);
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

// ---------------------------------------------------------------------------
// Custom template management
// ---------------------------------------------------------------------------

export interface TemplateLoopDefinition {
  name: string;
  stages: string[];
  completion: string;
  model?: string;
  multi_agent?: { enabled: boolean; max_agents: number; strategy: string; agent_placeholder: string } | false;
  data_files?: string[];
  directories?: string[];
  entities?: string[];
  feeds?: string[];
  fed_by?: string[];
  cadence?: number;
}

export interface TemplateDefinition {
  name: string;
  description: string;
  loops: TemplateLoopDefinition[];
}

export interface TemplateInfo {
  name: string;
  type: 'built-in' | 'custom';
  description: string;
  loopCount: number;
}

/**
 * Validate a template name. Must be alphanumeric with hyphens/underscores, 1-50 chars,
 * and not conflict with built-in names.
 */
export function validateTemplateName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Template name is required' };
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Invalid name: must not contain "..", "/", or "\\"' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { valid: false, error: 'Only alphanumeric characters, hyphens, and underscores allowed' };
  }
  if (name.length > 50) {
    return { valid: false, error: 'Template name must be 50 characters or fewer' };
  }
  if ((BUILT_IN_TEMPLATES as readonly string[]).includes(name)) {
    return { valid: false, error: `"${name}" is a reserved built-in template name` };
  }
  return { valid: true };
}

/**
 * List custom templates from .ralph-flow/.templates/
 */
export function listCustomTemplates(cwd: string): string[] {
  const customDir = join(cwd, '.ralph-flow', '.templates');
  if (!existsSync(customDir)) return [];
  return readdirSync(customDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => existsSync(join(customDir, d.name, 'ralphflow.yaml')))
    .map(d => d.name);
}

/**
 * Get all available templates (built-in + custom) with metadata.
 */
export function getAvailableTemplates(cwd: string): TemplateInfo[] {
  const results: TemplateInfo[] = [];

  // Built-in templates
  for (const name of BUILT_IN_TEMPLATES) {
    try {
      const templatePath = resolveTemplatePath(name);
      const yamlPath = join(templatePath, 'ralphflow.yaml');
      const raw = readFileSync(yamlPath, 'utf-8');
      // Simple parse to get description and loop count
      const descMatch = raw.match(/^description:\s*"?([^"\n]+)"?/m);
      const loopMatches = raw.match(/^\s{2}\S+-loop:/gm);
      results.push({
        name,
        type: 'built-in',
        description: descMatch?.[1] || '',
        loopCount: loopMatches?.length || 0,
      });
    } catch {
      results.push({ name, type: 'built-in', description: '', loopCount: 0 });
    }
  }

  // Custom templates
  const customDir = join(cwd, '.ralph-flow', '.templates');
  for (const tplName of listCustomTemplates(cwd)) {
    try {
      const yamlPath = join(customDir, tplName, 'ralphflow.yaml');
      const raw = readFileSync(yamlPath, 'utf-8');
      const descMatch = raw.match(/^description:\s*"?([^"\n]+)"?/m);
      const loopMatches = raw.match(/^\s{2}\S+-loop:/gm);
      results.push({
        name: tplName,
        type: 'custom',
        description: descMatch?.[1] || '',
        loopCount: loopMatches?.length || 0,
      });
    } catch {
      results.push({ name: tplName, type: 'custom', description: '', loopCount: 0 });
    }
  }

  return results;
}

/**
 * Create a custom template from a definition.
 * Generates ralphflow.yaml, loop directories with blank prompt.md, empty tracker.md, and data files.
 */
export function createCustomTemplate(cwd: string, definition: TemplateDefinition): void {
  const validation = validateTemplateName(definition.name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const customDir = join(cwd, '.ralph-flow', '.templates', definition.name);
  if (existsSync(customDir)) {
    throw new Error(`Template "${definition.name}" already exists`);
  }

  // Build ralphflow.yaml config
  const config: Record<string, unknown> = {
    name: definition.name,
    description: definition.description || '',
    version: 1,
    dir: '.ralph-flow',
    entities: {} as Record<string, unknown>,
    loops: {} as Record<string, unknown>,
  };

  const loops = config.loops as Record<string, unknown>;

  // Generate loop configs
  definition.loops.forEach((loopDef, index) => {
    const baseKey = loopDef.name.toLowerCase().replace(/\s+/g, '-');
    const loopKey = baseKey.endsWith('-loop') ? baseKey : `${baseKey}-loop`;
    const dirPrefix = String(index).padStart(2, '0');
    const loopDirName = `${dirPrefix}-${loopKey}`;

    const loopConfig: Record<string, unknown> = {
      order: index,
      name: loopDef.name,
      prompt: `${loopDirName}/prompt.md`,
      tracker: `${loopDirName}/tracker.md`,
      stages: loopDef.stages,
      completion: loopDef.completion,
      multi_agent: loopDef.multi_agent || false,
      model: loopDef.model || 'claude-sonnet-4-6',
      cadence: loopDef.cadence ?? 0,
    };

    if (loopDef.data_files && loopDef.data_files.length > 0) {
      loopConfig.data_files = loopDef.data_files.map(f => `${loopDirName}/${f}`);
    }
    if (loopDef.directories && loopDef.directories.length > 0) {
      loopConfig.directories = loopDef.directories.map(d => `${loopDirName}/${d}`);
    }
    if (loopDef.entities && loopDef.entities.length > 0) {
      loopConfig.entities = loopDef.entities;
    }
    if (loopDef.feeds) loopConfig.feeds = loopDef.feeds;
    if (loopDef.fed_by) loopConfig.fed_by = loopDef.fed_by;

    if (loopDef.multi_agent && typeof loopDef.multi_agent === 'object' && loopDef.multi_agent.enabled) {
      loopConfig.lock = {
        file: `${loopDirName}/.tracker-lock`,
        type: 'echo',
        stale_seconds: 60,
      };
      loopConfig.worktree = {
        strategy: 'shared',
        auto_merge: true,
      };
    }

    loops[loopKey] = loopConfig;
  });

  // Create directory structure
  mkdirSync(customDir, { recursive: true });
  const loopsDir = join(customDir, 'loops');
  mkdirSync(loopsDir, { recursive: true });

  // Write ralphflow.yaml
  writeFileSync(join(customDir, 'ralphflow.yaml'), stringifyYaml(config, { lineWidth: 0 }), 'utf-8');

  // Scaffold loop directories
  definition.loops.forEach((loopDef, index) => {
    const baseKey = loopDef.name.toLowerCase().replace(/\s+/g, '-');
    const loopKey = baseKey.endsWith('-loop') ? baseKey : `${baseKey}-loop`;
    const dirPrefix = String(index).padStart(2, '0');
    const loopDirName = `${dirPrefix}-${loopKey}`;
    const loopDir = join(loopsDir, loopDirName);
    mkdirSync(loopDir, { recursive: true });

    // Blank prompt.md
    writeFileSync(join(loopDir, 'prompt.md'), `# ${loopDef.name} — Prompt\n\n<!-- Add your prompt here -->\n`, 'utf-8');

    // Empty tracker.md
    writeFileSync(join(loopDir, 'tracker.md'), `# ${loopDef.name} — Tracker\n\n- stage: ${loopDef.stages[0] || 'init'}\n`, 'utf-8');

    // Data files
    if (loopDef.data_files) {
      for (const dataFile of loopDef.data_files) {
        writeFileSync(join(loopDir, dataFile), `# ${dataFile}\n\n<!-- Add content here -->\n`, 'utf-8');
      }
    }

    // Directories
    if (loopDef.directories) {
      for (const dir of loopDef.directories) {
        const dirPath = join(loopDir, dir);
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(join(dirPath, '.gitkeep'), '', 'utf-8');
      }
    }
  });
}

/**
 * Delete a custom template. Built-in templates are protected.
 */
export function deleteCustomTemplate(cwd: string, name: string): void {
  if ((BUILT_IN_TEMPLATES as readonly string[]).includes(name)) {
    throw new Error('Cannot delete built-in templates');
  }

  const validation = validateTemplateName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const customDir = join(cwd, '.ralph-flow', '.templates', name);
  if (!existsSync(customDir)) {
    throw new Error(`Template "${name}" not found`);
  }

  rmSync(customDir, { recursive: true, force: true });
}
