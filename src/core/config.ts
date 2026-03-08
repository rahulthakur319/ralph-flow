import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { RalphFlowConfig, LoopConfig } from './types.js';

const LOOP_ALIASES: Record<string, string> = {
  story: 'story-loop',
  stories: 'story-loop',
  tasks: 'tasks-loop',
  task: 'tasks-loop',
  delivery: 'delivery-loop',
  deliver: 'delivery-loop',
};

/**
 * List all flows in .ralph-flow/
 */
export function listFlows(cwd: string): string[] {
  const baseDir = join(cwd, '.ralph-flow');
  if (!existsSync(baseDir)) return [];

  return readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .filter(d => existsSync(join(baseDir, d.name, 'ralphflow.yaml')))
    .map(d => d.name);
}

/**
 * Auto-detect the flow to use. If only one flow exists, use it.
 * Otherwise, require explicit --flow flag.
 */
export function resolveFlowDir(cwd: string, flowName?: string): string {
  const baseDir = join(cwd, '.ralph-flow');

  if (!existsSync(baseDir)) {
    throw new Error('No .ralph-flow/ found. Run `npx ralphflow init` first.');
  }

  const flows = listFlows(cwd);

  if (flows.length === 0) {
    throw new Error('No flows found in .ralph-flow/. Run `npx ralphflow init` first.');
  }

  if (flowName) {
    if (!flows.includes(flowName)) {
      throw new Error(`Flow "${flowName}" not found. Available: ${flows.join(', ')}`);
    }
    return join(baseDir, flowName);
  }

  // Auto-detect: if only one flow, use it
  if (flows.length === 1) {
    return join(baseDir, flows[0]);
  }

  throw new Error(
    `Multiple flows found: ${flows.join(', ')}. Use --flow <name> to specify which one.`
  );
}

export function loadConfig(flowDir: string): RalphFlowConfig {
  const configPath = join(flowDir, 'ralphflow.yaml');

  if (!existsSync(configPath)) {
    throw new Error(`No ralphflow.yaml found in ${flowDir}`);
  }

  const raw = readFileSync(configPath, 'utf-8');
  const config = parseYaml(raw) as RalphFlowConfig;

  if (!config.name) {
    throw new Error('ralphflow.yaml: missing required field "name"');
  }
  if (!config.loops || Object.keys(config.loops).length === 0) {
    throw new Error('ralphflow.yaml: missing required field "loops"');
  }

  if (!config.dir) {
    config.dir = '.ralph-flow';
  }

  return config;
}

export function resolveLoop(config: RalphFlowConfig, name: string): { key: string; loop: LoopConfig } {
  // Try direct match first
  if (config.loops[name]) {
    return { key: name, loop: config.loops[name] };
  }

  // Try alias
  const aliased = LOOP_ALIASES[name.toLowerCase()];
  if (aliased && config.loops[aliased]) {
    return { key: aliased, loop: config.loops[aliased] };
  }

  // Try partial match
  for (const [key, loop] of Object.entries(config.loops)) {
    if (key.startsWith(name) || loop.name.toLowerCase().includes(name.toLowerCase())) {
      return { key, loop };
    }
  }

  const available = Object.keys(config.loops).join(', ');
  throw new Error(`Unknown loop "${name}". Available: ${available}`);
}
