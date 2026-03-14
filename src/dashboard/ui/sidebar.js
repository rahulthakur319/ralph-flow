// Sidebar rendering, app/loop selection, navigation.

import { state, dom, actions } from './state.js';
import { calculatePipelineProgress, esc } from './utils.js';

export function renderSidebar() {
  let html = '';
  for (const app of state.apps) {
    const appActive = state.selectedApp && state.selectedApp.appName === app.appName;
    const appProgress = calculatePipelineProgress(app.loops);
    html += `<div class="sidebar-item app-item${appActive ? ' active' : ''}" data-app="${esc(app.appName)}">
      ${esc(app.appName)}
      <span class="badge">${esc(app.appType)}</span>
    </div>`;
    html += `<div class="sidebar-progress">
      <div class="sidebar-progress-bar"><div class="sidebar-progress-fill" style="width:${appProgress.percentage}%"></div></div>
      <span class="sidebar-progress-text">${appProgress.percentage}%</span>
    </div>`;
    if (app.loops) {
      for (const loop of app.loops) {
        const loopActive = appActive && state.selectedLoop === loop.key;
        const loopNotifCount = state.notificationsList.filter(n => n.app === app.appName && n.loop === loop.key).length;
        const loopDecisionCount = state.decisionsList.filter(d => d.app === app.appName && d.loop === loop.key).length;
        const notifBadge = loopNotifCount > 0 ? ` <span class="notif-badge">${loopNotifCount}</span>` : '';
        const decisionBadge = loopDecisionCount > 0 ? ` <span class="decision-badge">${loopDecisionCount}</span>` : '';
        html += `<div class="sidebar-item loop-item${loopActive ? ' active' : ''}" data-app="${esc(app.appName)}" data-loop="${esc(loop.key)}">
          ${esc(loop.name)}${notifBadge}${decisionBadge}
        </div>`;
      }
    }
  }
  dom.sidebarApps.innerHTML = html;

  // "+ New App" button
  const newAppBtn = document.createElement('button');
  newAppBtn.className = 'new-app-btn';
  newAppBtn.innerHTML = '+ New App';
  newAppBtn.addEventListener('click', () => actions.openCreateAppModal());
  dom.sidebarApps.appendChild(newAppBtn);

  // Event delegation
  dom.sidebarApps.querySelectorAll('.app-item').forEach(el => {
    el.addEventListener('click', () => {
      const app = state.apps.find(a => a.appName === el.dataset.app);
      if (app) selectApp(app);
    });
  });
  dom.sidebarApps.querySelectorAll('.loop-item').forEach(el => {
    el.addEventListener('click', () => {
      const app = state.apps.find(a => a.appName === el.dataset.app);
      if (app) {
        selectApp(app);
        selectLoop(el.dataset.loop);
      }
    });
  });

  // Update Templates nav active state
  const templatesNav = document.getElementById('templatesNav');
  if (templatesNav) {
    templatesNav.classList.toggle('active', state.currentPage === 'templates');
  }
}

export function selectApp(app) {
  state.currentPage = 'app';
  state.selectedApp = app;
  state.selectedLoop = app.loops.length > 0 ? app.loops[0].key : null;
  state.promptDirty = false;
  state.promptOriginal = '';
  state.promptViewMode = 'read';
  state.activeEditTab = 'prompt';
  state.cachedPromptValue = null;
  state.activeAppTab = 'loops';
  state.archivesData = [];
  state.expandedArchive = null;
  state.archiveFilesCache = {};
  state.viewingArchiveFile = null;
  document.title = app.appName + ' - RalphFlow Dashboard';
  renderSidebar();
  actions.renderContent();
  actions.fetchAppStatus(app.appName);
}

export function selectLoop(loopKey) {
  state.selectedLoop = loopKey;
  state.promptDirty = false;
  state.promptOriginal = '';
  state.promptViewMode = 'read';
  state.activeEditTab = 'prompt';
  state.cachedPromptValue = null;
  renderSidebar();
  actions.renderContent();
}
