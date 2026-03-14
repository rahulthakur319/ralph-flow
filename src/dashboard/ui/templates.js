// Template listing, builder UI, drag-and-drop, YAML preview, save/load/delete/clone.

import { state, dom, actions } from './state.js';
import { fetchJson, esc } from './utils.js';
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
  if (state.showTemplateBuilder) {
    renderTemplateBuilder();
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
      html += `<div class="template-card">
        <div class="template-card-header">
          <span class="template-card-name">${esc(tpl.name)}</span>
          <span class="template-card-type ${tpl.type}">${esc(tpl.type)}</span>
        </div>
        ${tpl.description ? `<div class="template-card-desc">${esc(tpl.description)}</div>` : ''}
        <div class="template-card-meta">
          <span>${tpl.loopCount} loop${tpl.loopCount !== 1 ? 's' : ''}</span>
          ${tpl.type === 'custom' ? `<button class="btn" style="font-size:11px;padding:2px 8px" data-edit-template="${esc(tpl.name)}">Edit</button><button class="btn btn-danger" style="font-size:11px;padding:2px 8px;margin-left:4px" data-delete-template="${esc(tpl.name)}">Delete</button>` : `<button class="btn" style="font-size:11px;padding:2px 8px" data-clone-template="${esc(tpl.name)}">Clone</button>`}
        </div>
      </div>`;
    }
    html += '</div>';
  }

  dom.content.innerHTML = html;

  const createBtn = document.getElementById('createTemplateBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      state.showTemplateBuilder = true;
      state.editingTemplateName = null;
      state.selectedBuilderLoop = 0;
      state.templateBuilderState = initTemplateBuilderState();
      renderTemplatesPage();
    });
  }

  dom.content.querySelectorAll('[data-edit-template]').forEach(btn => {
    btn.addEventListener('click', () => loadTemplateForEdit(btn.dataset.editTemplate));
  });

  dom.content.querySelectorAll('[data-delete-template]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteTemplateModal(btn.dataset.deleteTemplate));
  });

  dom.content.querySelectorAll('[data-clone-template]').forEach(btn => {
    btn.addEventListener('click', () => openCloneTemplateModal(btn.dataset.cloneTemplate));
  });
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
      html += `<div class="prompt-builder-toolbar">`;
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
