import { spawn } from 'node:child_process';
import type { ClaudeResult } from './types.js';

export interface SpawnClaudeOptions {
  prompt: string;
  model?: string;
  cwd: string;
  env?: Record<string, string>;
}

/**
 * Spawn an interactive Claude Code session.
 *
 * Passes the prompt as a CLI argument and inherits the full terminal
 * (stdin/stdout/stderr) so Claude Code runs exactly as if the user typed it.
 */
export async function spawnClaude(options: SpawnClaudeOptions): Promise<ClaudeResult> {
  const { prompt, model, cwd, env: extraEnv } = options;

  const args: string[] = ['--dangerously-skip-permissions', prompt];

  if (model) {
    // model must come before the positional prompt arg
    args.unshift('--model', model);
  }

  return new Promise<ClaudeResult>((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      resolve({
        output: '',
        exitCode: code,
        signal,
      });
    });
  });
}
