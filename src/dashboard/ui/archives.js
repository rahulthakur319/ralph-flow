// Archive browsing: listing, file tree, file viewer.

import { state, actions } from './state.js';
import { fetchJson, esc, renderMarkdown } from './utils.js';

export function switchAppTab(tab) {
  if (tab === state.activeAppTab) return;
  state.activeAppTab = tab;
  state.expandedArchive = null;
  state.archiveFilesCache = {};
  state.archiveSummaryCache = {};
  state.viewingArchiveFile = null;
  actions.renderContent();
}

export async function loadArchives(appName) {
  const container = document.getElementById('archivesContainer');
  if (!container) return;

  try {
    state.archivesData = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/archives`);
    renderArchivesView(container, appName);
  } catch {
    container.innerHTML = '<div class="archive-empty"><div>Error loading archives</div></div>';
  }
}

function renderArchivesView(container, appName) {
  if (state.archivesData.length === 0) {
    container.innerHTML = `<div class="archive-empty">
      <div class="archive-empty-icon">&#128451;</div>
      <div>No archives yet</div>
      <div style="margin-top:8px;font-size:12px">Use the Archive button to snapshot current work</div>
    </div>`;
    return;
  }

  let html = '<div class="archive-timeline">';
  for (const archive of state.archivesData) {
    const isExpanded = state.expandedArchive === archive.timestamp;
    const dateStr = formatArchiveTimestamp(archive.timestamp);
    html += `<div class="archive-card${isExpanded ? ' expanded' : ''}" data-archive="${esc(archive.timestamp)}">
      <div class="archive-card-header" data-archive-toggle="${esc(archive.timestamp)}">
        <span class="archive-card-date">${esc(dateStr)}</span>
        <div class="archive-card-stats">
          <span class="archive-card-stat">Stories: <span class="stat-val">${archive.summary.storyCount}</span></span>
          <span class="archive-card-stat">Tasks: <span class="stat-val">${archive.summary.taskCount}</span></span>
          <span class="archive-card-stat">Files: <span class="stat-val">${archive.fileCount}</span></span>
          <span class="archive-card-chevron">&#9654;</span>
        </div>
      </div>`;

    if (isExpanded) {
      const files = state.archiveFilesCache[archive.timestamp];
      if (files) {
        // Show summary.md prominently at top if available, otherwise show CLI hint
        const summaryContent = state.archiveSummaryCache[archive.timestamp];
        if (summaryContent) {
          html += `<div class="archive-summary">${renderMarkdown(summaryContent)}</div>`;
        } else {
          html += `<div class="archive-summary-hint">
            <span class="archive-summary-hint-text">No summary yet. Generate one with:</span>
            <code class="archive-summary-hint-cmd">npx ralphflow summarize ${esc(appName)} ${esc(archive.timestamp)}</code>
          </div>`;
        }

        // Filter summary.md from regular file list
        const displayFiles = files.filter(f => f.path !== 'summary.md');
        html += '<div class="archive-files">';
        for (const file of displayFiles) {
          const isActive = state.viewingArchiveFile === file.path;
          html += `<div class="archive-file-item${isActive ? ' active' : ''}" data-archive-file="${esc(file.path)}" data-archive-ts="${esc(archive.timestamp)}">
            <span class="archive-file-icon">&#128196;</span>
            <span>${esc(file.path)}</span>
          </div>`;
        }
        html += '</div>';

        if (state.viewingArchiveFile) {
          html += `<div class="archive-file-viewer">
            <div class="archive-file-viewer-header">
              <span>${esc(state.viewingArchiveFile)}</span>
              <button class="archive-file-viewer-close" data-close-viewer="true">&times;</button>
            </div>
            <div class="archive-file-content" id="archiveFileContent">Loading...</div>
          </div>`;
        }
      } else {
        html += '<div class="archive-files" style="padding:16px;color:var(--text-dim);font-size:12px">Loading files...</div>';
      }
    }

    html += '</div>';
  }
  html += '</div>';

  container.innerHTML = html;

  // Bind archive card toggle clicks
  container.querySelectorAll('.archive-card-header').forEach(header => {
    header.addEventListener('click', () => toggleArchiveCard(appName, header.dataset.archiveToggle));
  });

  // Bind archive file clicks
  container.querySelectorAll('.archive-file-item').forEach(item => {
    item.addEventListener('click', () => {
      viewArchiveFile(appName, item.dataset.archiveTs, item.dataset.archiveFile);
    });
  });

  // Bind file viewer close button
  const closeBtn = container.querySelector('[data-close-viewer]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      state.viewingArchiveFile = null;
      renderArchivesView(container, appName);
    });
  }

  // Load file content if viewer is open
  if (state.viewingArchiveFile && state.expandedArchive) {
    loadArchiveFileContent(appName, state.expandedArchive, state.viewingArchiveFile);
  }
}

async function toggleArchiveCard(appName, timestamp) {
  const container = document.getElementById('archivesContainer');
  if (!container) return;

  if (state.expandedArchive === timestamp) {
    state.expandedArchive = null;
    state.viewingArchiveFile = null;
    renderArchivesView(container, appName);
    return;
  }

  state.expandedArchive = timestamp;
  state.viewingArchiveFile = null;

  // Load files if not cached
  if (!state.archiveFilesCache[timestamp]) {
    renderArchivesView(container, appName);
    try {
      const files = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/archives/${encodeURIComponent(timestamp)}/files`);
      state.archiveFilesCache[timestamp] = files;

      // Auto-fetch summary.md if present
      const hasSummary = files.some(f => f.path === 'summary.md');
      if (hasSummary) {
        try {
          const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/archives/${encodeURIComponent(timestamp)}/files/summary.md`);
          state.archiveSummaryCache[timestamp] = data.content || '';
        } catch {
          // summary fetch failed — skip display
        }
      }
    } catch {
      state.archiveFilesCache[timestamp] = [];
    }
  }

  renderArchivesView(container, appName);
}

function viewArchiveFile(appName, timestamp, filePath) {
  const container = document.getElementById('archivesContainer');
  if (!container) return;

  state.viewingArchiveFile = filePath;
  renderArchivesView(container, appName);
}

async function loadArchiveFileContent(appName, timestamp, filePath) {
  const contentEl = document.getElementById('archiveFileContent');
  if (!contentEl) return;

  try {
    const data = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/archives/${encodeURIComponent(timestamp)}/files/${filePath}`);
    contentEl.textContent = data.content || '(empty file)';
  } catch {
    contentEl.textContent = '(Error loading file)';
  }
}

function formatArchiveTimestamp(ts) {
  // Format: 2026-03-14_15-30 → Mar 14, 2026 at 15:30
  const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})/);
  if (!match) return ts;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, year, month, day, hour, min] = match;
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year} at ${hour}:${min}`;
}
