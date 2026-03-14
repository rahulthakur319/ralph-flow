// Prompt configuration form, prompt generation engine, block-based prompt builder.
// Constants: PROMPT_CAPABILITIES, PROMPT_BLOCK_TYPES, PROMPT_VARIABLES.

import { state, dom, actions } from './state.js';
import { esc } from './utils.js';

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

// Prompt builder block type definitions
export const PROMPT_BLOCK_TYPES = [
  {
    id: 'header',
    label: 'Header / Identity',
    icon: '#',
    skeleton: `# {loop_name} Loop — {purpose}

**App:** \`{{APP_NAME}}\` — all flow files live under \`.ralph-flow/{{APP_NAME}}/\`.

Read \`.ralph-flow/{{APP_NAME}}/{loop_dir}/tracker.md\` FIRST to determine where you are.

> **PROJECT CONTEXT.** Read \`CLAUDE.md\` for architecture, stack, conventions, commands, and URLs.

**Pipeline:** \`{input_file} → YOU → {output_file}\``
  },
  {
    id: 'state-machine',
    label: 'State Machine',
    icon: '\u27F3',
    skeleton: `## State Machine

\`\`\`
{STAGE_1}  → {description_1}  → stage: {next_stage_1}
{STAGE_2}  → {description_2}  → stage: {next_stage_2}
{STAGE_3}  → {description_3}  → done
\`\`\`

When ALL done: \`<promise>{COMPLETION_STRING}</promise>\`

After completing ANY stage, exit: \`kill -INT $PPID\``
  },
  {
    id: 'tracker-protocol',
    label: 'Tracker Protocol',
    icon: '\uD83D\uDD12',
    skeleton: `## Tracker Lock Protocol

Before ANY write to \`tracker.md\`, you MUST acquire the lock:

**Lock file:** \`.ralph-flow/{{APP_NAME}}/{loop_dir}/.tracker-lock\`

### Acquire Lock
1. Check if \`.tracker-lock\` exists
   - Exists AND file is < 60 seconds old → sleep 2s, retry (up to 5 retries)
   - Exists AND file is ≥ 60 seconds old → stale lock, delete it
   - Does not exist → continue
2. Write lock: \`echo "{{AGENT_NAME}} $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .tracker-lock\`
3. Sleep 500ms (\`sleep 0.5\`)
4. Re-read \`.tracker-lock\` — verify YOUR agent name is in it
   - Your name → you own the lock, proceed
   - Other name → you lost the race, retry from step 1
5. Write your changes to \`tracker.md\`
6. Delete \`.tracker-lock\` immediately`
  },
  {
    id: 'stage-instructions',
    label: 'Stage Instructions',
    icon: '\u25B6',
    skeleton: `## STAGE 1: {STAGE_NAME}

1. Read tracker → determine current state
2. {Read input files and explore codebase}
3. {Core work for this stage}
4. Acquire lock → update tracker: stage, last_heartbeat, log entry → release lock
5. {Produce output or commit changes}
6. Exit: \`kill -INT $PPID\``
  },
  {
    id: 'output-format',
    label: 'Output Format',
    icon: '\uD83D\uDCCB',
    skeleton: `## Output Format

\`\`\`markdown
## {ENTITY}-{N}: {Title}

**Source:** {source_reference}
**Depends on:** {dependency_or_None}

### Intent
{What this item accomplishes and why}

### Acceptance Criteria
- [ ] {Criterion 1}
- [ ] {Criterion 2}
\`\`\``
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: '\u2699',
    skeleton: `## Rules

- One item at a time per agent. One stage per iteration.
- Read tracker first, update tracker last. Always use lock protocol for writes.
- Read \`CLAUDE.md\` for all project-specific context.
- Thorough exploration before making changes.
- **Multi-agent: never touch another agent's in_progress task. Coordinate via tracker.md.**`
  },
  {
    id: 'decision-reporting',
    label: 'Decision Reporting',
    icon: '\uD83D\uDCE2',
    skeleton: `## Decision Reporting Protocol

When you make a substantive decision a human reviewer would want to know about, report it to the dashboard:

**When to report:**
- Scope boundary decisions (what's included/excluded)
- Approach choices (implementation strategy, design decisions)
- Trade-off resolutions (prioritizing one concern over another)
- Interpretation of ambiguous requirements
- Self-answered clarification questions

**How to report:**
\`\`\`bash
curl -s --connect-timeout 2 --max-time 5 -X POST "http://127.0.0.1:4242/api/decision?app=$RALPHFLOW_APP&loop=$RALPHFLOW_LOOP" -H 'Content-Type: application/json' -d '{"item":"{ITEM_ID}","agent":"{agent_name}","decision":"{one-line summary}","reasoning":"{why this choice}"}'
\`\`\`

**Do NOT report** routine operations (claiming tasks, updating heartbeat, stage transitions). Only report substantive choices that affect the work product.

**Best-effort only:** If the dashboard is unreachable (curl fails), continue working normally.`
  },
  {
    id: 'custom',
    label: 'Custom Section',
    icon: '\u270E',
    skeleton: `## {Section Title}

{Your content here}`
  }
];

export const PROMPT_VARIABLES = [
  { name: 'APP_NAME', description: 'Flow directory name (e.g. "code-implementation")' },
  { name: 'AGENT_NAME', description: 'Agent identifier (e.g. "agent-1") — multi-agent only' },
  { name: 'LOOP_NAME', description: 'Loop config key (e.g. "tasks-loop")' }
];

export function highlightVariables(text) {
  return esc(text).replace(/\{\{([A-Z_]+)\}\}/g,
    '<span class="var-highlight">{{$1}}</span>');
}

export function assemblePromptFromBlocks(blocks) {
  return blocks.map(b => b.content).join('\n\n---\n\n');
}

export function createEmptyLoop() {
  return {
    name: '',
    stages: ['init'],
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
    useBuilder: false,
    blocks: [],
    inputFiles: '',
    outputFiles: '',
    stageConfigs: [],
    showPromptForm: true
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

  // Check for previous loop's output files as suggestion
  let inputSuggestion = '';
  if (loopIdx > 0 && allLoops && allLoops[loopIdx - 1]) {
    inputSuggestion = (allLoops[loopIdx - 1].outputFiles || '').trim();
  }

  // Per-loop settings
  html += '<div class="prompt-config-section">';
  html += '<div class="prompt-config-section-title">Loop Settings</div>';
  html += '<div class="prompt-config-grid">';
  html += `<div class="form-group"><label class="form-label">Input Files</label>
    <input class="form-input" data-pcf-field="inputFiles" data-pcf-idx="${loopIdx}" type="text" value="${esc(loop.inputFiles || '')}" placeholder="${inputSuggestion ? esc(inputSuggestion) : 'stories.md, research.md'}" autocomplete="off">`;
  if (inputSuggestion && !(loop.inputFiles || '').trim()) {
    html += `<div class="io-file-suggestion" data-suggest-input="${loopIdx}" style="font-size:11px;color:var(--text-muted);margin-top:4px;cursor:pointer">Use previous loop output: <span style="color:var(--accent)">${esc(inputSuggestion)}</span></div>`;
  }
  html += `</div>`;
  html += `<div class="form-group"><label class="form-label">Output Files</label>
    <input class="form-input" data-pcf-field="outputFiles" data-pcf-idx="${loopIdx}" type="text" value="${esc(loop.outputFiles || '')}" placeholder="tasks.md, results.md" autocomplete="off"></div>`;
  html += `<div class="form-group"><label class="form-label">Multi-agent</label>
    <div class="prompt-config-readonly">${loop.multi_agent ? 'Enabled (' + (loop.max_agents || 3) + ' agents, ' + (loop.strategy || 'parallel') + ')' : 'Disabled'}</div></div>`;
  html += `<div class="form-group"><label class="form-label">Tracker Format</label>
    <div class="prompt-config-readonly">Standard RalphFlow tracker &mdash; auto-generated</div></div>`;
  html += '</div></div>';

  // Per-stage configuration
  html += '<div class="prompt-config-section">';
  html += '<div class="prompt-config-section-title">Stage Configuration</div>';

  if (loop.stages.length === 0) {
    html += '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Add stages in the loop config above to configure per-stage instructions.</div>';
  }

  loop.stageConfigs.forEach((sc, sci) => {
    html += '<div class="stage-config-card">';
    html += '<div class="stage-config-header">';
    html += `<span class="stage-config-name">${esc(sc.name)}</span>`;
    html += `<span class="stage-config-index">Stage ${sci + 1} of ${loop.stageConfigs.length}</span>`;
    html += '</div>';

    html += `<div class="form-group" style="margin-bottom:8px"><label class="form-label">What should this stage do?</label>
      <textarea class="form-input" data-pcf-stage-desc data-pcf-idx="${loopIdx}" data-pcf-stage="${sci}" style="min-height:60px;resize:vertical;font-family:var(--sans);font-size:13px;line-height:1.5" placeholder="Describe the purpose and work of this stage...">${esc(sc.description)}</textarea></div>`;

    html += '<label class="form-label">Capabilities</label>';
    html += '<div class="capability-grid">';
    PROMPT_CAPABILITIES.forEach(cap => {
      const checked = sc.capabilities[cap.id] ? ' checked' : '';
      html += `<label class="capability-item">
        <input type="checkbox" data-pcf-cap data-pcf-idx="${loopIdx}" data-pcf-stage="${sci}" data-pcf-cap-id="${cap.id}"${checked}>
        <span class="capability-item-text">
          <span class="capability-item-label">${esc(cap.label)}</span>
          <span class="capability-item-desc">${esc(cap.desc)}</span>
        </span>
      </label>`;
    });
    html += '</div>';
    html += '</div>';
  });

  html += '</div>';

  // Generate button
  html += `<button class="btn btn-primary generate-prompt-btn" data-generate-prompt="${loopIdx}">Generate Prompt</button>`;

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
// Block-based prompt builder HTML
// -----------------------------------------------------------------------

export function renderPromptBuilderHTML(loopIdx, loop) {
  let html = '';

  // Palette
  html += `<div class="prompt-builder" data-builder-idx="${loopIdx}">`;
  html += '<div class="prompt-builder-palette">';
  html += '<div class="prompt-builder-palette-title">Blocks</div>';
  PROMPT_BLOCK_TYPES.forEach(bt => {
    html += `<div class="palette-block" data-add-block="${bt.id}" data-builder-loop="${loopIdx}">`;
    html += `<span class="palette-block-icon">${bt.icon}</span>${esc(bt.label)}`;
    html += '</div>';
  });
  // Variable palette
  html += '<div class="prompt-builder-palette-divider"></div>';
  html += '<div class="prompt-builder-palette-title">Variables</div>';
  html += '<div style="display:flex;flex-wrap:wrap">';
  PROMPT_VARIABLES.forEach(v => {
    html += `<span class="variable-chip" data-insert-var="${v.name}" data-var-loop="${loopIdx}" title="${esc(v.description)}">{{${v.name}}}</span>`;
  });
  html += '</div>';
  html += '</div>';

  // Sections (active blocks)
  html += `<div class="prompt-builder-sections" data-sections-loop="${loopIdx}">`;
  html += `<div class="prompt-builder-sections-title"><span>Sections (${loop.blocks.length})</span></div>`;

  if (loop.blocks.length === 0) {
    html += '<div class="prompt-builder-empty">Click a block from the palette to add it</div>';
  } else {
    loop.blocks.forEach((block, bi) => {
      html += `<div class="builder-block" draggable="true" data-block-loop="${loopIdx}" data-block-idx="${bi}">`;
      html += '<div class="builder-block-header">';
      html += '<span class="builder-block-grip">\u2807</span>';
      html += `<span class="builder-block-label">${esc(block.label)}</span>`;
      html += '<div class="builder-block-actions">';
      if (bi > 0) html += `<button title="Move up" data-block-move="up" data-bm-loop="${loopIdx}" data-bm-idx="${bi}">\u2191</button>`;
      if (bi < loop.blocks.length - 1) html += `<button title="Move down" data-block-move="down" data-bm-loop="${loopIdx}" data-bm-idx="${bi}">\u2193</button>`;
      html += `<button title="Duplicate" data-block-dup data-bd-loop="${loopIdx}" data-bd-idx="${bi}">\u29C9</button>`;
      html += `<button title="Remove" data-block-remove data-br-loop="${loopIdx}" data-br-idx="${bi}">&times;</button>`;
      html += '</div></div>';
      html += '<div class="builder-block-body">';
      html += `<textarea data-block-content data-bc-loop="${loopIdx}" data-bc-idx="${bi}">${esc(block.content)}</textarea>`;
      html += '</div></div>';
    });
  }
  html += '</div>';

  // Live preview
  html += '<div class="prompt-builder-preview">';
  html += '<div class="prompt-builder-preview-title">Preview</div>';
  html += `<pre id="builderPreview-${loopIdx}">${highlightVariables(assemblePromptFromBlocks(loop.blocks))}</pre>`;
  html += '</div>';

  html += '</div>'; // close prompt-builder

  // Toolbar below the builder
  html += '<div class="prompt-builder-toolbar">';
  html += `<button class="btn btn-primary" data-builder-done="${loopIdx}" style="font-size:11px;padding:4px 10px">Done</button>`;
  html += `<button class="btn btn-muted" data-builder-back="${loopIdx}" style="font-size:11px;padding:4px 10px">Back to textarea</button>`;
  html += '</div>';

  return html;
}

// -----------------------------------------------------------------------
// Event bindings for prompt config form and block builder
// -----------------------------------------------------------------------

export function bindPromptConfigFormEvents() {
  // I/O file suggestion clicks (auto-fill from previous loop's output)
  dom.content.querySelectorAll('[data-suggest-input]').forEach(hint => {
    hint.addEventListener('click', () => {
      const idx = parseInt(hint.dataset.suggestInput);
      if (state.templateBuilderState && idx > 0 && state.templateBuilderState.loops[idx - 1]) {
        const prevOutput = (state.templateBuilderState.loops[idx - 1].outputFiles || '').trim();
        if (prevOutput) {
          state.templateBuilderState.loops[idx].inputFiles = prevOutput;
          const inputEl = dom.content.querySelector(`[data-pcf-field="inputFiles"][data-pcf-idx="${idx}"]`);
          if (inputEl) inputEl.value = prevOutput;
          hint.remove();
          actions.updateYamlPreview();
          actions.updateMinimapIO();
        }
      }
    });
  });

  // Input/output file fields
  dom.content.querySelectorAll('[data-pcf-field]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.pcfIdx);
      const field = input.dataset.pcfField;
      if (state.templateBuilderState && state.templateBuilderState.loops[idx]) {
        state.templateBuilderState.loops[idx][field] = input.value;
        actions.updateYamlPreview();
        if (field === 'inputFiles' || field === 'outputFiles') {
          actions.updateMinimapIO();
        }
      }
    });
  });

  // Stage description textareas
  dom.content.querySelectorAll('[data-pcf-stage-desc]').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const idx = parseInt(textarea.dataset.pcfIdx);
      const stageIdx = parseInt(textarea.dataset.pcfStage);
      const loop = state.templateBuilderState && state.templateBuilderState.loops[idx];
      if (loop && loop.stageConfigs[stageIdx]) {
        loop.stageConfigs[stageIdx].description = textarea.value;
      }
    });
  });

  // Capability checkboxes
  dom.content.querySelectorAll('[data-pcf-cap]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const idx = parseInt(checkbox.dataset.pcfIdx);
      const stageIdx = parseInt(checkbox.dataset.pcfStage);
      const capId = checkbox.dataset.pcfCapId;
      const loop = state.templateBuilderState && state.templateBuilderState.loops[idx];
      if (loop && loop.stageConfigs[stageIdx]) {
        loop.stageConfigs[stageIdx].capabilities[capId] = checkbox.checked;
      }
    });
  });

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
      loop.useBuilder = false;
      actions.renderTemplateBuilder();
    });
  });
}

export function capturePromptConfigFormInputs() {
  if (!state.templateBuilderState) return;
  dom.content.querySelectorAll('[data-pcf-field]').forEach(input => {
    const idx = parseInt(input.dataset.pcfIdx);
    const field = input.dataset.pcfField;
    if (state.templateBuilderState.loops[idx]) {
      state.templateBuilderState.loops[idx][field] = input.value;
    }
  });
  dom.content.querySelectorAll('[data-pcf-stage-desc]').forEach(textarea => {
    const idx = parseInt(textarea.dataset.pcfIdx);
    const stageIdx = parseInt(textarea.dataset.pcfStage);
    const loop = state.templateBuilderState.loops[idx];
    if (loop && loop.stageConfigs[stageIdx]) {
      loop.stageConfigs[stageIdx].description = textarea.value;
    }
  });
  dom.content.querySelectorAll('[data-pcf-cap]').forEach(checkbox => {
    const idx = parseInt(checkbox.dataset.pcfIdx);
    const stageIdx = parseInt(checkbox.dataset.pcfStage);
    const capId = checkbox.dataset.pcfCapId;
    const loop = state.templateBuilderState.loops[idx];
    if (loop && loop.stageConfigs[stageIdx]) {
      loop.stageConfigs[stageIdx].capabilities[capId] = checkbox.checked;
    }
  });
}

export function bindPromptBuilderEvents() {
  // "Use Builder" buttons — switch from textarea to builder mode
  dom.content.querySelectorAll('[data-use-builder]').forEach(btn => {
    btn.addEventListener('click', () => {
      actions.captureBuilderInputs();
      const idx = parseInt(btn.dataset.useBuilder);
      const loop = state.templateBuilderState.loops[idx];
      loop.useBuilder = true;
      // If loop has existing prompt text and no blocks, try to import as a single custom block
      if (loop.prompt && loop.prompt.trim() && loop.blocks.length === 0) {
        loop.blocks.push({ id: 'custom', label: 'Custom Section', content: loop.prompt });
      }
      actions.renderTemplateBuilder();
    });
  });

  // "Done" buttons — compile blocks into prompt text, switch to textarea
  dom.content.querySelectorAll('[data-builder-done]').forEach(btn => {
    btn.addEventListener('click', () => {
      capturePromptBuilderInputs();
      const idx = parseInt(btn.dataset.builderDone);
      const loop = state.templateBuilderState.loops[idx];
      loop.prompt = assemblePromptFromBlocks(loop.blocks);
      loop.useBuilder = false;
      actions.renderTemplateBuilder();
    });
  });

  // "Back to textarea" buttons — switch to textarea without compiling
  dom.content.querySelectorAll('[data-builder-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      capturePromptBuilderInputs();
      const idx = parseInt(btn.dataset.builderBack);
      const loop = state.templateBuilderState.loops[idx];
      // Write blocks to prompt so user doesn't lose work
      loop.prompt = assemblePromptFromBlocks(loop.blocks);
      loop.useBuilder = false;
      actions.renderTemplateBuilder();
    });
  });

  // Add block from palette
  dom.content.querySelectorAll('[data-add-block]').forEach(el => {
    el.addEventListener('click', () => {
      capturePromptBuilderInputs();
      const blockId = el.dataset.addBlock;
      const loopIdx = parseInt(el.dataset.builderLoop);
      const blockType = PROMPT_BLOCK_TYPES.find(bt => bt.id === blockId);
      if (!blockType) return;
      const loop = state.templateBuilderState.loops[loopIdx];
      loop.blocks.push({
        id: blockType.id,
        label: blockType.label,
        content: blockType.skeleton
      });
      actions.renderTemplateBuilder();
    });
  });

  // Move block up/down
  dom.content.querySelectorAll('[data-block-move]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      capturePromptBuilderInputs();
      const loopIdx = parseInt(btn.dataset.bmLoop);
      const blockIdx = parseInt(btn.dataset.bmIdx);
      const direction = btn.dataset.blockMove;
      const blocks = state.templateBuilderState.loops[loopIdx].blocks;
      const targetIdx = direction === 'up' ? blockIdx - 1 : blockIdx + 1;
      if (targetIdx < 0 || targetIdx >= blocks.length) return;
      [blocks[blockIdx], blocks[targetIdx]] = [blocks[targetIdx], blocks[blockIdx]];
      actions.renderTemplateBuilder();
    });
  });

  // Duplicate block
  dom.content.querySelectorAll('[data-block-dup]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      capturePromptBuilderInputs();
      const loopIdx = parseInt(btn.dataset.bdLoop);
      const blockIdx = parseInt(btn.dataset.bdIdx);
      const blocks = state.templateBuilderState.loops[loopIdx].blocks;
      const clone = { ...blocks[blockIdx] };
      blocks.splice(blockIdx + 1, 0, clone);
      actions.renderTemplateBuilder();
    });
  });

  // Remove block
  dom.content.querySelectorAll('[data-block-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      capturePromptBuilderInputs();
      const loopIdx = parseInt(btn.dataset.brLoop);
      const blockIdx = parseInt(btn.dataset.brIdx);
      state.templateBuilderState.loops[loopIdx].blocks.splice(blockIdx, 1);
      actions.renderTemplateBuilder();
    });
  });

  // Block content editing — update preview live
  dom.content.querySelectorAll('[data-block-content]').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const loopIdx = parseInt(textarea.dataset.bcLoop);
      const blockIdx = parseInt(textarea.dataset.bcIdx);
      state.templateBuilderState.loops[loopIdx].blocks[blockIdx].content = textarea.value;
      // Update preview with variable highlighting
      const preview = document.getElementById(`builderPreview-${loopIdx}`);
      if (preview) {
        preview.innerHTML = highlightVariables(assemblePromptFromBlocks(state.templateBuilderState.loops[loopIdx].blocks));
      }
    });
  });

  // Drag and drop reordering for blocks
  dom.content.querySelectorAll('.builder-block[draggable]').forEach(block => {
    block.addEventListener('dragstart', (e) => {
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${block.dataset.blockLoop}:${block.dataset.blockIdx}`);
    });
    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      dom.content.querySelectorAll('.builder-block.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    block.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      block.classList.add('drag-over');
    });
    block.addEventListener('dragleave', () => {
      block.classList.remove('drag-over');
    });
    block.addEventListener('drop', (e) => {
      e.preventDefault();
      block.classList.remove('drag-over');
      const [srcLoop, srcIdx] = e.dataTransfer.getData('text/plain').split(':').map(Number);
      const destLoop = parseInt(block.dataset.blockLoop);
      const destIdx = parseInt(block.dataset.blockIdx);
      if (srcLoop !== destLoop || srcIdx === destIdx) return;
      capturePromptBuilderInputs();
      const blocks = state.templateBuilderState.loops[srcLoop].blocks;
      const [moved] = blocks.splice(srcIdx, 1);
      blocks.splice(destIdx, 0, moved);
      actions.renderTemplateBuilder();
    });
  });

  // Variable chip click-to-insert
  dom.content.querySelectorAll('[data-insert-var]').forEach(chip => {
    chip.addEventListener('click', () => {
      const varName = chip.dataset.insertVar;
      const loopIdx = parseInt(chip.dataset.varLoop);
      const varText = `{{${varName}}}`;
      // Find the last focused block textarea in this loop's builder
      const textareas = dom.content.querySelectorAll(`[data-block-content][data-bc-loop="${loopIdx}"]`);
      // Use the last active textarea or the last one
      let target = null;
      textareas.forEach(ta => { if (ta === document.activeElement) target = ta; });
      if (!target && textareas.length > 0) target = textareas[textareas.length - 1];
      if (target) {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const val = target.value;
        target.value = val.slice(0, start) + varText + val.slice(end);
        target.selectionStart = target.selectionEnd = start + varText.length;
        target.focus();
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });
}

// Capture prompt builder block textarea values before re-render
export function capturePromptBuilderInputs() {
  if (!state.templateBuilderState) return;
  dom.content.querySelectorAll('[data-block-content]').forEach(textarea => {
    const loopIdx = parseInt(textarea.dataset.bcLoop);
    const blockIdx = parseInt(textarea.dataset.bcIdx);
    const loop = state.templateBuilderState.loops[loopIdx];
    if (loop && loop.blocks[blockIdx]) {
      loop.blocks[blockIdx].content = textarea.value;
    }
  });
}
