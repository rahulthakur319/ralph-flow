// Dashboard global state and DOM references
// All mutable state lives here so modules can share it via import.

export const $ = (sel) => document.querySelector(sel);

export const dom = {
  pageTitle: $('#pageTitle'),
  hostDisplay: $('#hostDisplay'),
  sidebarApps: $('#sidebarApps'),
  content: $('#content'),
  statusDot: $('#statusDot'),
  statusText: $('#statusText'),
  lastUpdate: $('#lastUpdate'),
  eventCountEl: $('#eventCount'),
};

export const state = {
  apps: [],
  selectedApp: null,
  selectedLoop: null,
  eventCounter: 0,
  promptDirty: false,
  promptOriginal: '',
  ws: null,
  reconnectDelay: 1000,
  activeEditTab: 'prompt',
  promptViewMode: 'read',
  cachedPromptValue: null,
  notificationsList: [],
  decisionsList: [],
  notifPermissionRequested: false,
  audioCtx: null,
  audioCtxInitialized: false,
  activeAppTab: 'loops',
  archivesData: [],
  expandedArchive: null,
  archiveFilesCache: {},
  archiveSummaryCache: {},
  viewingArchiveFile: null,
  projectName: null,
  currentPage: 'app',
  templatesList: [],
  showTemplateBuilder: false,
  templateBuilderState: null,
  editingTemplateName: null,
  selectedBuilderLoop: 0,
  viewingTemplateName: null,
  viewingTemplateConfig: null,
  viewingTemplatePrompts: {},
  showTemplateWizard: false,
  wizardStep: 0,
  wizardData: null,
};

// Cross-module function registry.
// Modules register callable functions here to avoid circular imports.
export const actions = {};
