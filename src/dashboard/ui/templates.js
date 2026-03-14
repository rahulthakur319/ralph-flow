// Template listing, builder UI, drag-and-drop, YAML preview, save/load/delete/clone.

import { state, dom, actions } from './state.js';
import { fetchJson, esc, formatModelName } from './utils.js';
import {
  syncStageConfigs,
  createEmptyLoop,
  initTemplateBuilderState,
  renderPromptConfigForm,
  PROMPT_CAPABILITIES,
  bindPromptConfigFormEvents,
  capturePromptConfigFormInputs,
} from './prompt-builder.js';

export async function fetchTemplates() {
  try {
    state.templatesList = await fetchJson('/api/templates');
  } catch {
    state.templatesList = [];
  }
}

export async function renderTemplatesPage() {
  if (state.showTemplateWizard) {
    renderTemplateWizard();
    return;
  }

  if (state.showTemplateBuilder) {
    renderTemplateBuilder();
    return;
  }

  if (state.viewingTemplateName) {
    renderTemplateDetail();
    return;
  }

  await fetchTemplates();

  let html = '<div class="templates-header">';
  html += '<h2>Templates</h2>';
  html += '<button class="btn btn-primary" id="createTemplateBtn">Create Template</button>';
  html += '</div>';

  if (state.templatesList.length === 0) {
    html += '<div class="content-empty">No templates found</div>';
  } else {
    html += '<div class="template-grid">';
    for (const tpl of state.templatesList) {
      html += `<div class="template-card" data-view-template="${esc(tpl.name)}" style="cursor:pointer">
        <div class="template-card-header">
          <span class="template-card-name">${esc(tpl.name)}</span>
          <span class="template-card-type ${tpl.type}">${esc(tpl.type)}</span>
        </div>
        ${tpl.description ? `<div class="template-card-desc">${esc(tpl.description)}</div>` : ''}
        <div class="template-card-meta">
          <span>${tpl.loopCount} loop${tpl.loopCount !== 1 ? 's' : ''}</span>
          <span class="template-card-actions" data-stop-prop="true">
          ${tpl.type === 'custom' ? `<button class="btn" style="font-size:11px;padding:2px 8px" data-edit-template="${esc(tpl.name)}">Edit</button><button class="btn btn-danger" style="font-size:11px;padding:2px 8px;margin-left:4px" data-delete-template="${esc(tpl.name)}">Delete</button>` : `<button class="btn" style="font-size:11px;padding:2px 8px" data-clone-template="${esc(tpl.name)}">Clone</button>`}
          </span>
        </div>
      </div>`;
    }
    html += '</div>';
  }

  dom.content.innerHTML = html;

  const createBtn = document.getElementById('createTemplateBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      state.showTemplateWizard = true;
      state.wizardStep = 0;
      state.wizardData = { description: '', loops: [{ name: '', stages: '' }], multiAgent: false, multiAgentLoop: -1, maxAgents: 3, claudeArgs: '', skipPermissions: true };
      renderTemplatesPage();
    });
  }

  // Template card click → open detail view
  dom.content.querySelectorAll('[data-view-template]').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't open detail view if an action button was clicked
      if (e.target.closest('[data-stop-prop]') || e.target.closest('button')) return;
      openTemplateDetail(card.dataset.viewTemplate);
    });
  });

  dom.content.querySelectorAll('[data-edit-template]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadTemplateForEdit(btn.dataset.editTemplate);
    });
  });

  dom.content.querySelectorAll('[data-delete-template]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteTemplateModal(btn.dataset.deleteTemplate);
    });
  });

  dom.content.querySelectorAll('[data-clone-template]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCloneTemplateModal(btn.dataset.cloneTemplate);
    });
  });
}

// -----------------------------------------------------------------------
// Conversational template wizard
// -----------------------------------------------------------------------

function captureWizardInputs() {
  const wd = state.wizardData;
  if (!wd) return;
  const step = state.wizardStep;

  if (step === 0) {
    const descEl = document.getElementById('wizardDesc');
    if (descEl) wd.description = descEl.value;
  } else if (step === 1) {
    // Capture all loop rows
    document.querySelectorAll('.wizard-loop-row').forEach((row, i) => {
      if (!wd.loops[i]) wd.loops[i] = { name: '', stages: '' };
      const nameEl = row.querySelector('.wizard-loop-name');
      const stagesEl = row.querySelector('.wizard-loop-stages');
      if (nameEl) wd.loops[i].name = nameEl.value;
      if (stagesEl) wd.loops[i].stages = stagesEl.value;
    });
  } else if (step === 2) {
    const maToggle = document.getElementById('wizardMultiAgent');
    if (maToggle) wd.multiAgent = maToggle.checked;
    const maLoop = document.getElementById('wizardMultiAgentLoop');
    if (maLoop) wd.multiAgentLoop = parseInt(maLoop.value);
    const maxAgents = document.getElementById('wizardMaxAgents');
    if (maxAgents) wd.maxAgents = parseInt(maxAgents.value) || 3;
    const argsEl = document.getElementById('wizardClaudeArgs');
    if (argsEl) wd.claudeArgs = argsEl.value;
    const skipEl = document.getElementById('wizardSkipPerms');
    if (skipEl) wd.skipPermissions = skipEl.checked;
  }
}

function inferTemplateNameFromDescription(desc) {
  if (!desc) return 'my-pipeline';
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('-') || 'my-pipeline';
}

function buildWizardDefinition() {
  const wd = state.wizardData;
  const name = inferTemplateNameFromDescription(wd.description);
  const loops = wd.loops.filter(l => l.name.trim()).map((l, i, arr) => {
    const stages = l.stages.split(',').map(s => s.trim()).filter(Boolean);
    const def = {
      name: l.name.trim(),
      stages: stages.length > 0 ? stages : ['analyze', 'execute', 'verify'],
      completion: l.name.trim().toUpperCase().replace(/\s+/g, '_') + '_COMPLETE',
    };
    // Auto-wire I/O: each loop's output = its name, next loop's input = previous output
    const outFile = l.name.trim().toLowerCase().replace(/\s+/g, '-') + '.md';
    if (i < arr.length - 1) {
      def.feeds = [outFile];
    }
    if (i > 0) {
      const prevOut = arr[i - 1].name.trim().toLowerCase().replace(/\s+/g, '-') + '.md';
      def.fed_by = [prevOut];
    }
    // Multi-agent
    if (wd.multiAgent && wd.multiAgentLoop === i) {
      def.multi_agent = { max_agents: wd.maxAgents, strategy: 'parallel' };
    }
    // Claude args
    const argsList = (wd.claudeArgs || '').split(',').map(s => s.trim()).filter(Boolean);
    if (argsList.length > 0) def.claude_args = argsList;
    if (wd.skipPermissions === false) def.skip_permissions = false;
    return def;
  });

  if (loops.length === 0) {
    loops.push({ name: 'default', stages: ['analyze', 'execute', 'verify'], completion: 'ALL DONE' });
  }

  return { name, description: wd.description.trim(), loops };
}

function renderWizardPipelinePreview() {
  const wd = state.wizardData;
  const loops = wd.loops.filter(l => l.name.trim());
  if (loops.length === 0) return '<div class="wizard-preview-empty">Add loops to see a preview</div>';

  let html = '<div class="wizard-pipeline-preview">';
  loops.forEach((l, i) => {
    if (i > 0) {
      const prevOut = loops[i - 1].name.trim().toLowerCase().replace(/\s+/g, '-') + '.md';
      html += `<div class="wizard-preview-connector"><div class="builder-minimap-connector-line"></div><span class="builder-minimap-connector-file">${esc(prevOut)}</span></div>`;
    }
    const stages = l.stages.split(',').map(s => s.trim()).filter(Boolean);
    const stageDisplay = stages.length > 0 ? stages.join(' &rarr; ') : '<em>default stages</em>';
    const isMultiAgent = wd.multiAgent && wd.multiAgentLoop === i;
    html += `<div class="wizard-preview-node${isMultiAgent ? ' multi-agent' : ''}">`;
    html += `<span class="minimap-label">${esc(l.name.trim())}</span>`;
    html += `<span class="wizard-preview-stages">${stageDisplay}</span>`;
    if (isMultiAgent) html += `<span class="wizard-preview-badge">multi-agent</span>`;
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderTemplateWizard() {
  const wd = state.wizardData;
  const step = state.wizardStep;
  const totalSteps = 4; // 0-3

  let html = '';
  html += '<div class="templates-header">';
  html += `<div style="display:flex;align-items:center;gap:12px"><button class="btn btn-muted" id="wizardBackBtn" style="padding:4px 10px">&larr; Back</button><h2>Create Template</h2></div>`;
  html += '</div>';

  // Progress bar
  html += '<div class="wizard-progress">';
  for (let i = 0; i < totalSteps; i++) {
    html += `<div class="wizard-progress-step${i <= step ? ' active' : ''}${i < step ? ' done' : ''}">
      <span class="wizard-step-dot">${i < step ? '&#10003;' : i + 1}</span>
      <span class="wizard-step-label">${['Describe', 'Define Steps', 'Options', 'Review'][i]}</span>
    </div>`;
    if (i < totalSteps - 1) html += '<div class="wizard-progress-line' + (i < step ? ' done' : '') + '"></div>';
  }
  html += '</div>';

  html += '<div class="wizard-content">';

  if (step === 0) {
    // Step 1: What kind of flow?
    html += '<div class="wizard-step-card">';
    html += '<h3 class="wizard-question">What are you building?</h3>';
    html += '<p class="wizard-hint">Describe your workflow in plain text. For example: "Break down user stories into tasks, implement them in code, then verify and document the changes."</p>';
    html += `<textarea class="wizard-textarea" id="wizardDesc" placeholder="Describe your pipeline..." autofocus>${esc(wd.description)}</textarea>`;
    html += '</div>';
  } else if (step === 1) {
    // Step 2: Define pipeline steps
    html += '<div class="wizard-step-card">';
    html += '<h3 class="wizard-question">Define your pipeline steps</h3>';
    html += '<p class="wizard-hint">Each step becomes a loop. For each, give it a name and optionally list its stages (comma-separated). Stages define what the AI agent does in each iteration cycle.</p>';
    html += '<div class="wizard-loops-list" id="wizardLoopsList">';
    wd.loops.forEach((l, i) => {
      html += `<div class="wizard-loop-row" data-loop-idx="${i}">
        <span class="wizard-loop-number">${i + 1}</span>
        <div class="wizard-loop-fields">
          <input class="form-input wizard-loop-name" type="text" value="${esc(l.name)}" placeholder="e.g. Story, Tasks, Verify" autocomplete="off">
          <input class="form-input wizard-loop-stages" type="text" value="${esc(l.stages)}" placeholder="Stages (e.g. analyze, execute, verify)" autocomplete="off">
        </div>
        ${wd.loops.length > 1 ? `<button class="wizard-loop-remove" data-remove-wizard-loop="${i}" title="Remove">&times;</button>` : ''}
      </div>`;
    });
    html += '</div>';
    html += '<button class="btn btn-muted" id="wizardAddLoop" style="margin-top:8px">+ Add Step</button>';
    html += '</div>';

    // Live pipeline preview
    html += '<div class="wizard-step-card">';
    html += '<div class="builder-section-title">Pipeline Preview</div>';
    html += renderWizardPipelinePreview();
    html += '</div>';
  } else if (step === 2) {
    // Step 3: Special requirements
    html += '<div class="wizard-step-card">';
    html += '<h3 class="wizard-question">Any special requirements?</h3>';
    html += '<p class="wizard-hint">Configure multi-agent coordination, CLI flags, and permissions. All optional &mdash; defaults work for most cases.</p>';

    // Multi-agent toggle
    html += '<div class="wizard-option">';
    html += '<div class="wizard-option-header">';
    html += '<label class="wizard-option-label">Multi-agent coordination</label>';
    html += `<div class="toggle-wrap"><input class="toggle-input" id="wizardMultiAgent" type="checkbox" ${wd.multiAgent ? 'checked' : ''}><span class="toggle-label">${wd.multiAgent ? 'On' : 'Off'}</span></div>`;
    html += '</div>';
    html += '<div class="wizard-option-desc">Run multiple AI agents in parallel on a single loop, coordinating via tracker locks.</div>';

    if (wd.multiAgent) {
      html += '<div class="wizard-sub-options">';
      html += '<div class="form-group"><label class="form-label">Which loop?</label>';
      html += '<select class="form-select" id="wizardMultiAgentLoop">';
      wd.loops.forEach((l, i) => {
        const label = l.name.trim() || `Loop ${i + 1}`;
        html += `<option value="${i}"${wd.multiAgentLoop === i ? ' selected' : ''}>${esc(label)}</option>`;
      });
      html += '</select></div>';
      html += `<div class="form-group"><label class="form-label">Max agents</label><input class="form-input" id="wizardMaxAgents" type="number" min="2" max="10" value="${wd.maxAgents}"></div>`;
      html += '</div>';
    }
    html += '</div>';

    // Claude CLI Args
    html += '<div class="wizard-option">';
    html += `<div class="form-group"><label class="form-label">Claude CLI args <span class="form-hint">Extra flags for all loops</span></label>
      <input class="form-input" id="wizardClaudeArgs" type="text" value="${esc(wd.claudeArgs)}" placeholder="e.g. --chrome, --verbose" autocomplete="off"></div>`;
    html += '</div>';

    // Skip permissions
    html += '<div class="wizard-option">';
    html += '<div class="wizard-option-header">';
    html += '<label class="wizard-option-label">Skip permissions</label>';
    html += `<div class="toggle-wrap"><input class="toggle-input" id="wizardSkipPerms" type="checkbox" ${wd.skipPermissions !== false ? 'checked' : ''}><span class="toggle-label">${wd.skipPermissions !== false ? 'On' : 'Off'}</span></div>`;
    html += '</div>';
    html += '<div class="wizard-option-desc">Add <code>--dangerously-skip-permissions</code> to Claude sessions.</div>';
    html += '</div>';
    html += '</div>';
  } else if (step === 3) {
    // Step 4: Review & Generate
    const def = buildWizardDefinition();
    const jsonStr = JSON.stringify(def, null, 2);
    const cliCmd = `npx ralphflow create-template --config '${JSON.stringify(def)}'`;

    html += '<div class="wizard-step-card">';
    html += '<h3 class="wizard-question">Review &amp; Create</h3>';
    html += '<p class="wizard-hint">Your template is ready. Review the pipeline below, then create it directly or copy the CLI command.</p>';
    html += '</div>';

    // Pipeline preview
    html += '<div class="wizard-step-card">';
    html += '<div class="builder-section-title">Pipeline</div>';
    html += renderWizardPipelinePreview();
    html += '</div>';

    // CLI command
    html += '<div class="wizard-step-card">';
    html += '<div class="builder-section-title">CLI Command</div>';
    html += `<pre class="wizard-cli-command" id="wizardCliCommand">${esc(cliCmd)}</pre>`;
    html += '<div class="wizard-actions-row">';
    html += '<button class="btn" id="wizardCopyBtn">Copy to Clipboard</button>';
    html += '<button class="btn btn-primary" id="wizardCreateBtn">Create Directly</button>';
    html += '</div>';
    html += '</div>';

    // JSON preview (collapsible)
    html += '<div class="wizard-step-card">';
    html += '<button class="yaml-toggle" id="wizardJsonToggle"><span class="yaml-toggle-icon">&rsaquo;</span> Template Definition (JSON)</button>';
    html += `<pre class="yaml-preview" id="wizardJsonPreview" style="display:none">${esc(jsonStr)}</pre>`;
    html += '</div>';

    // Advanced: open in full builder
    html += '<div class="wizard-step-card" style="border:none;background:none;padding:8px 0">';
    html += '<button class="btn btn-muted" id="wizardOpenBuilder" style="font-size:12px">Open in Full Builder for Fine-Tuning</button>';
    html += '</div>';
  }

  html += '</div>'; // close wizard-content

  // Navigation buttons
  html += '<div class="wizard-nav">';
  if (step > 0) {
    html += '<button class="btn" id="wizardPrevBtn">&larr; Previous</button>';
  } else {
    html += '<span></span>';
  }
  if (step < totalSteps - 1) {
    const nextDisabled = step === 0 && !wd.description.trim();
    html += `<button class="btn btn-primary" id="wizardNextBtn"${nextDisabled ? ' disabled' : ''}>Next &rarr;</button>`;
  }
  html += '</div>';

  dom.content.innerHTML = html;
  bindWizardEvents();
}

function bindWizardEvents() {
  const step = state.wizardStep;

  // Back to templates list
  const backBtn = document.getElementById('wizardBackBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    state.showTemplateWizard = false;
    state.wizardData = null;
    state.wizardStep = 0;
    renderTemplatesPage();
  });

  // Previous step
  const prevBtn = document.getElementById('wizardPrevBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    captureWizardInputs();
    state.wizardStep--;
    renderTemplatesPage();
  });

  // Next step
  const nextBtn = document.getElementById('wizardNextBtn');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    captureWizardInputs();
    // Validate current step
    const wd = state.wizardData;
    if (step === 0 && !wd.description.trim()) return;
    if (step === 1) {
      const validLoops = wd.loops.filter(l => l.name.trim());
      if (validLoops.length === 0) {
        alert('Add at least one pipeline step with a name');
        return;
      }
    }
    state.wizardStep++;
    renderTemplatesPage();
  });

  // Step 0: description textarea enables/disables Next
  if (step === 0) {
    const descEl = document.getElementById('wizardDesc');
    if (descEl) {
      descEl.addEventListener('input', () => {
        state.wizardData.description = descEl.value;
        const nextBtnEl = document.getElementById('wizardNextBtn');
        if (nextBtnEl) nextBtnEl.disabled = !descEl.value.trim();
      });
      // Auto-focus
      setTimeout(() => descEl.focus(), 50);
    }
  }

  // Step 1: loop management
  if (step === 1) {
    // Live-update pipeline preview on input change
    const updatePreview = () => {
      captureWizardInputs();
      const previewContainer = dom.content.querySelector('.wizard-pipeline-preview, .wizard-preview-empty');
      if (previewContainer) {
        const wrapper = previewContainer.parentElement;
        const titleEl = wrapper.querySelector('.builder-section-title');
        const newHtml = renderWizardPipelinePreview();
        // Replace content after the title
        const temp = document.createElement('div');
        temp.innerHTML = newHtml;
        if (previewContainer) previewContainer.replaceWith(temp.firstElementChild || temp);
      }
    };

    document.querySelectorAll('.wizard-loop-name, .wizard-loop-stages').forEach(input => {
      input.addEventListener('input', updatePreview);
    });

    // Add loop button
    const addLoopBtn = document.getElementById('wizardAddLoop');
    if (addLoopBtn) addLoopBtn.addEventListener('click', () => {
      captureWizardInputs();
      state.wizardData.loops.push({ name: '', stages: '' });
      renderTemplatesPage();
    });

    // Remove loop buttons
    document.querySelectorAll('[data-remove-wizard-loop]').forEach(btn => {
      btn.addEventListener('click', () => {
        captureWizardInputs();
        const idx = parseInt(btn.dataset.removeWizardLoop);
        state.wizardData.loops.splice(idx, 1);
        if (state.wizardData.multiAgentLoop >= state.wizardData.loops.length) {
          state.wizardData.multiAgentLoop = Math.max(0, state.wizardData.loops.length - 1);
        }
        renderTemplatesPage();
      });
    });
  }

  // Step 2: toggle events
  if (step === 2) {
    const maToggle = document.getElementById('wizardMultiAgent');
    if (maToggle) {
      maToggle.addEventListener('change', () => {
        state.wizardData.multiAgent = maToggle.checked;
        const label = maToggle.parentElement.querySelector('.toggle-label');
        if (label) label.textContent = maToggle.checked ? 'On' : 'Off';
        // If multi-agent just turned on, default to the loop with most work (usually index 1 or 0)
        if (maToggle.checked && state.wizardData.multiAgentLoop < 0) {
          state.wizardData.multiAgentLoop = Math.min(1, state.wizardData.loops.length - 1);
        }
        renderTemplatesPage();
      });
    }

    const skipToggle = document.getElementById('wizardSkipPerms');
    if (skipToggle) {
      skipToggle.addEventListener('change', () => {
        state.wizardData.skipPermissions = skipToggle.checked;
        const label = skipToggle.parentElement.querySelector('.toggle-label');
        if (label) label.textContent = skipToggle.checked ? 'On' : 'Off';
      });
    }
  }

  // Step 3: Review actions
  if (step === 3) {
    const copyBtn = document.getElementById('wizardCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const cmdEl = document.getElementById('wizardCliCommand');
      if (cmdEl) {
        navigator.clipboard.writeText(cmdEl.textContent).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
        }).catch(() => {
          // Fallback: select text
          const range = document.createRange();
          range.selectNodeContents(cmdEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
      }
    });

    const createBtn = document.getElementById('wizardCreateBtn');
    if (createBtn) createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';
      try {
        const def = buildWizardDefinition();
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(def)
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || 'Failed to create template');
          createBtn.disabled = false;
          createBtn.textContent = 'Create Directly';
          return;
        }
        state.showTemplateWizard = false;
        state.wizardData = null;
        state.wizardStep = 0;
        state.templatesList = [];
        renderTemplatesPage();
      } catch {
        alert('Network error — could not reach server');
        createBtn.disabled = false;
        createBtn.textContent = 'Create Directly';
      }
    });

    // JSON preview toggle
    const jsonToggle = document.getElementById('wizardJsonToggle');
    if (jsonToggle) jsonToggle.addEventListener('click', () => {
      const preview = document.getElementById('wizardJsonPreview');
      const icon = jsonToggle.querySelector('.yaml-toggle-icon');
      if (preview) {
        const visible = preview.style.display !== 'none';
        preview.style.display = visible ? 'none' : 'block';
        if (icon) icon.textContent = visible ? '\u203A' : '\u2304';
      }
    });

    // Open in full builder
    const openBuilderBtn = document.getElementById('wizardOpenBuilder');
    if (openBuilderBtn) openBuilderBtn.addEventListener('click', () => {
      captureWizardInputs();
      const def = buildWizardDefinition();
      // Convert wizard definition to builder state
      const loops = def.loops.map(l => {
        const loopState = createEmptyLoop();
        loopState.name = l.name;
        loopState.stages = l.stages;
        loopState.completion = l.completion;
        loopState.inputFiles = (l.fed_by || []).join(', ');
        loopState.outputFiles = (l.feeds || []).join(', ');
        loopState.claudeArgs = (l.claude_args || []).join(', ');
        if (l.skip_permissions === false) loopState.skipPermissions = false;
        if (l.multi_agent) {
          loopState.multi_agent = true;
          loopState.max_agents = l.multi_agent.max_agents || 3;
          loopState.strategy = l.multi_agent.strategy || 'parallel';
        }
        loopState._outputAutoFilled = false;
        loopState._inputAutoFilled = false;
        syncStageConfigs(loopState);
        return loopState;
      });

      state.showTemplateWizard = false;
      state.wizardData = null;
      state.wizardStep = 0;
      state.showTemplateBuilder = true;
      state.editingTemplateName = null;
      state.selectedBuilderLoop = 0;
      state.templateBuilderState = {
        name: def.name,
        description: def.description,
        loops: loops.length > 0 ? loops : [createEmptyLoop()]
      };
      renderTemplatesPage();
    });
  }
}

// -----------------------------------------------------------------------
// Template detail/preview page
// -----------------------------------------------------------------------

async function openTemplateDetail(templateName) {
  state.viewingTemplateName = templateName;
  state.viewingTemplateConfig = null;
  state.viewingTemplatePrompts = {};

  // Show loading state immediately
  dom.content.innerHTML = '<div class="content-empty">Loading template...</div>';

  try {
    const config = await fetchJson('/api/templates/' + encodeURIComponent(templateName) + '/config');
    state.viewingTemplateConfig = config;

    // Load prompts for all loops
    const sortedLoops = Object.entries(config.loops)
      .sort(([, a], [, b]) => a.order - b.order);

    for (const [loopKey] of sortedLoops) {
      try {
        const promptData = await fetchJson('/api/templates/' + encodeURIComponent(templateName) + '/loops/' + encodeURIComponent(loopKey) + '/prompt');
        state.viewingTemplatePrompts[loopKey] = promptData.content || '';
      } catch {
        state.viewingTemplatePrompts[loopKey] = '';
      }
    }

    renderTemplateDetail();
  } catch {
    dom.content.innerHTML = '<div class="content-empty">Failed to load template</div>';
  }
}

function renderTemplateDetail() {
  const config = state.viewingTemplateConfig;
  const templateName = state.viewingTemplateName;
  if (!config || !templateName) return;

  const tpl = state.templatesList.find(t => t.name === templateName);
  const isCustom = tpl ? tpl.type === 'custom' : false;

  const sortedLoops = Object.entries(config.loops)
    .sort(([, a], [, b]) => a.order - b.order);

  let html = '';

  // Header
  html += '<div class="templates-header">';
  html += `<div style="display:flex;align-items:center;gap:12px">
    <button class="btn btn-muted" id="detailBackBtn" style="padding:4px 10px">&larr; Back</button>
    <h2>${esc(config.name || templateName)}</h2>
    <span class="template-card-type ${isCustom ? 'custom' : 'built-in'}">${isCustom ? 'custom' : 'built-in'}</span>
  </div>`;
  if (isCustom) {
    html += `<button class="btn" id="detailEditBtn" style="font-size:12px;padding:4px 12px">Edit in Builder</button>`;
  }
  html += '</div>';

  if (config.description) {
    html += `<div style="color:var(--text-dim);font-size:13px;margin-bottom:20px">${esc(config.description)}</div>`;
  }

  // Pipeline minimap (read-only)
  html += '<div class="section" style="margin-bottom:24px">';
  html += '<div class="builder-section-title">Pipeline</div>';
  html += '<div class="detail-pipeline">';
  sortedLoops.forEach(([loopKey, loop], i) => {
    if (i > 0) {
      const prevFeeds = sortedLoops[i - 1][1].feeds || [];
      const curFedBy = loop.fed_by || [];
      const shared = prevFeeds.filter(f => curFedBy.includes(f));
      if (shared.length > 0) {
        html += `<div class="pipeline-connector-wrap">
          <div class="pipeline-connector"></div>
          <span class="connector-file" title="${esc(shared.join(', '))}">${esc(shared.join(', '))}</span>
        </div>`;
      } else {
        html += '<div class="pipeline-connector"></div>';
      }
    }
    const modelDisplay = formatModelName(loop.model);
    const fedBy = loop.fed_by || [];
    const feeds = loop.feeds || [];
    const inputIo = fedBy.length > 0 ? `<div class="node-io node-io-in">${fedBy.map(f => `<span class="node-io-label" title="input: ${esc(f)}">${esc(f)}</span>`).join('')}</div>` : '';
    const outputIo = feeds.length > 0 ? `<div class="node-io node-io-out">${feeds.map(f => `<span class="node-io-label" title="output: ${esc(f)}">${esc(f)}</span>`).join('')}</div>` : '';
    html += `<div class="pipeline-node" data-detail-loop="${esc(loopKey)}">
      ${inputIo}
      <span class="node-name">${esc(loop.name)}</span>
      <span class="node-status-row">
        <span class="node-model${modelDisplay ? '' : ' node-model-default'}">${modelDisplay ? esc(modelDisplay) : 'default'}</span>
      </span>
      ${outputIo}
    </div>`;
  });
  html += '</div></div>';

  // Loop detail cards
  html += '<div class="detail-loops">';
  sortedLoops.forEach(([loopKey, loop], i) => {
    const stages = loop.stages || [];
    const fedBy = loop.fed_by || [];
    const feeds = loop.feeds || [];
    const modelDisplay = formatModelName(loop.model);
    const promptContent = state.viewingTemplatePrompts[loopKey] || '';

    html += `<div class="detail-loop-card" id="detail-loop-${esc(loopKey)}">`;
    html += `<div class="detail-loop-header">
      <h3>${esc(loop.name)}</h3>
      <span class="detail-loop-index">Loop ${i + 1}</span>
    </div>`;

    // Config summary
    html += '<div class="detail-loop-meta">';
    if (modelDisplay) {
      html += `<div class="detail-meta-item"><span class="detail-meta-label">Model</span><span class="detail-meta-value">${esc(modelDisplay)}</span></div>`;
    }
    if (stages.length > 0) {
      html += `<div class="detail-meta-item"><span class="detail-meta-label">Stages</span><span class="detail-meta-value">${stages.map(s => esc(s)).join(' &rarr; ')}</span></div>`;
    }
    if (loop.completion) {
      html += `<div class="detail-meta-item"><span class="detail-meta-label">Completion</span><span class="detail-meta-value" style="font-family:var(--mono);font-size:11px">${esc(loop.completion)}</span></div>`;
    }
    if (fedBy.length > 0) {
      html += `<div class="detail-meta-item"><span class="detail-meta-label">Input</span><span class="detail-meta-value">${fedBy.map(f => `<code style="font-family:var(--mono);font-size:11px">${esc(f)}</code>`).join(', ')}</span></div>`;
    }
    if (feeds.length > 0) {
      html += `<div class="detail-meta-item"><span class="detail-meta-label">Output</span><span class="detail-meta-value">${feeds.map(f => `<code style="font-family:var(--mono);font-size:11px">${esc(f)}</code>`).join(', ')}</span></div>`;
    }
    if (loop.claude_args && loop.claude_args.length > 0) {
      html += `<div class="detail-meta-item"><span class="detail-meta-label">CLI Args</span><span class="detail-meta-value" style="font-family:var(--mono);font-size:11px">${loop.claude_args.map(a => esc(a)).join(' ')}</span></div>`;
    }
    html += '</div>';

    // Prompt
    html += '<div class="detail-prompt-section">';
    html += `<div class="detail-prompt-header">
      <span class="detail-meta-label">Prompt</span>
      ${isCustom ? `<span class="detail-prompt-actions">
        <button class="btn btn-primary detail-save-prompt" data-save-loop="${esc(loopKey)}" style="font-size:11px;padding:3px 10px" disabled>Save</button>
        <span class="save-ok detail-save-ok" data-save-ok="${esc(loopKey)}" style="display:none">Saved</span>
      </span>` : ''}
    </div>`;
    html += `<textarea class="detail-prompt-editor${isCustom ? '' : ' readonly'}" data-detail-prompt="${esc(loopKey)}" ${isCustom ? '' : 'readonly'} placeholder="No prompt content">${esc(promptContent)}</textarea>`;
    html += '</div>';

    html += '</div>'; // close detail-loop-card
  });
  html += '</div>';

  dom.content.innerHTML = html;

  // Bind events
  const backBtn = document.getElementById('detailBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.viewingTemplateName = null;
      state.viewingTemplateConfig = null;
      state.viewingTemplatePrompts = {};
      renderTemplatesPage();
    });
  }

  const editBtn = document.getElementById('detailEditBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const name = state.viewingTemplateName;
      state.viewingTemplateName = null;
      state.viewingTemplateConfig = null;
      state.viewingTemplatePrompts = {};
      loadTemplateForEdit(name);
    });
  }

  // Pipeline node click → scroll to loop card
  dom.content.querySelectorAll('[data-detail-loop]').forEach(node => {
    node.style.cursor = 'pointer';
    node.addEventListener('click', () => {
      const loopKey = node.dataset.detailLoop;
      const card = document.getElementById('detail-loop-' + loopKey);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.classList.add('highlighted');
        setTimeout(() => card.classList.remove('highlighted'), 1500);
      }
    });
  });

  // Prompt editing (custom templates only)
  if (isCustom) {
    dom.content.querySelectorAll('.detail-prompt-editor:not(.readonly)').forEach(textarea => {
      const loopKey = textarea.dataset.detailPrompt;
      const originalContent = state.viewingTemplatePrompts[loopKey] || '';

      textarea.addEventListener('input', () => {
        const saveBtn = dom.content.querySelector(`.detail-save-prompt[data-save-loop="${loopKey}"]`);
        if (saveBtn) saveBtn.disabled = textarea.value === originalContent;
      });

      textarea.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          saveDetailPrompt(loopKey, textarea);
        }
      });
    });

    dom.content.querySelectorAll('.detail-save-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        const loopKey = btn.dataset.saveLoop;
        const textarea = dom.content.querySelector(`.detail-prompt-editor[data-detail-prompt="${loopKey}"]`);
        if (textarea) saveDetailPrompt(loopKey, textarea);
      });
    });
  }
}

async function saveDetailPrompt(loopKey, textarea) {
  const templateName = state.viewingTemplateName;
  if (!templateName) return;

  try {
    const res = await fetch('/api/templates/' + encodeURIComponent(templateName) + '/loops/' + encodeURIComponent(loopKey) + '/prompt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: textarea.value }),
    });

    if (!res.ok) {
      alert('Failed to save prompt');
      return;
    }

    state.viewingTemplatePrompts[loopKey] = textarea.value;
    const saveBtn = dom.content.querySelector(`.detail-save-prompt[data-save-loop="${loopKey}"]`);
    if (saveBtn) saveBtn.disabled = true;
    const saveOk = dom.content.querySelector(`.detail-save-ok[data-save-ok="${loopKey}"]`);
    if (saveOk) {
      saveOk.style.display = 'inline';
      setTimeout(() => { saveOk.style.display = 'none'; }, 2000);
    }
  } catch {
    alert('Failed to save prompt');
  }
}

export function renderTemplateBuilder() {
  const tbs = state.templateBuilderState;
  // Clamp selectedBuilderLoop to valid range
  if (state.selectedBuilderLoop >= tbs.loops.length) state.selectedBuilderLoop = Math.max(0, tbs.loops.length - 1);
  const si = state.selectedBuilderLoop;
  const loop = tbs.loops[si];
  let html = '';

  html += '<div class="templates-header">';
  html += `<div style="display:flex;align-items:center;gap:12px"><button class="btn btn-muted" id="builderBackBtn" style="padding:4px 10px">&larr; Back</button><h2>${state.editingTemplateName ? 'Edit Template' : 'Create Template'}</h2></div>`;
  html += '</div>';
  html += '<div style="color:var(--text-dim);font-size:13px;margin-bottom:16px;line-height:1.5">A template defines a multi-step pipeline where each loop processes data through defined stages. Loops are connected via input/output files &mdash; one loop\'s output becomes the next loop\'s input. Each loop runs an AI agent that cycles through its stages until the completion string is detected.</div>';

  html += '<div class="template-builder">';

  // === Section 1: Overview (left column) ===
  html += '<div class="builder-col-overview">';

  // Basic info
  html += '<div class="builder-section">';
  html += '<div class="builder-section-title">Basic Info</div>';
  html += `<div class="form-group"><label class="form-label">Template Name <span class="form-hint">Unique identifier for this pipeline</span></label>
    <input class="form-input" id="tplName" type="text" value="${esc(tbs.name)}" placeholder="my-pipeline" autocomplete="off"></div>`;
  html += `<div class="form-group"><label class="form-label">Description <span class="form-hint">What does this pipeline accomplish?</span></label>
    <input class="form-input" id="tplDesc" type="text" value="${esc(tbs.description)}" placeholder="e.g. Break down stories into tasks and implement them" autocomplete="off"></div>`;
  html += '</div>';

  // Pipeline minimap (doubles as loop selector)
  html += '<div class="builder-section">';
  html += '<div class="builder-section-title">Pipeline</div>';
  html += '<div class="builder-minimap" id="builderMinimap" style="flex-wrap:wrap">';
  tbs.loops.forEach((lp, i) => {
    if (i > 0) {
      // Check for shared file between previous loop's output and this loop's input
      const prevOut = (tbs.loops[i - 1].outputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
      const curIn = (lp.inputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
      const shared = prevOut.filter(f => curIn.includes(f));
      html += '<div class="builder-minimap-connector" data-connector-idx="' + i + '">';
      if (shared.length > 0) {
        html += `<span class="builder-minimap-connector-file" title="${esc(shared.join(', '))}">${esc(shared[0])}${shared.length > 1 ? '+' + (shared.length - 1) : ''}</span>`;
      }
      html += '<div class="builder-minimap-connector-line"></div>';
      html += '</div>';
    }
    const label = lp.name || `Loop ${i + 1}`;
    const inFiles = (lp.inputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
    const outFiles = (lp.outputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
    html += `<div class="builder-minimap-node${i === si ? ' active' : ''}" data-minimap-idx="${i}" draggable="true">`;
    if (inFiles.length > 0) {
      html += `<span class="minimap-io minimap-io-in" data-minimap-io="in-${i}"><span class="minimap-io-arrow">&rarr;</span><span class="minimap-io-label" title="${esc(inFiles.join(', '))}">${esc(inFiles[0])}${inFiles.length > 1 ? '+' + (inFiles.length - 1) : ''}</span></span>`;
    }
    html += `<span class="minimap-label">${esc(label)}</span>`;
    html += `<span class="minimap-index">${i + 1}</span>`;
    if (outFiles.length > 0) {
      html += `<span class="minimap-io minimap-io-out" data-minimap-io="out-${i}"><span class="minimap-io-label" title="${esc(outFiles.join(', '))}">${esc(outFiles[0])}${outFiles.length > 1 ? '+' + (outFiles.length - 1) : ''}</span><span class="minimap-io-arrow">&rarr;</span></span>`;
    }
    html += `</div>`;
  });
  if (tbs.loops.length > 0) {
    html += '<div class="builder-minimap-connector"><div class="builder-minimap-connector-line"></div></div>';
  }
  html += '<button class="builder-minimap-add" id="minimapAddBtn" title="Add loop">+</button>';
  html += '</div></div>';

  // YAML Preview (collapsed by default)
  html += '<div class="builder-section yaml-preview-section">';
  html += `<button class="yaml-toggle" id="yamlToggleBtn"><span class="yaml-toggle-icon">&rsaquo;</span> YAML Preview</button>`;
  html += `<pre class="yaml-preview" id="yamlPreview" style="display:none">${esc(generateYamlPreview(tbs))}</pre>`;
  html += '</div>';

  html += '</div>'; // close builder-col-overview

  // === Section 2: Selected loop config (right top) ===
  html += '<div class="builder-col-config">';

  if (loop) {
    syncStageConfigs(loop);
    html += '<div class="builder-section">';
    html += `<div class="builder-section-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>Loop ${si + 1}: ${esc(loop.name || 'Untitled')}</span>
      ${tbs.loops.length > 1 ? `<button class="loop-card-remove" data-remove-loop="${si}" title="Remove loop">&times;</button>` : ''}
    </div>`;

    html += `<div class="loop-card" data-loop-index="${si}">`;
    html += '<div class="loop-card-grid">';

    // Name
    html += `<div class="form-group"><label class="form-label">Name <span class="form-hint">e.g. Story, Tasks, Test</span></label>
      <input class="form-input loop-input" data-loop-idx="${si}" data-field="name" type="text" value="${esc(loop.name)}" placeholder="Story" autocomplete="off"></div>`;

    // Model
    html += `<div class="form-group"><label class="form-label">Model <span class="form-hint">AI model for this loop</span></label>
      <select class="form-select loop-input" data-loop-idx="${si}" data-field="model">
        <option value="claude-sonnet-4-6"${loop.model === 'claude-sonnet-4-6' ? ' selected' : ''}>claude-sonnet-4-6</option>
        <option value="claude-opus-4-6"${loop.model === 'claude-opus-4-6' ? ' selected' : ''}>claude-opus-4-6</option>
        <option value="claude-haiku-4-5-20251001"${loop.model === 'claude-haiku-4-5-20251001' ? ' selected' : ''}>claude-haiku-4-5-20251001</option>
      </select></div>`;

    // Input files
    const prevLoop = si > 0 ? tbs.loops[si - 1] : null;
    const suggestedInput = prevLoop ? (prevLoop.outputFiles || '').trim() : '';
    html += `<div class="form-group"><label class="form-label">Input Files <span class="form-hint">Files this loop reads from</span></label>
      <input class="form-input loop-input" data-loop-idx="${si}" data-field="inputFiles" type="text" value="${esc(loop.inputFiles || '')}" placeholder="${suggestedInput ? esc(suggestedInput) : 'e.g. stories.md'}" autocomplete="off"></div>`;

    // Output files
    const outputPlaceholder = loop.name ? loop.name.toLowerCase().replace(/\s+/g, '-') + '.md' : 'e.g. tasks.md';
    html += `<div class="form-group"><label class="form-label">Output Files <span class="form-hint">Files this loop writes to</span></label>
      <input class="form-input loop-input" data-loop-idx="${si}" data-field="outputFiles" type="text" value="${esc(loop.outputFiles || '')}" placeholder="${esc(outputPlaceholder)}" autocomplete="off"></div>`;

    // Completion string
    html += `<div class="form-group loop-card-full"><label class="form-label">Completion String <span class="form-hint">Signal that this loop is done</span></label>
      <input class="form-input loop-input" data-loop-idx="${si}" data-field="completion" type="text" value="${esc(loop.completion)}" placeholder="LOOP COMPLETE" autocomplete="off">
      <div class="form-field-note">When this string appears in the tracker, the process is automatically stopped via <code>kill -INT $PPID</code></div></div>`;

    // Claude CLI Args
    html += `<div class="form-group loop-card-full"><label class="form-label">Claude CLI Args <span class="form-hint">Extra flags passed to Claude (comma-separated)</span></label>
      <input class="form-input loop-input" data-loop-idx="${si}" data-field="claudeArgs" type="text" value="${esc(loop.claudeArgs || '')}" placeholder="e.g. --chrome, --verbose" autocomplete="off"></div>`;

    // Skip Permissions toggle
    html += `<div class="form-group"><label class="form-label">Skip Permissions <span class="form-hint">Add --dangerously-skip-permissions</span></label>
      <div class="toggle-wrap"><input class="toggle-input loop-toggle" data-loop-idx="${si}" data-field="skipPermissions" type="checkbox" ${loop.skipPermissions !== false ? 'checked' : ''}><span class="toggle-label">${loop.skipPermissions !== false ? 'On' : 'Off'}</span></div></div>`;

    html += '</div>'; // close loop-card-grid

    // Stages section — each stage gets its own card
    html += '<div class="stages-section">';
    html += '<label class="form-label">Stages <span class="form-hint">Define the steps this loop cycles through on each iteration</span></label>';
    loop.stageConfigs.forEach((sc, sci) => {
      html += `<div class="stage-config-card">`;
      html += `<div class="stage-card-header">`;
      html += `<span class="stage-card-number">${sci + 1}</span>`;
      html += `<input class="form-input stage-name-input" data-loop-idx="${si}" data-stage-idx="${sci}" value="${esc(sc.name)}" placeholder="Stage name" autocomplete="off">`;
      html += `<button class="stage-card-remove" data-loop-idx="${si}" data-stage-idx="${sci}" title="Remove stage">&times;</button>`;
      html += `</div>`;
      html += `<textarea class="form-input stage-desc-input" data-loop-idx="${si}" data-stage-idx="${sci}" placeholder="What should this stage do? e.g. Read input files, explore codebase, identify scope...">${esc(sc.description)}</textarea>`;
      html += `</div>`;
    });
    html += `<button class="btn btn-muted add-stage-btn" data-add-stage="${si}">+ Add Stage</button>`;
    html += '</div>';

    html += '</div>'; // close loop-card
    html += '</div>'; // close builder-section
  }

  html += '</div>'; // close builder-col-config

  // === Section 3: Selected loop prompt (right bottom) ===
  html += '<div class="builder-col-prompt">';

  if (loop) {
    const showForm = loop.showPromptForm && !loop.prompt.trim();

    html += '<div class="builder-section">';
    html += `<div class="builder-section-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>Prompt</span>
      ${loop.prompt.trim() ? `<button class="btn btn-muted" data-show-prompt-form="${si}" style="font-size:11px;padding:4px 10px">Generate New</button>` : ''}
    </div>`;
    html += '<div class="prompt-section" style="margin-top:0;padding-top:0;border-top:none">';

    if (showForm) {
      html += renderPromptConfigForm(si, loop, tbs.loops);
    } else {
      html += `<textarea class="prompt-textarea" data-prompt-idx="${si}" placeholder="Add your prompt here...">${esc(loop.prompt)}</textarea>`;
      html += `<div class="prompt-toolbar">`;
      html += `<button class="btn btn-muted" data-show-prompt-form="${si}" style="font-size:11px;padding:4px 10px">Regenerate</button>`;
      html += `</div>`;
    }
    html += '</div>';
    html += '</div>';
  }

  html += '</div>'; // close builder-col-prompt

  // === Actions (spans full width) ===
  html += '<div class="builder-col-actions">';
  html += '<div class="builder-actions">';
  html += '<button class="btn" id="builderCancelBtn">Cancel</button>';
  html += `<button class="btn btn-primary" id="builderSaveBtn">${state.editingTemplateName ? 'Update Template' : 'Save Template'}</button>`;
  html += '</div>';
  html += '</div>';

  html += '</div>'; // close template-builder

  dom.content.innerHTML = html;
  bindTemplateBuilderEvents();
}

function bindTemplateBuilderEvents() {
  const backBtn = document.getElementById('builderBackBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    state.showTemplateBuilder = false;
    state.templateBuilderState = null;
    state.editingTemplateName = null;
    renderTemplatesPage();
  });

  const cancelBtn = document.getElementById('builderCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    state.showTemplateBuilder = false;
    state.templateBuilderState = null;
    state.editingTemplateName = null;
    renderTemplatesPage();
  });

  const saveBtn = document.getElementById('builderSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveTemplate);

  // Template name/desc inputs
  const tplName = document.getElementById('tplName');
  const tplDesc = document.getElementById('tplDesc');
  if (tplName) tplName.addEventListener('input', () => {
    state.templateBuilderState.name = tplName.value;
    updateYamlPreview();
  });
  if (tplDesc) tplDesc.addEventListener('input', () => {
    state.templateBuilderState.description = tplDesc.value;
    updateYamlPreview();
  });

  // Loop text inputs
  dom.content.querySelectorAll('.loop-input').forEach(input => {
    const idx = parseInt(input.dataset.loopIdx);
    const field = input.dataset.field;
    const evtType = input.tagName === 'SELECT' ? 'change' : 'input';

    input.addEventListener(evtType, () => {
      const loop = state.templateBuilderState.loops[idx];
      if (!loop) return;
      loop[field] = input.value;
      // Live-update minimap label when loop name changes
      if (field === 'name') {
        const minimapNode = dom.content.querySelector(`.builder-minimap-node[data-minimap-idx="${idx}"] .minimap-label`);
        if (minimapNode) minimapNode.textContent = input.value || `Loop ${idx + 1}`;
        // Auto-populate output file from loop name
        if (loop._outputAutoFilled !== false) {
          const autoOut = input.value ? input.value.toLowerCase().replace(/\s+/g, '-') + '.md' : '';
          loop.outputFiles = autoOut;
          const outEl = dom.content.querySelector(`.loop-input[data-loop-idx="${idx}"][data-field="outputFiles"]`);
          if (outEl) outEl.value = autoOut;
          // Cascade to next loop's input
          if (idx < state.templateBuilderState.loops.length - 1) {
            const nextLoop = state.templateBuilderState.loops[idx + 1];
            if (nextLoop._inputAutoFilled !== false) {
              nextLoop.inputFiles = autoOut;
              const nextEl = dom.content.querySelector(`.loop-input[data-loop-idx="${idx + 1}"][data-field="inputFiles"]`);
              if (nextEl) nextEl.value = autoOut;
            }
          }
          updateMinimapIO();
        }
      }
      if (field === 'outputFiles') {
        loop._outputAutoFilled = false;
        // Auto-populate next loop's input if not manually edited
        if (idx < state.templateBuilderState.loops.length - 1) {
          const nextLoop = state.templateBuilderState.loops[idx + 1];
          if (nextLoop._inputAutoFilled !== false) {
            nextLoop.inputFiles = input.value;
            const nextEl = dom.content.querySelector(`.loop-input[data-loop-idx="${idx + 1}"][data-field="inputFiles"]`);
            if (nextEl) nextEl.value = input.value;
          }
        }
        updateMinimapIO();
      }
      if (field === 'inputFiles') {
        loop._inputAutoFilled = false;
        updateMinimapIO();
      }
      updateYamlPreview();
    });
  });

  // Toggle inputs (checkboxes like skipPermissions)
  dom.content.querySelectorAll('.loop-toggle').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.dataset.loopIdx);
      const field = input.dataset.field;
      const loop = state.templateBuilderState.loops[idx];
      if (!loop) return;
      loop[field] = input.checked;
      const text = input.parentElement.querySelector('.toggle-label');
      if (text) text.textContent = input.checked ? 'On' : 'Off';
      updateYamlPreview();
    });
  });

  // Stage name inputs
  dom.content.querySelectorAll('.stage-name-input').forEach(input => {
    input.addEventListener('input', () => {
      const loopIdx = parseInt(input.dataset.loopIdx);
      const stageIdx = parseInt(input.dataset.stageIdx);
      const loop = state.templateBuilderState.loops[loopIdx];
      if (loop) {
        if (loop.stageConfigs[stageIdx]) loop.stageConfigs[stageIdx].name = input.value;
        if (loop.stages[stageIdx] !== undefined) loop.stages[stageIdx] = input.value;
        updateYamlPreview();
      }
    });
  });

  // Stage description textareas
  dom.content.querySelectorAll('.stage-desc-input').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const loopIdx = parseInt(textarea.dataset.loopIdx);
      const stageIdx = parseInt(textarea.dataset.stageIdx);
      const loop = state.templateBuilderState.loops[loopIdx];
      if (loop && loop.stageConfigs[stageIdx]) {
        loop.stageConfigs[stageIdx].description = textarea.value;
      }
    });
  });

  // Stage card remove buttons
  dom.content.querySelectorAll('.stage-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      captureBuilderInputs();
      const loopIdx = parseInt(btn.dataset.loopIdx);
      const stageIdx = parseInt(btn.dataset.stageIdx);
      const loop = state.templateBuilderState.loops[loopIdx];
      if (loop) {
        loop.stages.splice(stageIdx, 1);
        loop.stageConfigs.splice(stageIdx, 1);
        renderTemplateBuilder();
      }
    });
  });

  // Add stage button
  dom.content.querySelectorAll('.add-stage-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      captureBuilderInputs();
      const loopIdx = parseInt(btn.dataset.addStage);
      const loop = state.templateBuilderState.loops[loopIdx];
      if (loop) {
        const caps = {};
        PROMPT_CAPABILITIES.forEach(c => { caps[c.id] = false; });
        loop.stages.push('');
        loop.stageConfigs.push({ name: '', description: '', capabilities: caps });
        renderTemplateBuilder();
      }
    });
  });

  // Remove loop buttons
  dom.content.querySelectorAll('[data-remove-loop]').forEach(btn => {
    btn.addEventListener('click', () => {
      captureBuilderInputs();
      const idx = parseInt(btn.dataset.removeLoop);
      state.templateBuilderState.loops.splice(idx, 1);
      if (idx === state.selectedBuilderLoop) {
        state.selectedBuilderLoop = Math.max(0, idx - 1);
      } else if (idx < state.selectedBuilderLoop) {
        state.selectedBuilderLoop--;
      }
      renderTemplateBuilder();
    });
  });

  // YAML preview toggle
  const yamlToggle = document.getElementById('yamlToggleBtn');
  if (yamlToggle) {
    yamlToggle.addEventListener('click', () => {
      const preview = document.getElementById('yamlPreview');
      const icon = yamlToggle.querySelector('.yaml-toggle-icon');
      if (preview) {
        const visible = preview.style.display !== 'none';
        preview.style.display = visible ? 'none' : 'block';
        if (icon) icon.textContent = visible ? '\u203A' : '\u2304';
      }
    });
  }

  // Prompt textarea input
  dom.content.querySelectorAll('.prompt-textarea').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const idx = parseInt(textarea.dataset.promptIdx);
      state.templateBuilderState.loops[idx].prompt = textarea.value;
    });
  });

  // Minimap: click node → select that loop (capture inputs first, then re-render)
  dom.content.querySelectorAll('.builder-minimap-node').forEach(node => {
    node.addEventListener('click', () => {
      const idx = parseInt(node.dataset.minimapIdx);
      if (idx === state.selectedBuilderLoop) return;
      captureBuilderInputs();
      state.selectedBuilderLoop = idx;
      renderTemplateBuilder();
    });
  });

  // Minimap: add button
  const minimapAddBtn = document.getElementById('minimapAddBtn');
  if (minimapAddBtn) {
    minimapAddBtn.addEventListener('click', () => {
      captureBuilderInputs();
      const loops = state.templateBuilderState.loops;
      const newLoop = createEmptyLoop();
      // Auto-fill input from previous loop's output
      if (loops.length > 0) {
        const prevOutput = (loops[loops.length - 1].outputFiles || '').trim();
        if (prevOutput) {
          newLoop.inputFiles = prevOutput;
        }
      }
      loops.push(newLoop);
      state.selectedBuilderLoop = loops.length - 1;
      renderTemplateBuilder();
    });
  }

  // Drag-and-drop reordering for minimap nodes and loop cards
  setupBuilderDragAndDrop();

  // Prompt config form events
  bindPromptConfigFormEvents();
}

function setupBuilderDragAndDrop() {
  let dragSrcIdx = null;

  function reorderLoops(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    captureBuilderInputs();
    const loops = state.templateBuilderState.loops;
    const [moved] = loops.splice(fromIdx, 1);
    loops.splice(toIdx, 0, moved);
    // Update selectedBuilderLoop to follow the same loop object
    if (state.selectedBuilderLoop === fromIdx) {
      state.selectedBuilderLoop = toIdx;
    } else {
      let newSel = state.selectedBuilderLoop;
      if (fromIdx < newSel) newSel--;
      if (toIdx <= newSel) newSel++;
      state.selectedBuilderLoop = newSel;
    }
    renderTemplateBuilder();
  }

  // Minimap node drag events
  dom.content.querySelectorAll('.builder-minimap-node[draggable="true"]').forEach(node => {
    node.addEventListener('dragstart', (e) => {
      dragSrcIdx = parseInt(node.dataset.minimapIdx);
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSrcIdx);
    });

    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      dom.content.querySelectorAll('.builder-minimap-node.drag-over').forEach(n => n.classList.remove('drag-over'));
      dragSrcIdx = null;
    });

    node.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetIdx = parseInt(node.dataset.minimapIdx);
      if (targetIdx !== dragSrcIdx) {
        node.classList.add('drag-over');
      }
    });

    node.addEventListener('dragleave', () => {
      node.classList.remove('drag-over');
    });

    node.addEventListener('drop', (e) => {
      e.preventDefault();
      node.classList.remove('drag-over');
      const toIdx = parseInt(node.dataset.minimapIdx);
      if (dragSrcIdx !== null && dragSrcIdx !== toIdx) {
        reorderLoops(dragSrcIdx, toIdx);
      }
    });
  });
}

// Capture current input values into state before re-render
export function captureBuilderInputs() {
  const tbs = state.templateBuilderState;
  if (!tbs) return;
  const tplName = document.getElementById('tplName');
  const tplDesc = document.getElementById('tplDesc');
  if (tplName) tbs.name = tplName.value;
  if (tplDesc) tbs.description = tplDesc.value;

  dom.content.querySelectorAll('.loop-input').forEach(input => {
    const idx = parseInt(input.dataset.loopIdx);
    const field = input.dataset.field;
    const loop = tbs.loops[idx];
    if (!loop) return;
    loop[field] = input.value;
  });

  // Capture toggle inputs (checkboxes)
  dom.content.querySelectorAll('.loop-toggle').forEach(input => {
    const idx = parseInt(input.dataset.loopIdx);
    const field = input.dataset.field;
    const loop = tbs.loops[idx];
    if (loop) loop[field] = input.checked;
  });

  // Capture stage card inputs
  dom.content.querySelectorAll('.stage-name-input').forEach(input => {
    const loopIdx = parseInt(input.dataset.loopIdx);
    const stageIdx = parseInt(input.dataset.stageIdx);
    const loop = tbs.loops[loopIdx];
    if (loop) {
      if (loop.stageConfigs[stageIdx]) loop.stageConfigs[stageIdx].name = input.value;
      if (loop.stages[stageIdx] !== undefined) loop.stages[stageIdx] = input.value;
    }
  });
  dom.content.querySelectorAll('.stage-desc-input').forEach(textarea => {
    const loopIdx = parseInt(textarea.dataset.loopIdx);
    const stageIdx = parseInt(textarea.dataset.stageIdx);
    const loop = tbs.loops[loopIdx];
    if (loop && loop.stageConfigs[stageIdx]) {
      loop.stageConfigs[stageIdx].description = textarea.value;
    }
  });

  // Capture prompt textareas
  dom.content.querySelectorAll('.prompt-textarea').forEach(textarea => {
    const idx = parseInt(textarea.dataset.promptIdx);
    if (tbs.loops[idx]) {
      tbs.loops[idx].prompt = textarea.value;
    }
  });

  // Capture prompt config form inputs
  capturePromptConfigFormInputs();
}

export function updateYamlPreview() {
  const preview = document.getElementById('yamlPreview');
  if (preview && state.templateBuilderState) {
    preview.textContent = generateYamlPreview(state.templateBuilderState);
  }
}

export function updateMinimapIO() {
  if (!state.templateBuilderState) return;
  const tbs = state.templateBuilderState;
  tbs.loops.forEach((lp, i) => {
    const node = dom.content.querySelector(`.builder-minimap-node[data-minimap-idx="${i}"]`);
    if (!node) return;
    const inFiles = (lp.inputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
    const outFiles = (lp.outputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
    // Update or create input file label
    let inEl = node.querySelector('.minimap-io-in');
    if (inFiles.length > 0) {
      const inHtml = `<span class="minimap-io-arrow">&rarr;</span><span class="minimap-io-label" title="${esc(inFiles.join(', '))}">${esc(inFiles[0])}${inFiles.length > 1 ? '+' + (inFiles.length - 1) : ''}</span>`;
      if (inEl) {
        inEl.innerHTML = inHtml;
      } else {
        inEl = document.createElement('span');
        inEl.className = 'minimap-io minimap-io-in';
        inEl.setAttribute('data-minimap-io', 'in-' + i);
        inEl.innerHTML = inHtml;
        node.insertBefore(inEl, node.firstChild);
      }
    } else if (inEl) {
      inEl.remove();
    }
    // Update or create output file label
    let outEl = node.querySelector('.minimap-io-out');
    if (outFiles.length > 0) {
      const outHtml = `<span class="minimap-io-label" title="${esc(outFiles.join(', '))}">${esc(outFiles[0])}${outFiles.length > 1 ? '+' + (outFiles.length - 1) : ''}</span><span class="minimap-io-arrow">&rarr;</span>`;
      if (outEl) {
        outEl.innerHTML = outHtml;
      } else {
        outEl = document.createElement('span');
        outEl.className = 'minimap-io minimap-io-out';
        outEl.setAttribute('data-minimap-io', 'out-' + i);
        outEl.innerHTML = outHtml;
        node.appendChild(outEl);
      }
    } else if (outEl) {
      outEl.remove();
    }
    // Update connector between this loop and the next
    if (i > 0) {
      const connector = dom.content.querySelector(`.builder-minimap-connector[data-connector-idx="${i}"]`);
      if (connector) {
        const prevOut = (tbs.loops[i - 1].outputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
        const curIn = inFiles;
        const shared = prevOut.filter(f => curIn.includes(f));
        let fileEl = connector.querySelector('.builder-minimap-connector-file');
        if (shared.length > 0) {
          const label = esc(shared[0]) + (shared.length > 1 ? '+' + (shared.length - 1) : '');
          if (fileEl) {
            fileEl.textContent = label;
            fileEl.title = shared.join(', ');
          } else {
            fileEl = document.createElement('span');
            fileEl.className = 'builder-minimap-connector-file';
            fileEl.textContent = label;
            fileEl.title = shared.join(', ');
            connector.insertBefore(fileEl, connector.firstChild);
          }
        } else if (fileEl) {
          fileEl.remove();
        }
      }
    }
    // Also update the connector after this loop (for the next loop)
    if (i < tbs.loops.length - 1) {
      const nextConnector = dom.content.querySelector(`.builder-minimap-connector[data-connector-idx="${i + 1}"]`);
      if (nextConnector) {
        const nextIn = (tbs.loops[i + 1].inputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
        const shared = outFiles.filter(f => nextIn.includes(f));
        let fileEl = nextConnector.querySelector('.builder-minimap-connector-file');
        if (shared.length > 0) {
          const label = esc(shared[0]) + (shared.length > 1 ? '+' + (shared.length - 1) : '');
          if (fileEl) {
            fileEl.textContent = label;
            fileEl.title = shared.join(', ');
          } else {
            fileEl = document.createElement('span');
            fileEl.className = 'builder-minimap-connector-file';
            fileEl.textContent = label;
            fileEl.title = shared.join(', ');
            nextConnector.insertBefore(fileEl, nextConnector.firstChild);
          }
        } else if (fileEl) {
          fileEl.remove();
        }
      }
    }
  });
}

function generateYamlPreview(tbs) {
  let yaml = '';
  yaml += `name: ${tbs.name || 'my-template'}\n`;
  yaml += `description: "${tbs.description || ''}"\n`;
  yaml += `version: 1\n`;
  yaml += `dir: .ralph-flow\n`;
  yaml += `entities: {}\n`;
  yaml += `loops:\n`;

  tbs.loops.forEach((loop, index) => {
    const baseName = (loop.name || `loop-${index + 1}`).toLowerCase().replace(/\s+/g, '-');
    const loopKey = baseName.endsWith('-loop') ? baseName : `${baseName}-loop`;
    const dirPrefix = String(index).padStart(2, '0');
    const loopDirName = `${dirPrefix}-${loopKey}`;

    yaml += `  ${loopKey}:\n`;
    yaml += `    order: ${index}\n`;
    yaml += `    name: "${loop.name || `Loop ${index + 1}`}"\n`;
    yaml += `    prompt: ${loopDirName}/prompt.md\n`;
    yaml += `    tracker: ${loopDirName}/tracker.md\n`;
    yaml += `    stages: [${loop.stages.join(', ')}]\n`;
    yaml += `    completion: "${loop.completion || 'LOOP COMPLETE'}"\n`;

    yaml += `    multi_agent: false\n`;
    yaml += `    model: ${loop.model || 'claude-sonnet-4-6'}\n`;
    yaml += `    cadence: 0\n`;

    const claudeArgsList = (loop.claudeArgs || '').split(',').map(s => s.trim()).filter(Boolean);
    if (claudeArgsList.length > 0) {
      yaml += `    claude_args:\n`;
      claudeArgsList.forEach(a => { yaml += `      - ${a}\n`; });
    }
    if (loop.skipPermissions === false) {
      yaml += `    skip_permissions: false\n`;
    }

    const ioFedBy = (loop.inputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
    const ioFeeds = (loop.outputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ioFedBy.length > 0) {
      yaml += `    fed_by:\n`;
      ioFedBy.forEach(f => { yaml += `      - ${f}\n`; });
    }
    if (ioFeeds.length > 0) {
      yaml += `    feeds:\n`;
      ioFeeds.forEach(f => { yaml += `      - ${f}\n`; });
    }
  });

  return yaml;
}

async function saveTemplate() {
  captureBuilderInputs();
  const tbs = state.templateBuilderState;

  if (!tbs.name || !tbs.name.trim()) {
    alert('Template name is required');
    return;
  }

  for (let i = 0; i < tbs.loops.length; i++) {
    const loop = tbs.loops[i];
    if (!loop.name || !loop.name.trim()) {
      alert(`Loop ${i + 1}: name is required`);
      return;
    }
    if (loop.stages.length === 0) {
      alert(`Loop "${loop.name}": at least one stage is required`);
      return;
    }
    if (!loop.completion || !loop.completion.trim()) {
      alert(`Loop "${loop.name}": completion string is required`);
      return;
    }
  }

  const definition = {
    name: tbs.name.trim(),
    description: tbs.description.trim(),
    loops: tbs.loops.map(loop => {
      const loopDef = {
        name: loop.name.trim(),
        stages: loop.stages,
        completion: loop.completion.trim(),
        model: loop.model || undefined,
      };
      const fedByList = (loop.inputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
      const feedsList = (loop.outputFiles || '').split(',').map(s => s.trim()).filter(Boolean);
      if (fedByList.length > 0) {
        loopDef.fed_by = fedByList;
      }
      if (feedsList.length > 0) {
        loopDef.feeds = feedsList;
      }
      const claudeArgsList = (loop.claudeArgs || '').split(',').map(s => s.trim()).filter(Boolean);
      if (claudeArgsList.length > 0) {
        loopDef.claude_args = claudeArgsList;
      }
      if (loop.skipPermissions === false) {
        loopDef.skip_permissions = false;
      }
      if (loop.prompt && loop.prompt.trim()) {
        loopDef.prompt = loop.prompt;
      }
      return loopDef;
    })
  };

  const saveBtnEl = document.getElementById('builderSaveBtn');
  const saveBtnLabel = state.editingTemplateName ? 'Update Template' : 'Save Template';
  if (saveBtnEl) {
    saveBtnEl.disabled = true;
    saveBtnEl.textContent = 'Saving...';
  }

  try {
    // In edit mode, delete the old template first
    if (state.editingTemplateName) {
      const delRes = await fetch('/api/templates/' + encodeURIComponent(state.editingTemplateName), { method: 'DELETE' });
      if (!delRes.ok) {
        const delData = await delRes.json();
        alert(delData.error || 'Failed to update template');
        if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = saveBtnLabel; }
        return;
      }
    }

    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(definition)
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to save template');
      if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = saveBtnLabel; }
      return;
    }

    state.showTemplateBuilder = false;
    state.templateBuilderState = null;
    state.editingTemplateName = null;
    state.templatesList = [];
    renderTemplatesPage();
  } catch {
    alert('Network error — could not reach server');
    if (saveBtnEl) { saveBtnEl.disabled = false; saveBtnEl.textContent = saveBtnLabel; }
  }
}

async function loadTemplateForEdit(templateName) {
  try {
    const configRes = await fetch('/api/templates/' + encodeURIComponent(templateName) + '/config');
    if (!configRes.ok) {
      alert('Failed to load template config');
      return;
    }
    const config = await configRes.json();

    // Convert config loops to builder state
    const sortedLoops = Object.entries(config.loops)
      .sort(([, a], [, b]) => a.order - b.order);

    const loops = [];
    for (const [loopKey, loop] of sortedLoops) {
      const loopState = {
        name: loop.name || '',
        model: loop.model || 'claude-sonnet-4-6',
        stages: loop.stages || [],
        completion: loop.completion || '',
        multi_agent: false,
        max_agents: 3,
        strategy: 'parallel',
        agent_placeholder: '{{AGENT_NAME}}',
        data_files: [],
        entities: [],
        showOptional: false,
        showPrompt: false,
        prompt: '',
        inputFiles: (loop.fed_by || []).join(', '),
        outputFiles: (loop.feeds || []).join(', '),
        claudeArgs: (loop.claude_args || []).join(', '),
        skipPermissions: loop.skip_permissions !== false,
        stageConfigs: [],
        showPromptForm: false,
        _outputAutoFilled: false,
        _inputAutoFilled: false
      };

      // Load prompt content
      try {
        const promptRes = await fetch('/api/templates/' + encodeURIComponent(templateName) + '/loops/' + encodeURIComponent(loopKey) + '/prompt');
        if (promptRes.ok) {
          const promptData = await promptRes.json();
          loopState.prompt = promptData.content || '';
        }
      } catch { /* prompt load is best-effort */ }

      // Show form if no prompt content loaded
      loopState.showPromptForm = !loopState.prompt.trim();
      loops.push(loopState);
    }

    state.editingTemplateName = templateName;
    state.showTemplateBuilder = true;
    state.selectedBuilderLoop = 0;
    state.templateBuilderState = {
      name: config.name || templateName,
      description: config.description || '',
      loops: loops.length > 0 ? loops : [createEmptyLoop()]
    };
    renderTemplatesPage();
  } catch {
    alert('Failed to load template for editing');
  }
}

function openDeleteTemplateModal(templateName) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Delete Template</h3>
        <button class="modal-close" data-action="close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:12px">Delete template <strong>${esc(templateName)}</strong>?</p>
        <p style="color:var(--red);font-size:13px">This will permanently remove the template. Apps already created from it are not affected.</p>
        <div id="deleteTemplateMessage"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="close">Cancel</button>
        <button class="btn btn-danger" id="deleteTemplateBtn">Delete</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.dataset.action === 'close') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  overlay.querySelector('#deleteTemplateBtn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#deleteTemplateBtn');
    const msgEl = overlay.querySelector('#deleteTemplateMessage');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
      const res = await fetch('/api/templates/' + encodeURIComponent(templateName), { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        msgEl.innerHTML = `<div class="form-error">${esc(data.error || 'Failed to delete')}</div>`;
        btn.disabled = false;
        btn.textContent = 'Delete';
        return;
      }

      overlay.remove();
      state.templatesList = [];
      renderTemplatesPage();
    } catch {
      msgEl.innerHTML = '<div class="form-error">Network error</div>';
      btn.disabled = false;
      btn.textContent = 'Delete';
    }
  });
}

function openCloneTemplateModal(templateName) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Clone Template</h3>
        <button class="modal-close" data-action="close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom:12px">Clone <strong>${esc(templateName)}</strong> as a new custom template.</p>
        <div class="form-group">
          <label class="form-label">New Template Name</label>
          <input class="form-input" id="cloneTemplateName" type="text" placeholder="my-custom-pipeline" autocomplete="off">
        </div>
        <div id="cloneTemplateMessage"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="close">Cancel</button>
        <button class="btn btn-primary" id="cloneTemplateBtn">Clone</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#cloneTemplateName');
  nameInput.focus();

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.dataset.action === 'close') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#cloneTemplateBtn').click();
  });

  overlay.querySelector('#cloneTemplateBtn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#cloneTemplateBtn');
    const msgEl = overlay.querySelector('#cloneTemplateMessage');
    const newName = nameInput.value.trim();

    if (!newName) {
      msgEl.innerHTML = '<div class="form-error">Please enter a template name</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Cloning...';

    try {
      const res = await fetch('/api/templates/' + encodeURIComponent(templateName) + '/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName })
      });
      const data = await res.json();

      if (!res.ok) {
        msgEl.innerHTML = `<div class="form-error">${esc(data.error || 'Failed to clone')}</div>`;
        btn.disabled = false;
        btn.textContent = 'Clone';
        return;
      }

      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      state.templatesList = [];
      renderTemplatesPage();
    } catch {
      msgEl.innerHTML = '<div class="form-error">Network error</div>';
      btn.disabled = false;
      btn.textContent = 'Clone';
    }
  });
}
