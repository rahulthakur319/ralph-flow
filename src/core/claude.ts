import { spawn } from 'node:child_process';
import type { ClaudeResult } from './types.js';

export interface SpawnClaudeOptions {
  prompt: string;
  model?: string;
  printMode?: boolean;
  agentName?: string;
  cwd: string;
}

/**
 * Spawn a claude process and return its output.
 *
 * - Interactive mode (default): pipes stdin (prompt), pipes stdout, inherits stderr.
 *   Claude opens /dev/tty for AskUserQuestion — works like `cat prompt.md | claude`.
 * - Print mode (`-p`): fully autonomous, no AskUserQuestion.
 */
export async function spawnClaude(options: SpawnClaudeOptions): Promise<ClaudeResult> {
  const { prompt, model, printMode = false, agentName, cwd } = options;

  const args: string[] = [];

  if (printMode) {
    args.push('-p');
    args.push('--dangerously-skip-permissions');
  }

  if (model) {
    args.push('--model', model);
  }

  return new Promise<ClaudeResult>((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd,
      stdio: printMode
        ? ['pipe', 'pipe', 'pipe']
        : ['pipe', 'pipe', 'inherit'],
      env: { ...process.env },
    });

    let output = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;

      if (agentName) {
        // Prefix each line with agent name
        const lines = text.split('\n');
        for (const line of lines) {
          if (line) {
            process.stdout.write(`[${agentName}] ${line}\n`);
          }
        }
      } else {
        process.stdout.write(text);
      }
    });

    if (printMode && child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        if (agentName) {
          process.stderr.write(`[${agentName}] ${text}`);
        } else {
          process.stderr.write(text);
        }
      });
    }

    // Write prompt to stdin and close
    child.stdin?.write(prompt);
    child.stdin?.end();

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      resolve({
        output,
        exitCode: code,
        signal,
      });
    });
  });
}
