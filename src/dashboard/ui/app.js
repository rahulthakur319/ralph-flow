// Application entry point — WebSocket, data fetching, init, action wiring.

import { state, dom, actions } from './state.js';
import { fetchJson } from './utils.js';
import { renderSidebar, selectApp, selectLoop } from './sidebar.js';
import { renderContent, loadTracker, openDeleteAppModal, openArchiveAppModal, openCreateAppModal } from './loop-detail.js';
import {
  fetchNotifications,
  dismissNotification,
  fetchDecisions,
  dismissDecision,
  maybeRequestNotifPermission,
  showBrowserNotification,
  showBrowserDecisionNotification,
  playNotificationChime,
  onFirstInteraction,
} from './notifications.js';
import { switchAppTab, loadArchives } from './archives.js';
import {
  renderTemplatesPage,
  renderTemplateBuilder,
  captureBuilderInputs,
  updateYamlPreview,
  updateMinimapIO,
  fetchTemplates,
} from './templates.js';

// -----------------------------------------------------------------------
// Wire cross-module actions registry
// -----------------------------------------------------------------------
actions.renderSidebar = renderSidebar;
actions.renderContent = renderContent;
actions.selectLoop = selectLoop;
actions.fetchApps = fetchApps;
actions.fetchAppStatus = fetchAppStatus;
actions.openCreateAppModal = openCreateAppModal;
actions.openDeleteAppModal = openDeleteAppModal;
actions.openArchiveAppModal = openArchiveAppModal;
actions.renderTemplatesPage = renderTemplatesPage;
actions.renderTemplateBuilder = renderTemplateBuilder;
actions.captureBuilderInputs = captureBuilderInputs;
actions.updateYamlPreview = updateYamlPreview;
actions.updateMinimapIO = updateMinimapIO;
actions.fetchTemplates = fetchTemplates;
actions.switchAppTab = switchAppTab;
actions.loadArchives = loadArchives;
actions.dismissNotification = dismissNotification;
actions.dismissDecision = dismissDecision;

// -----------------------------------------------------------------------
// Host display
// -----------------------------------------------------------------------
dom.hostDisplay.textContent = location.host;

fetch('/api/context')
  .then(r => r.json())
  .then(ctx => {
    dom.hostDisplay.textContent = ctx.projectName + ' :' + ctx.port;
    dom.pageTitle.textContent = ctx.projectName;
    document.title = ctx.projectName + ' \u00b7 RalphFlow Dashboard';
    state.projectName = ctx.projectName;
  })
  .catch(() => { /* keep location.host as fallback */ });

// -----------------------------------------------------------------------
// WebSocket
// -----------------------------------------------------------------------
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);

  state.ws.onopen = () => {
    dom.statusDot.className = 'status-dot connected';
    dom.statusText.textContent = 'Connected';
    state.reconnectDelay = 1000;
  };

  state.ws.onclose = () => {
    dom.statusDot.className = 'status-dot disconnected';
    dom.statusText.textContent = 'Disconnected';
    setTimeout(connectWs, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
  };

  state.ws.onerror = () => {
    state.ws.close();
  };

  state.ws.onmessage = (e) => {
    const event = JSON.parse(e.data);
    state.eventCounter++;
    dom.eventCountEl.textContent = state.eventCounter;
    dom.lastUpdate.textContent = new Date().toLocaleTimeString();
    handleWsEvent(event);
  };
}

function handleWsEvent(event) {
  if (event.type === 'status:full') {
    state.apps = event.apps;
    renderSidebar();
    if (state.selectedApp) {
      const updated = state.apps.find(a => a.appName === state.selectedApp.appName);
      if (updated) {
        state.selectedApp = updated;
        renderContent();
      }
    }
  } else if (event.type === 'tracker:updated') {
    if (state.selectedApp && state.selectedApp.appName === event.app) {
      const loopEntry = state.selectedApp.loops.find(l => l.key === event.loop);
      if (loopEntry) {
        loopEntry.status = event.status;
      }
      renderContent();
      if (state.selectedLoop === event.loop) {
        loadTracker(event.app, event.loop);
      }
    }
  } else if (event.type === 'file:changed') {
    if (state.selectedApp && state.selectedApp.appName === event.app) {
      fetchAppStatus(event.app);
    }
  } else if (event.type === 'notification:attention') {
    const n = event.notification;
    state.notificationsList.unshift(n);
    renderSidebar();
    renderContent();
    maybeRequestNotifPermission();
    showBrowserNotification(n);
    playNotificationChime();
  } else if (event.type === 'notification:dismissed') {
    state.notificationsList = state.notificationsList.filter(n => n.id !== event.id);
    renderSidebar();
    renderContent();
  } else if (event.type === 'decision:reported') {
    const d = event.decision;
    state.decisionsList.unshift(d);
    renderSidebar();
    renderContent();
    maybeRequestNotifPermission();
    showBrowserDecisionNotification(d);
    playNotificationChime();
  } else if (event.type === 'decision:dismissed') {
    state.decisionsList = state.decisionsList.filter(d => d.id !== event.id);
    renderSidebar();
    renderContent();
  }
}

// -----------------------------------------------------------------------
// API
// -----------------------------------------------------------------------
async function fetchApps() {
  state.apps = await fetchJson('/api/apps');
  renderSidebar();
  if (state.apps.length > 0 && !state.selectedApp) {
    selectApp(state.apps[0]);
  }
}

async function fetchAppStatus(appName) {
  const statuses = await fetchJson(`/api/apps/${encodeURIComponent(appName)}/status`);
  if (state.selectedApp && state.selectedApp.appName === appName) {
    statuses.forEach(s => {
      const loop = state.selectedApp.loops.find(l => l.key === s.key);
      if (loop) loop.status = s;
    });
    renderContent();
  }
}

// -----------------------------------------------------------------------
// Templates nav click handler
// -----------------------------------------------------------------------
document.getElementById('templatesNav').addEventListener('click', () => {
  state.currentPage = 'templates';
  state.selectedApp = null;
  state.selectedLoop = null;
  state.showTemplateBuilder = false;
  state.templateBuilderState = null;
  state.editingTemplateName = null;
  state.viewingTemplateName = null;
  state.viewingTemplateConfig = null;
  state.viewingTemplatePrompts = {};
  state.showTemplateWizard = false;
  state.wizardStep = 0;
  state.wizardData = null;
  document.title = 'Templates \u00b7 ' + (state.projectName || 'RalphFlow Dashboard');
  renderSidebar();
  renderContent();
});

// -----------------------------------------------------------------------
// Audio context init on first interaction
// -----------------------------------------------------------------------
document.addEventListener('click', onFirstInteraction);
document.addEventListener('keydown', onFirstInteraction);

// -----------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------
fetchApps();
fetchNotifications();
fetchDecisions();
connectWs();
