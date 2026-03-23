// Main content rendering: pipeline, loop detail panels, prompt editing,
// tracker/config viewers, model selector, and app modals.

import { $, state, dom, actions } from './state.js';
import { esc, fetchJson, renderMarkdown, calculatePipelineProgress, getLoopStatusClass, formatModelName, extractNotifMessage } from './utils.js';
import { renderDecisionGroups, dismissNotification, dismissDecision } from './notifications.js';
import { switchAppTab, loadArchives } from './archives.js';

// -----------------------------------------------------------------------
// Main content renderer
// -----------------------------------------------------------------------

export function renderContent() {
  if (state.currentPage === 'templates') {
    actions.renderTemplatesPage();
    return;
  }
  if (!state.selectedApp) {
    dom.content.innerHTML = '<div class="content-empty">Select an app to view details</div>';
    return;
  }

  const app = state.selectedApp;
  const currentLoop = app.loops.find(l => l.key === state.selectedLoop);

  let html = '';

  // App header
  html += `<div class="app-header">
    <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;width:100%">
      <div style="display:flex;align-items:center;gap:10px">
        <h2>${esc(app.appName)}</h2>
        <span class="app-type-badge">${esc(app.appType)}</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-muted" style="font-size:12px;padding:4px 10px" onclick="openArchiveAppModal('${esc(app.appName)}')">Archive</button>
        <button class="btn btn-danger" style="font-size:12px;padding:4px 10px" onclick="openDeleteAppModal('${esc(app.appName)}')">Delete</button>
      </div>
    </div>
    ${app.description ? `<div class="app-desc">${esc(app.description)}</div>` : ''}
  </div>`;

  // App-level tabs: Loops | Archives
  html += `<div class="app-tabs">
    <button class="app-tab${state.activeAppTab === 'loops' ? ' active' : ''}" data-app-tab="loops">Loops</button>
    <button class="app-tab${state.activeAppTab === 'archives' ? ' active' : ''}" data-app-tab="archives">Archives</button>
  </div>`;

  if (state.activeAppTab === 'archives') {
    html += '<div id="archivesContainer">Loading archives...</div>';
    dom.content.innerHTML = html;

    // Bind app tab clicks
    dom.content.querySelectorAll('.app-tab').forEach(tab => {
      tab.addEventListener('click', () => switchAppTab(tab.dataset.appTab));
    });

    loadArchives(app.appName);
    return;
  }

  // --- Loops tab content ---

  // Pipeline
  const pipelineProgress = calculatePipelineProgress(app.loops);
  const progressByKey = {};
  pipelineProgress.perLoop.forEach(p => { progressByKey[p.key] = p; });
  html += '<div class="section"><div class="section-title">Pipeline</div><div class="pipeline">';
  app.loops.forEach((loop, i) => {
    if (i > 0) {
      const prevComplete = getLoopStatusClass(app.loops[i - 1]) === 'complete';
      const prevOut = app.loops[i - 1].feeds || [];
      const curIn = loop.fed_by || [];
      const sharedFiles = prevOut.filter(f => curIn.includes(f));
      if (sharedFiles.length > 0) {
        html += `<div class="pipeline-connector-wrap">
          <div class="pipeline-connector${prevComplete ? ' complete' : ''}"></div>
          <span class="connector-file" title="${esc(sharedFiles.join(', '))}">${esc(sharedFiles.join(', '))}</span>
        </div>`;
      } else {
        html += `<div class="pipeline-connector${prevComplete ? ' complete' : ''}"></div>`;
      }
    }
    const statusClass = getLoopStatusClass(loop);
    const isSelected = loop.key === state.selectedLoop;
    const modelDisplay = formatModelName(loop.model);
    const lp = progressByKey[loop.key] || { completed: 0, total: 0, fraction: 0 };
    const progressText = lp.total > 0 ? `${lp.completed}/${lp.total}` : '\u2014';
    const progressPct = Math.round(lp.fraction * 100);
    const fedBy = loop.fed_by || [];
    const feeds = loop.feeds || [];
    const inputIo = fedBy.length > 0 ? `<div class="node-io node-io-in">${fedBy.map(f => `<span class="node-io-label" title="input: ${esc(f)}">${esc(f)}</span>`).join('')}</div>` : '';
    const outputIo = feeds.length > 0 ? `<div class="node-io node-io-out">${feeds.map(f => `<span class="node-io-label" title="output: ${esc(f)}">${esc(f)}</span>`).join('')}</div>` : '';
    html += `<div class="pipeline-node${isSelected ? ' selected' : ''}" data-loop="${esc(loop.key)}">
      ${inputIo}
      <span class="node-name">${esc(loop.name)}</span>
      <span class="node-status-row">
        <span class="node-status ${statusClass}">${statusClass}</span>
        <span class="node-model-sep">&middot;</span>
        <span class="node-model${modelDisplay ? '' : ' node-model-default'}">${modelDisplay ? esc(modelDisplay) : 'default'}</span>
      </span>
      <div class="node-progress">
        <span class="node-progress-text">${progressText}</span>
        <div class="node-progress-bar"><div class="node-progress-fill" style="width:${progressPct}%"></div></div>
      </div>
      ${outputIo}
    </div>`;
  });
  html += '</div></div>';

  // Commands section
  html += '<div class="section"><div class="section-title">Commands</div><div class="commands-list">';
  app.loops.forEach(loop => {
    const alias = loop.key.replace(/-loop$/, '');
    let cmd = `npx ralphflow run ${alias} -f ${app.appName}`;
    if (loop.multiAgent) cmd += ' --multi-agent';
    if (loop.model) cmd += ` --model ${loop.model}`;
    html += `<div class="cmd-item">
      <span class="cmd-text">${esc(cmd)}</span>
      <button class="cmd-copy" data-cmd="${esc(cmd)}">Copy</button>
    </div>`;
  });
  const e2eCmd = `npx ralphflow e2e -f ${app.appName}`;
  html += `<div class="cmd-item">
    <span class="cmd-text">${esc(e2eCmd)}</span>
    <button class="cmd-copy" data-cmd="${esc(e2eCmd)}">Copy</button>
  </div>`;
  html += '</div></div>';

  // Loop detail — two-column three-panel layout
  if (currentLoop) {
    const st = currentLoop.status || {};

    html += '<div class="panel-grid">';

    // Left column: Interactive + Progress
    html += '<div class="panel-col-left">';

    // Interactive panel — Notifications + Decisions
    const loopNotifs = state.notificationsList.filter(n => n.app === app.appName && n.loop === currentLoop.key);
    const loopDecisions = state.decisionsList.filter(d => d.app === app.appName && d.loop === currentLoop.key);
    const hasNotifs = loopNotifs.length > 0;
    const hasDecisions = loopDecisions.length > 0;
    const interactiveTotal = loopNotifs.length + loopDecisions.length;
    const hasInteractive = hasNotifs || hasDecisions;
    html += `<div class="panel panel-interactive${hasInteractive ? ' has-notifs' : ''}">
      <div class="panel-header">Interactive${interactiveTotal > 0 ? ' <span style="color:var(--accent)">(' + interactiveTotal + ')</span>' : ''}</div>
      <div class="panel-body">`;

    if (!hasInteractive) {
      html += `<span class="bell-icon">&#128276;</span><span>No notifications or decisions</span>`;
    } else {
      // Notifications section
      if (hasNotifs) {
        html += '<div class="interactive-section-header">Notifications</div>';
        for (const n of loopNotifs) {
          const time = new Date(n.timestamp).toLocaleTimeString();
          const msg = extractNotifMessage(n.payload);
          html += `<div class="notif-card" data-notif-id="${esc(n.id)}">
            <span class="notif-time">${esc(time)}</span>
            <span class="notif-msg">${esc(msg)}</span>
            <button class="notif-dismiss" data-dismiss-id="${esc(n.id)}">&times;</button>
          </div>`;
        }
      }

      // Decisions section with nested grouping
      if (hasDecisions) {
        html += '<div class="interactive-section-header">Decisions</div>';
        html += renderDecisionGroups(loopDecisions);
      }
    }
    html += '</div></div>';

    // Progress panel
    html += `<div class="panel panel-progress">
      <div class="panel-header">Progress</div>
      <div class="panel-body">
        <div class="loop-meta">
          <div class="meta-card"><div class="meta-label">Stage</div><div class="meta-value">${esc(st.stage || '—')}</div></div>
          <div class="meta-card"><div class="meta-label">Active</div><div class="meta-value">${esc(st.active || 'none')}</div></div>
          <div class="meta-card">
            <div class="meta-label">Progress</div>
            <div class="meta-value">${st.completed || 0}/${st.total || 0}</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${st.total ? (st.completed / st.total * 100) : 0}%"></div></div>
          </div>
          <div class="meta-card"><div class="meta-label">Stages</div><div class="meta-value" style="font-size:11px">${(currentLoop.stages || []).join(' → ')}</div></div>
        </div>`;

    // Agent table
    if (st.agents && st.agents.length > 0) {
      html += `<div style="margin-top:16px">
        <table class="agent-table">
          <thead><tr><th>Agent</th><th>Active Task</th><th>Stage</th><th>Heartbeat</th></tr></thead>
          <tbody>`;
      for (const ag of st.agents) {
        html += `<tr><td>${esc(ag.name)}</td><td>${esc(ag.activeTask)}</td><td>${esc(ag.stage)}</td><td>${esc(ag.lastHeartbeat)}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    // Tracker viewer (inside Progress panel)
    html += `<div class="tracker-viewer" id="trackerViewer">Loading...</div>`;

    html += '</div></div>'; // close .panel-body + .panel-progress
    html += '</div>'; // close .panel-col-left

    // Right column: Edit panel with tabs
    html += `<div class="panel panel-edit">
      <div class="edit-tabs">
        <button class="edit-tab${state.activeEditTab === 'prompt' ? ' active' : ''}" data-tab="prompt">Prompt</button>
        <button class="edit-tab${state.activeEditTab === 'tracker' ? ' active' : ''}" data-tab="tracker">Tracker</button>
        <button class="edit-tab${state.activeEditTab === 'config' ? ' active' : ''}" data-tab="config">Config</button>
        <div class="model-selector-wrap">
          <label>Model</label>
          <select class="model-selector" id="modelSelector">
            <option value="">Default</option>
            <option value="claude-opus-4-6">claude-opus-4-6</option>
            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
          </select>
          <span class="model-save-ok" id="modelSaveOk">Saved</span>
        </div>
      </div>
      <div class="panel-body" id="editTabContent"></div>
    </div>`;

    html += '</div>'; // close .panel-grid
  }

  dom.content.innerHTML = html;

  // Bind app-level tab clicks
  dom.content.querySelectorAll('.app-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAppTab(tab.dataset.appTab));
  });

  // Bind pipeline node clicks
  dom.content.querySelectorAll('.pipeline-node').forEach(el => {
    el.addEventListener('click', () => actions.selectLoop(el.dataset.loop));
  });

  // Bind command copy buttons
  dom.content.querySelectorAll('.commands-list .cmd-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd || '';
      navigator.clipboard.writeText(cmd).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  });

  // Bind notification dismiss buttons
  dom.content.querySelectorAll('.notif-dismiss').forEach(btn => {
    btn.addEventListener('click', () => dismissNotification(btn.dataset.dismissId));
  });

  // Bind decision dismiss buttons
  dom.content.querySelectorAll('.decision-dismiss').forEach(btn => {
    btn.addEventListener('click', () => dismissDecision(btn.dataset.dismissDecisionId));
  });

  // Bind decision group collapse/expand
  dom.content.querySelectorAll('.decision-group-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const groupId = hdr.dataset.decisionGroup;
      const body = document.getElementById(groupId);
      const chevron = hdr.querySelector('.group-chevron');
      if (body && chevron) {
        body.classList.toggle('collapsed');
        chevron.classList.toggle('expanded');
      }
    });
  });

  // Bind edit tabs + load content
  if (currentLoop) {
    dom.content.querySelectorAll('.edit-tab').forEach(tab => {
      tab.addEventListener('click', () => switchEditTab(tab.dataset.tab, app.appName, currentLoop.key));
    });
    renderEditTabContent(app.appName, currentLoop.key);
    loadTracker(app.appName, currentLoop.key);
    loadModelSelector(app.appName, currentLoop.key);
  }
}

// -----------------------------------------------------------------------
// Edit panel: prompt, tracker, config tabs
// -----------------------------------------------------------------------

function bindPromptEditor(appName, loopKey) {
  const editor = $('#promptEditor');
  if (!editor) return;

  editor.addEventListener('input', () => {
    state.promptDirty = editor.value !== state.promptOriginal;
    updateDirtyState();
  });

  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      savePrompt(appName, loopKey);
    }
  });

  const saveBtn = $('#savePromptBtn');
  const resetBtn = $('#resetPromptBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => savePrompt(appName, loopKey));
  if (resetBtn) resetBtn.addEventListener('click', () => {
    editor.value = state.promptOriginal;
    state.promptDirty = false;
    updateDirtyState();
  });
}

async function loadPrompt(appName, loopKey) {
  const editor = $('#promptEditor');
  if (!editor) return;

  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/loops/${encodeURIComponent(loopKey)}/prompt`);
    editor.value = data.content || '';
    state.promptOriginal = editor.value;
    state.promptDirty = false;
    updateDirtyState();
  } catch {
    editor.value = '(Error loading prompt)';
  }
  bindPromptEditor(appName, loopKey);
}

async function loadPromptPreview(appName, loopKey) {
  const preview = $('#promptPreview');
  if (!preview) return;
  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/loops/${encodeURIComponent(loopKey)}/prompt`);
    state.promptOriginal = data.content || '';
    preview.innerHTML = renderMarkdown(state.promptOriginal);
  } catch {
    preview.innerHTML = '<p style="color:var(--text-dim)">(Error loading prompt)</p>';
  }
}

async function savePrompt(appName, loopKey) {
  const editor = $('#promptEditor');
  if (!editor || !state.promptDirty) return;

  try {
    await fetch(`/api/apps/${encodeURIComponent(appName)}/loops/${encodeURIComponent(loopKey)}/prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editor.value }),
    });
    state.promptOriginal = editor.value;
    state.promptDirty = false;
    updateDirtyState();
    const saveOk = $('#saveOk');
    if (saveOk) {
      saveOk.style.display = 'inline';
      setTimeout(() => { saveOk.style.display = 'none'; }, 2000);
    }
  } catch {
    alert('Failed to save prompt');
  }
}

function updateDirtyState() {
  const saveBtn = $('#savePromptBtn');
  const resetBtn = $('#resetPromptBtn');
  const indicator = $('#dirtyIndicator');
  if (saveBtn) saveBtn.disabled = !state.promptDirty;
  if (resetBtn) resetBtn.disabled = !state.promptDirty;
  if (indicator) indicator.style.display = state.promptDirty ? 'inline' : 'none';
}

export async function loadTracker(appName, loopKey) {
  const viewer = $('#trackerViewer');
  if (!viewer) return;

  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/loops/${encodeURIComponent(loopKey)}/tracker`);
    viewer.innerHTML = renderMarkdown(data.content || '(empty)');
  } catch {
    viewer.innerHTML = '(No tracker file found)';
  }
}

function switchEditTab(tab, appName, loopKey) {
  if (tab === state.activeEditTab) return;
  if (state.activeEditTab === 'prompt') {
    const editor = $('#promptEditor');
    if (editor) {
      state.cachedPromptValue = editor.value;
    }
  }
  state.activeEditTab = tab;
  document.querySelectorAll('.edit-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderEditTabContent(appName, loopKey);
}

function renderEditTabContent(appName, loopKey) {
  const container = $('#editTabContent');
  if (!container) return;

  if (state.activeEditTab === 'prompt') {
    const isRead = state.promptViewMode === 'read';
    const isEdit = state.promptViewMode === 'edit';
    container.innerHTML = `
      <div class="prompt-mode-toggle">
        <button class="prompt-mode-btn${isRead ? ' active' : ''}" data-mode="read">Read</button>
        <button class="prompt-mode-btn${isEdit ? ' active' : ''}" data-mode="edit">Edit</button>
      </div>
      ${isEdit ? `<div class="editor-wrap">
        <textarea class="editor" id="promptEditor" placeholder="Loading..."></textarea>
        <div class="editor-actions">
          <button class="btn btn-primary" id="savePromptBtn" disabled>Save</button>
          <button class="btn" id="resetPromptBtn" disabled>Reset</button>
          <span class="dirty-indicator" id="dirtyIndicator" style="display:none">Unsaved changes</span>
          <span class="save-ok" id="saveOk" style="display:none">Saved</span>
        </div>
      </div>` : `<div class="prompt-preview" id="promptPreview">Loading...</div>`}`;
    // Bind toggle buttons
    container.querySelectorAll('.prompt-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.mode === state.promptViewMode) return;
        // Cache editor value before switching away from edit
        if (state.promptViewMode === 'edit') {
          const editor = $('#promptEditor');
          if (editor) state.cachedPromptValue = editor.value;
        }
        state.promptViewMode = btn.dataset.mode;
        renderEditTabContent(appName, loopKey);
      });
    });
    if (isEdit) {
      if (state.cachedPromptValue !== null) {
        const editor = $('#promptEditor');
        if (editor) {
          editor.value = state.cachedPromptValue;
          updateDirtyState();
          bindPromptEditor(appName, loopKey);
        }
        state.cachedPromptValue = null;
      } else {
        loadPrompt(appName, loopKey);
      }
    } else {
      // Read mode — render markdown preview
      if (state.cachedPromptValue !== null || state.promptOriginal) {
        const content = state.cachedPromptValue !== null ? state.cachedPromptValue : state.promptOriginal;
        const preview = $('#promptPreview');
        if (preview) preview.innerHTML = renderMarkdown(content);
      } else {
        // Need to fetch
        loadPromptPreview(appName, loopKey);
      }
    }
  } else if (state.activeEditTab === 'tracker') {
    container.innerHTML = '<pre class="code-viewer" id="editTrackerViewer">Loading...</pre>';
    loadEditTracker(appName, loopKey);
  } else if (state.activeEditTab === 'config') {
    container.innerHTML = '<pre class="code-viewer" id="editConfigViewer">Loading...</pre>';
    loadEditConfig(appName);
  }
}

async function loadEditTracker(appName, loopKey) {
  const viewer = $('#editTrackerViewer');
  if (!viewer) return;
  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/loops/${encodeURIComponent(loopKey)}/tracker`);
    viewer.textContent = data.content || '(empty)';
  } catch {
    viewer.textContent = '(No tracker file found)';
  }
}

async function loadEditConfig(appName) {
  const viewer = $('#editConfigViewer');
  if (!viewer) return;
  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/config`);
    viewer.textContent = data._rawYaml || JSON.stringify(data, null, 2);
  } catch {
    viewer.textContent = '(Error loading config)';
  }
}

async function loadModelSelector(appName, loopKey) {
  const selector = $('#modelSelector');
  if (!selector) return;

  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/config`);
    const loopConfig = data.loops && data.loops[loopKey];
    const currentModel = loopConfig && loopConfig.model ? loopConfig.model : '';
    selector.value = currentModel;
  } catch {
    // Leave at default
  }

  selector.addEventListener('change', () => changeModel(appName, loopKey, selector.value));
}

async function changeModel(appName, loopKey, model) {
  const saveOk = $('#modelSaveOk');
  try {
    await fetch(`/api/apps/${encodeURIComponent(appName)}/config/model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loop: loopKey, model: model || null }),
    });
    if (saveOk) {
      saveOk.classList.add('visible');
      setTimeout(() => saveOk.classList.remove('visible'), 2000);
    }
    // Refresh config tab if it's currently visible
    if (state.activeEditTab === 'config') {
      loadEditConfig(appName);
    }
  } catch {
    alert('Failed to update model');
  }
}

// -----------------------------------------------------------------------
// App modals: Delete, Archive, Create
// -----------------------------------------------------------------------

export function openDeleteAppModal(appName) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Delete App</h3>
        <button class="modal-close" data-action="close">&times;</button>
      </div>
      <div class="modal-body" id="deleteModalBody">
        <p style="margin-bottom:12px">Are you sure you want to delete <strong>${esc(appName)}</strong>?</p>
        <p style="color:var(--red);font-size:13px">This will permanently remove the app directory and all associated data. This action cannot be undone.</p>
        <div id="deleteModalMessage"></div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="close">Cancel</button>
        <button class="btn btn-danger" id="deleteModalBtn">Delete</button>
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

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.dataset.action === 'close') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  document.addEventListener('keydown', escHandler);

  overlay.querySelector('#deleteModalBtn').addEventListener('click', () => submitDeleteApp(overlay, appName));
}

async function submitDeleteApp(overlay, appName) {
  const msgEl = overlay.querySelector('#deleteModalMessage');
  const deleteBtn = overlay.querySelector('#deleteModalBtn');

  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting...';
  msgEl.innerHTML = '';

  try {
    const res = await fetch('/api/apps/' + encodeURIComponent(appName), { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      msgEl.innerHTML = `<div class="form-error">${esc(data.error || 'Failed to delete app')}</div>`;
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete';
      return;
    }

    overlay.remove();

    // Clean up client state
    state.notificationsList = state.notificationsList.filter(n => n.app !== appName);
    state.decisionsList = state.decisionsList.filter(d => d.app !== appName);
    if (state.selectedApp && state.selectedApp.appName === appName) {
      state.selectedApp = null;
      state.selectedLoop = null;
      document.title = state.projectName ? state.projectName + ' \u00b7 RalphFlow Dashboard' : 'RalphFlow Dashboard';
    }
    actions.fetchApps();
  } catch (err) {
    msgEl.innerHTML = '<div class="form-error">Network error — could not reach server</div>';
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Delete';
  }
}

export function openArchiveAppModal(appName) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Archive App</h3>
        <button class="modal-close" data-action="close">&times;</button>
      </div>
      <div class="modal-body" id="archiveModalBody">
        <p style="margin-bottom:12px">Archive <strong>${esc(appName)}</strong>?</p>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:8px">This will snapshot all current work and reset to a clean slate:</p>
        <ul style="color:var(--text-dim);font-size:13px;margin-left:18px;margin-bottom:12px;line-height:1.6">
          <li>Stories, tasks, and trackers saved to <code style="font-family:var(--mono);font-size:12px;color:var(--text)">.archives/</code></li>
          <li>Tracker and data files reset to template defaults</li>
          <li>Prompts and config preserved</li>
        </ul>
        <div id="archiveModalMessage"></div>
      </div>
      <div class="modal-footer" id="archiveModalFooter">
        <button class="btn" data-action="close">Cancel</button>
        <button class="btn btn-primary" id="archiveModalBtn">Archive</button>
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

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.dataset.action === 'close') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  document.addEventListener('keydown', escHandler);

  overlay.querySelector('#archiveModalBtn').addEventListener('click', () => submitArchiveApp(overlay, appName));
}

async function submitArchiveApp(overlay, appName) {
  const msgEl = overlay.querySelector('#archiveModalMessage');
  const archiveBtn = overlay.querySelector('#archiveModalBtn');

  archiveBtn.disabled = true;
  archiveBtn.textContent = 'Archiving...';
  msgEl.innerHTML = '';

  try {
    const res = await fetch('/api/apps/' + encodeURIComponent(appName) + '/archive', { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      msgEl.innerHTML = `<div class="form-error">${esc(data.error || 'Failed to archive app')}</div>`;
      archiveBtn.disabled = false;
      archiveBtn.textContent = 'Archive';
      return;
    }

    // Show success state
    const body = overlay.querySelector('#archiveModalBody');
    const footer = overlay.querySelector('#archiveModalFooter');

    body.innerHTML = `
      <p style="color:var(--green);margin-bottom:12px">Archived successfully.</p>
      <p style="font-size:13px;color:var(--text-dim)">Snapshot saved to <code style="font-family:var(--mono);font-size:12px;color:var(--text)">${esc(data.archivePath)}</code></p>
      <p style="font-size:13px;color:var(--text-dim);margin-top:8px">Timestamp: <strong style="color:var(--text)">${esc(data.timestamp)}</strong></p>
    `;
    footer.innerHTML = `<button class="btn btn-primary" data-action="close">Done</button>`;

    // Clean up client state and refresh
    state.notificationsList = state.notificationsList.filter(n => n.app !== appName);
    state.decisionsList = state.decisionsList.filter(d => d.app !== appName);
    actions.fetchApps();
  } catch (err) {
    msgEl.innerHTML = '<div class="form-error">Network error — could not reach server</div>';
    archiveBtn.disabled = false;
    archiveBtn.textContent = 'Archive';
  }
}

export async function openCreateAppModal() {
  // Remove any existing modal
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  // Fetch available templates (built-in + custom)
  let templates = [];
  try {
    templates = await fetchJson('/api/templates');
  } catch {
    templates = [
      { name: 'code-implementation', type: 'built-in' },
      { name: 'research', type: 'built-in' }
    ];
  }

  let optionsHtml = '';
  for (const tpl of templates) {
    optionsHtml += `<option value="${esc(tpl.name)}">${esc(tpl.name)}${tpl.type === 'custom' ? ' (custom)' : ''}</option>`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Create New App</h3>
        <button class="modal-close" data-action="close">&times;</button>
      </div>
      <div class="modal-body" id="modalBody">
        <div class="form-group">
          <label class="form-label">Template</label>
          <select class="form-select" id="modalTemplate">
            ${optionsHtml}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">App Name</label>
          <input class="form-input" id="modalName" type="text" placeholder="my-feature" autocomplete="off">
        </div>
        <div id="modalMessage"></div>
      </div>
      <div class="modal-footer" id="modalFooter">
        <button class="btn" data-action="close">Cancel</button>
        <button class="btn btn-primary" id="modalCreateBtn">Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on overlay click or close buttons
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.dataset.action === 'close') {
      overlay.remove();
    }
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Focus name input
  const nameInput = overlay.querySelector('#modalName');
  setTimeout(() => nameInput.focus(), 50);

  // Submit on Enter in name input
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCreateApp(overlay);
    }
  });

  // Create button
  const createBtn = overlay.querySelector('#modalCreateBtn');
  createBtn.addEventListener('click', () => submitCreateApp(overlay));
}

async function submitCreateApp(overlay) {
  const templateEl = overlay.querySelector('#modalTemplate');
  const nameEl = overlay.querySelector('#modalName');
  const msgEl = overlay.querySelector('#modalMessage');
  const createBtn = overlay.querySelector('#modalCreateBtn');

  const template = templateEl.value;
  const name = nameEl.value.trim();

  // Client-side validation
  if (!name) {
    msgEl.innerHTML = '<div class="form-error">Name is required</div>';
    nameEl.focus();
    return;
  }

  // Disable button during request
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';
  msgEl.innerHTML = '';

  try {
    const res = await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, name }),
    });
    const data = await res.json();

    if (!res.ok) {
      msgEl.innerHTML = `<div class="form-error">${esc(data.error || 'Failed to create app')}</div>`;
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
      return;
    }

    // Success — show next-steps view
    showNextSteps(overlay, data);
  } catch (err) {
    msgEl.innerHTML = '<div class="form-error">Network error — could not reach server</div>';
    createBtn.disabled = false;
    createBtn.textContent = 'Create';
  }
}

function showNextSteps(overlay, data) {
  const body = overlay.querySelector('#modalBody');
  const footer = overlay.querySelector('#modalFooter');

  let warningHtml = '';
  if (data.warning) {
    warningHtml = `<div class="form-warning">${esc(data.warning)}</div>`;
  }

  let cmdsHtml = '';
  for (const cmd of data.commands) {
    cmdsHtml += `
      <div class="cmd-item">
        <span class="cmd-text">${esc(cmd)}</span>
        <button class="cmd-copy" data-cmd="${esc(cmd)}">Copy</button>
      </div>`;
  }

  body.innerHTML = `
    <div class="next-steps-success">&#10003; Created ${esc(data.appName)}</div>
    ${warningHtml}
    <div class="next-steps-label">Next steps — run one of these in your terminal:</div>
    ${cmdsHtml}
  `;

  footer.innerHTML = `<button class="btn btn-primary" data-action="close">Done</button>`;
  footer.querySelector('[data-action="close"]').addEventListener('click', () => overlay.remove());

  // Copy-to-clipboard buttons
  body.querySelectorAll('.cmd-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd || '';
      navigator.clipboard.writeText(cmd).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  });
}

// Expose modal functions globally for inline onclick handlers
window.openDeleteAppModal = openDeleteAppModal;
window.openArchiveAppModal = openArchiveAppModal;
