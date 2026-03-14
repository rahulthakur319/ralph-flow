// Prompt configuration form and prompt generation engine.
// Constants: PROMPT_CAPABILITIES.

import { state, dom, actions } from './state.js';

export const PROMPT_CAPABILITIES = [
  { id: 'webSearch', label: 'Web search', desc: 'Search the internet for information' },
  { id: 'mcpServers', label: 'MCP servers', desc: 'Connect to specific MCP tools' },
  { id: 'exploreAgents', label: 'Explore agents', desc: 'Use Claude Code\'s Agent tool to explore the codebase' },
  { id: 'fileReadWrite', label: 'File read/write', desc: 'Read or modify specific file types' },
  { id: 'bashCommands', label: 'Bash commands', desc: 'Run shell commands, build, deploy' },
  { id: 'codeEditing', label: 'Code editing', desc: 'Modify source code files' }
];

export function syncStageConfigs(loop) {
  const existing = loop.stageConfigs || [];
  loop.stageConfigs = loop.stages.map(stageName => {
    const found = existing.find(sc => sc.name === stageName);
    if (found) return found;
    const caps = {};
    PROMPT_CAPABILITIES.forEach(c => { caps[c.id] = false; });
    return { name: stageName, description: '', capabilities: caps };
  });
}

export function createEmptyLoop() {
  return {
    name: '',
    stages: [],
    completion: 'LOOP COMPLETE',
    model: 'claude-sonnet-4-6',
    multi_agent: false,
    max_agents: 3,
    strategy: 'parallel',
    agent_placeholder: '{{AGENT_NAME}}',
    data_files: [],
    entities: [],
    showOptional: false,
    showPrompt: false,
    prompt: '',
    inputFiles: '',
    outputFiles: '',
    stageConfigs: [],
    showPromptForm: true,
    claudeArgs: '',
    skipPermissions: true,
    _outputAutoFilled: true,
    _inputAutoFilled: true
  };
}

export function initTemplateBuilderState() {
  return { name: '', description: '', loops: [createEmptyLoop()] };
}

// -----------------------------------------------------------------------
// Prompt config form — structured input for prompt generation
// -----------------------------------------------------------------------

export function renderPromptConfigForm(loopIdx, loop, allLoops) {
  let html = '<div class="prompt-config-form" data-config-form-idx="' + loopIdx + '">';
  html += '<div class="prompt-generate-card">';
  html += '<div class="prompt-generate-info">Generate a structured prompt from your loop configuration &mdash; stages, input/output files, and model settings will be combined into a ready-to-use agent prompt.</div>';
  html += `<button class="btn btn-primary generate-prompt-btn" data-generate-prompt="${loopIdx}">Generate Prompt</button>`;
  html += '</div>';
  html += '</div>';
  return html;
}

// -----------------------------------------------------------------------
// Prompt generation engine
// -----------------------------------------------------------------------

export function generatePromptFromConfig(loop, loopIndex, allLoops) {
  const loopName = loop.name || 'Loop ' + (loopIndex + 1);
  const inputFiles = (loop.inputFiles || '').trim();
  const outputFiles = (loop.outputFiles || '').trim();
  const completion = loop.completion || 'LOOP COMPLETE';

  // Entity name: use first entity if defined, else "item"
  const entity = (loop.entities && loop.entities.length > 0) ? loop.entities[0] : '';
  const entityUpper = entity ? entity.toUpperCase() : 'ITEM';
  const entityLower = entity ? entity.toLowerCase() : 'item';
  const entityTitle = entityUpper.charAt(0) + entityLower.slice(1);
  const entityPlural = entityLower.endsWith('s') ? entityLower : entityLower + 's';
  const entityKey = entityUpper + '-{N}';

  // Loop directory name: matches createCustomTemplate convention
  const loopKey = (loopName || 'loop-' + loopIndex)
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const loopKeyFull = loopKey.endsWith('-loop') ? loopKey : loopKey + '-loop';
  const dirPrefix = String(loopIndex).padStart(2, '0');
  const loopDir = dirPrefix + '-' + loopKeyFull;

  // Pipeline display
  const pipelineIn = inputFiles || 'input.md';
  const pipelineOut = outputFiles || 'output.md';

  // Primary input file for read-only references
  const primaryInputFile = inputFiles ? inputFiles.split(',')[0].trim() : '';

  let p = '';

  // ── HEADER / IDENTITY ──
  p += `# ${loopName} Loop\n\n`;
  p += `**App:** \`{{APP_NAME}}\` — all flow files live under \`.ralph-flow/{{APP_NAME}}/\`.\n\n`;
  if (loop.multi_agent) {
    p += `**You are agent \`{{AGENT_NAME}}\`.** Multiple agents may work in parallel.\n`;
    p += `Coordinate via \`tracker.md\` — the single source of truth.\n`;
    p += `*(If you see the literal text \`{{AGENT_NAME}}\` above — i.e., it was not substituted — treat your name as \`agent-1\`.)*\n\n`;
  }
  p += `Read \`.ralph-flow/{{APP_NAME}}/${loopDir}/tracker.md\` FIRST to determine where you are.\n\n`;
  p += `> **PROJECT CONTEXT.** Read \`CLAUDE.md\` for architecture, stack, conventions, commands, and URLs.\n\n`;
  p += `**Pipeline:** \`${pipelineIn} → YOU → ${pipelineOut}\`\n\n`;
  p += `---\n\n`;

  // ── MULTI-AGENT SECTIONS (conditional) ──
  if (loop.multi_agent) {
    // Tracker Lock Protocol
    p += `## Tracker Lock Protocol\n\n`;
    p += `Before ANY write to \`tracker.md\`, you MUST acquire the lock:\n\n`;
    p += `**Lock file:** \`.ralph-flow/{{APP_NAME}}/${loopDir}/.tracker-lock\`\n\n`;
    p += `### Acquire Lock\n`;
    p += `1. Check if \`.tracker-lock\` exists\n`;
    p += `   - Exists AND file is < 60 seconds old → sleep 2s, retry (up to 5 retries)\n`;
    p += `   - Exists AND file is ≥ 60 seconds old → stale lock, delete it (agent crashed mid-write)\n`;
    p += `   - Does not exist → continue\n`;
    p += `2. Write lock: \`echo "{{AGENT_NAME}} $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .ralph-flow/{{APP_NAME}}/${loopDir}/.tracker-lock\`\n`;
    p += `3. Sleep 500ms (\`sleep 0.5\`)\n`;
    p += `4. Re-read \`.tracker-lock\` — verify YOUR agent name (\`{{AGENT_NAME}}\`) is in it\n`;
    p += `   - Your name → you own the lock, proceed to write \`tracker.md\`\n`;
    p += `   - Other name → you lost the race, retry from step 1\n`;
    p += `5. Write your changes to \`tracker.md\`\n`;
    p += `6. Delete \`.tracker-lock\` immediately: \`rm .ralph-flow/{{APP_NAME}}/${loopDir}/.tracker-lock\`\n`;
    p += `7. Never leave a lock held — if your write fails, delete the lock in your error handler\n\n`;
    p += `### When to Lock\n`;
    p += `- Claiming a ${entityLower} (pending → in_progress)\n`;
    p += `- Completing a ${entityLower} (in_progress → completed, unblocking dependents)\n`;
    p += `- Updating stage transitions\n`;
    p += `- Heartbeat updates (bundled with other writes, not standalone)\n\n`;
    p += `### When NOT to Lock\n`;
    p += `- Reading \`tracker.md\` — read-only access needs no lock\n`;
    if (primaryInputFile) {
      p += `- Reading \`${primaryInputFile}\` — always read-only\n`;
    }
    p += `\n---\n\n`;

    // Item Selection Algorithm
    p += `## ${entityTitle} Selection Algorithm\n\n`;
    p += `1. **Parse tracker** — read \`completed_${entityPlural}\`, \`## Dependencies\`, ${entityTitle}s Queue metadata \`{agent, status}\`, Agent Status table\n`;
    p += `2. **Update blocked→pending** — for each ${entityLower} with \`status: blocked\`, check if ALL its dependencies (from \`## Dependencies\`) are in \`completed_${entityPlural}\`. If yes, acquire lock and update to \`status: pending\`\n`;
    p += `3. **Resume own work** — if any ${entityLower} has \`{agent: {{AGENT_NAME}}, status: in_progress}\`, resume it (skip to the current stage)\n`;
    p += `4. **Find claimable** — filter ${entityPlural} where \`status: pending\` AND \`agent: -\`\n`;
    p += `5. **Claim** — acquire lock, set \`{agent: {{AGENT_NAME}}, status: in_progress}\`, update your Agent Status row, update \`last_heartbeat\`, release lock, log the claim\n`;
    p += `6. **Nothing available:**\n`;
    p += `   - All ${entityPlural} completed → emit \`<promise>${completion}</promise>\`\n`;
    p += `   - All remaining ${entityPlural} are blocked or claimed by others → log "{{AGENT_NAME}}: waiting — all ${entityPlural} blocked or claimed", exit: \`kill -INT $PPID\`\n\n`;
    p += `### New ${entityTitle} Discovery\n\n`;
    p += `If you find a ${entityLower} in the Queue without \`{agent, status}\` metadata:\n`;
    p += `1. Read its \`**Depends on:**\` field\n`;
    p += `2. Add the dependency to \`## Dependencies\` section if not already there (skip if \`Depends on: None\`)\n`;
    p += `3. Set status to \`pending\` (all deps in \`completed_${entityPlural}\`) or \`blocked\` (deps incomplete)\n`;
    p += `4. Set agent to \`-\`\n\n`;
    p += `---\n\n`;

    // Anti-Hijacking Rules
    p += `## Anti-Hijacking Rules\n\n`;
    p += `1. **Never touch another agent's \`in_progress\` ${entityLower}** — do not modify, complete, or reassign it\n`;
    p += `2. **Respect ownership** — if another agent is active in a group, leave remaining group ${entityPlural} for them\n`;
    p += `3. **Note file overlap conflicts** — if your ${entityLower} modifies files that another agent's active ${entityLower} also modifies, log a WARNING in the tracker\n\n`;
    p += `---\n\n`;

    // Heartbeat Protocol
    p += `## Heartbeat Protocol\n\n`;
    p += `Every tracker write includes updating your \`last_heartbeat\` to current ISO 8601 timestamp in the Agent Status table. If another agent's heartbeat is **30+ minutes stale**, log a WARNING in the tracker log but do NOT auto-reclaim their ${entityLower} — user must manually reset.\n\n`;
    p += `---\n\n`;

    // Crash Recovery
    p += `## Crash Recovery (Self)\n\n`;
    p += `On fresh start, if your agent name has an \`in_progress\` ${entityLower} but you have no memory of it:\n`;
    const lastStage = loop.stages.length > 1 ? loop.stages[loop.stages.length - 1] : 'last';
    const firstStage = loop.stages[0] || 'first';
    p += `- Work committed for that ${entityLower} → resume at ${lastStage.toUpperCase()} stage\n`;
    p += `- No work found → restart from ${firstStage.toUpperCase()} stage\n\n`;
    p += `---\n\n`;
  }

  // ── STATE MACHINE ──
  const stageCount = loop.stages.length;
  p += `## State Machine (${stageCount} stage${stageCount !== 1 ? 's' : ''} per ${entityLower})\n\n\`\`\`\n`;
  loop.stages.forEach((stage, i) => {
    const sc = loop.stageConfigs[i];
    const desc = (sc && sc.description) ? sc.description.split('\n')[0].substring(0, 55) : 'Complete this stage';
    const next = i < stageCount - 1 ? `→ stage: ${loop.stages[i + 1]}` : `→ next ${entityLower}`;
    p += `${stage.toUpperCase()}  → ${desc}  ${next}\n`;
  });
  p += `\`\`\`\n\n`;
  p += `When ALL done: \`<promise>${completion}</promise>\`\n\n`;
  p += `After completing ANY stage, exit: \`kill -INT $PPID\`\n\n`;
  p += `---\n\n`;

  // ── FIRST-RUN HANDLING ──
  if (loop.multi_agent) {
    p += `## First-Run Handling\n\n`;
    const scanFile = primaryInputFile || 'input.md';
    p += `If ${entityTitle}s Queue in tracker is empty: read \`${scanFile}\`, scan \`## ${entityKey}:\` headers, populate queue with \`{agent: -, status: pending|blocked}\` metadata (compute from Dependencies), then start.\n\n`;
    p += `---\n\n`;
  }

  // ── STAGE INSTRUCTIONS ──
  loop.stages.forEach((stage, i) => {
    const sc = loop.stageConfigs[i];
    p += `## STAGE ${i + 1}: ${stage.toUpperCase()}\n\n`;

    if (sc && sc.description) {
      p += `${sc.description}\n\n`;
    }

    let step = 1;

    // First stage in multi-agent: run selection algorithm
    if (loop.multi_agent && i === 0) {
      p += `${step++}. Read tracker → **run ${entityLower} selection algorithm** (see above)\n`;
    } else {
      p += `${step++}. Read tracker → determine current state\n`;
    }

    // Capability-driven steps
    if (sc && sc.capabilities) {
      if (sc.capabilities.fileReadWrite) {
        const files = primaryInputFile ? ` (\`${primaryInputFile}\`)` : '';
        p += `${step++}. Read relevant input files${files} and explore affected areas\n`;
      }
      if (sc.capabilities.exploreAgents) {
        p += `${step++}. Use the Agent tool to explore the codebase — read **40+ files** across affected areas, dependencies, patterns\n`;
      }
      if (sc.capabilities.webSearch) {
        p += `${step++}. Use WebSearch for 5-10 queries to gather external information\n`;
      }
      if (sc.capabilities.mcpServers) {
        p += `${step++}. Use MCP tools for specialized operations\n`;
      }
      if (sc.capabilities.codeEditing) {
        p += `${step++}. Implement changes, matching existing patterns per \`CLAUDE.md\`\n`;
      }
      if (sc.capabilities.bashCommands) {
        p += `${step++}. Run build/deploy commands to verify changes\n`;
      }
    }

    // Tracker update
    if (loop.multi_agent) {
      p += `${step++}. Acquire lock → update tracker: stage, \`last_heartbeat\`, log entry → release lock\n`;
    } else {
      p += `${step++}. Update tracker with progress\n`;
    }
    p += `${step++}. Exit: \`kill -INT $PPID\`\n\n`;

    if (i < stageCount - 1) p += `---\n\n`;
  });

  // ── OUTPUT FORMAT (when output files and entities are configured) ──
  if (outputFiles && entity) {
    p += `---\n\n`;
    p += `## Output Format\n\n`;
    p += `Write to \`${outputFiles.split(',')[0].trim()}\` using this format:\n\n`;
    p += `\`\`\`markdown\n`;
    p += `## ${entityKey}: {Title}\n\n`;
    p += `**Depends on:** {dependency or "None"}\n\n`;
    p += `### Description\n`;
    p += `{Content for this ${entityLower}}\n\n`;
    p += `### Acceptance Criteria\n`;
    p += `- [ ] {Criterion 1}\n`;
    p += `- [ ] {Criterion 2}\n`;
    p += `\`\`\`\n\n`;
  }

  // ── RULES ──
  p += `---\n\n## Rules\n\n`;
  p += `- One ${entityLower} at a time${loop.multi_agent ? ' per agent' : ''}. One stage per iteration.\n`;
  p += `- Read tracker first, update tracker last.${loop.multi_agent ? ' Always use lock protocol for writes.' : ''}\n`;
  p += `- Read \`CLAUDE.md\` for all project-specific context.\n`;
  p += `- Thorough exploration before making changes.\n`;
  if (loop.multi_agent) {
    p += `- **Multi-agent: never touch another agent's in_progress ${entityLower}. Coordinate via tracker.md.**\n`;
  }

  // ── CLOSING ──
  p += `\n---\n\n`;
  p += `Read \`.ralph-flow/{{APP_NAME}}/${loopDir}/tracker.md\` now and begin.\n`;

  return p;
}

// -----------------------------------------------------------------------
// Event bindings for prompt config form
// -----------------------------------------------------------------------

export function bindPromptConfigFormEvents() {
  // "Generate Prompt" button
  dom.content.querySelectorAll('[data-generate-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      capturePromptConfigFormInputs();
      const idx = parseInt(btn.dataset.generatePrompt);
      const loop = state.templateBuilderState.loops[idx];
      loop.prompt = generatePromptFromConfig(loop, idx, state.templateBuilderState.loops);
      loop.showPromptForm = false;
      actions.renderTemplateBuilder();
    });
  });

  // "Generate New" button (switch back to form)
  dom.content.querySelectorAll('[data-show-prompt-form]').forEach(btn => {
    btn.addEventListener('click', () => {
      actions.captureBuilderInputs();
      const idx = parseInt(btn.dataset.showPromptForm);
      const loop = state.templateBuilderState.loops[idx];
      loop.showPromptForm = true;
      loop.prompt = '';
      actions.renderTemplateBuilder();
    });
  });
}

export function capturePromptConfigFormInputs() {
  // No-op — form inputs are now captured via the loop card's captureBuilderInputs
}
