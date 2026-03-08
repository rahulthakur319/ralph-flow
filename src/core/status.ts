import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { TrackerStatus } from './types.js';
import { loadConfig, listFlows, resolveFlowDir } from './config.js';

/**
 * Show the status of all loops across all flows (or a specific flow).
 */
export async function showStatus(cwd: string, flowName?: string): Promise<void> {
  const flows = flowName ? [flowName] : listFlows(cwd);

  if (flows.length === 0) {
    console.log();
    console.log(chalk.yellow('  No flows found. Run `npx ralphflow init` first.'));
    console.log();
    return;
  }

  for (const flow of flows) {
    const flowDir = resolveFlowDir(cwd, flow);
    const config = loadConfig(flowDir);

    console.log();
    console.log(chalk.bold(`  RalphFlow — ${flow}`));
    console.log();

    const table = new Table({
      chars: {
        top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
        bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
        left: '  ', 'left-mid': '', mid: '', 'mid-mid': '',
        right: '', 'right-mid': '', middle: '  ',
      },
      style: { 'padding-left': 0, 'padding-right': 1 },
      head: [
        chalk.dim('Loop'),
        chalk.dim('Stage'),
        chalk.dim('Active'),
        chalk.dim('Progress'),
      ],
    });

    // Sort loops by order
    const sortedLoops = Object.entries(config.loops)
      .sort(([, a], [, b]) => a.order - b.order);

    for (const [key, loop] of sortedLoops) {
      const status = parseTracker(loop.tracker, flowDir, loop.name);
      table.push([
        loop.name,
        status.stage,
        status.active,
        `${status.completed}/${status.total}`,
      ]);

      // Show agents if any
      if (status.agents && status.agents.length > 0) {
        for (const agent of status.agents) {
          table.push([
            chalk.dim(`  ${agent.name}`),
            chalk.dim(agent.stage),
            chalk.dim(agent.activeTask),
            chalk.dim(agent.lastHeartbeat),
          ]);
        }
      }
    }

    console.log(table.toString());
  }

  console.log();
}

function parseTracker(trackerPath: string, flowDir: string, loopName: string): TrackerStatus {
  const fullPath = join(flowDir, trackerPath);

  const status: TrackerStatus = {
    loop: loopName,
    stage: '—',
    active: 'none',
    completed: 0,
    total: 0,
  };

  if (!existsSync(fullPath)) {
    return status;
  }

  const content = readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  // Parse header metadata (- key: value format)
  for (const line of lines) {
    const metaMatch = line.match(/^- (\w[\w_]*): (.+)$/);
    if (metaMatch) {
      const [, key, value] = metaMatch;
      if (key === 'stage') status.stage = value.trim();
      if (key === 'active_story' || key === 'active_task') status.active = value.trim();
      if (key === 'completed_stories' || key === 'completed_tasks') {
        const arrayMatch = value.match(/\[(.+)\]/);
        if (arrayMatch) {
          status.completed = arrayMatch[1].split(',').filter(s => s.trim()).length;
        }
      }
    }
  }

  // Count checkboxes for total/completed
  const unchecked = (content.match(/- \[ \]/g) || []).length;
  const checked = (content.match(/- \[x\]/gi) || []).length;
  if (unchecked + checked > 0) {
    status.total = unchecked + checked;
    status.completed = checked;
  }

  // Parse agent status table
  const agentTableMatch = content.match(/\| agent \|.*\n\|[-|]+\n((?:\|.*\n)*)/);
  if (agentTableMatch) {
    const agentRows = agentTableMatch[1].trim().split('\n');
    status.agents = [];
    for (const row of agentRows) {
      const cells = row.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length >= 4) {
        status.agents.push({
          name: cells[0],
          activeTask: cells[1],
          stage: cells[2],
          lastHeartbeat: cells[3],
        });
      }
    }
    if (status.agents.length === 0) {
      status.agents = undefined;
    }
  }

  return status;
}
