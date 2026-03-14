// Notification and decision handling, audio chimes, browser notifications.

import { state, actions } from './state.js';
import { fetchJson, extractNotifMessage, esc } from './utils.js';

export async function fetchNotifications() {
  try {
    const data = await fetchJson('/api/notifications');
    state.notificationsList = Array.isArray(data) ? data : [];
    actions.renderSidebar();
    actions.renderContent();
  } catch { /* ignore */ }
}

export async function dismissNotification(id) {
  try {
    await fetch(`/api/notification/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.notificationsList = state.notificationsList.filter(n => n.id !== id);
    actions.renderSidebar();
    actions.renderContent();
  } catch { /* ignore */ }
}

export function maybeRequestNotifPermission() {
  if (state.notifPermissionRequested) return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    state.notifPermissionRequested = true;
    Notification.requestPermission();
  }
}

export function showBrowserNotification(n) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return;
  const msg = extractNotifMessage(n.payload);
  new Notification('RalphFlow — ' + (n.loop || 'Notification'), { body: msg });
}

export async function fetchDecisions() {
  try {
    const data = await fetchJson('/api/decisions');
    state.decisionsList = Array.isArray(data) ? data : [];
    actions.renderSidebar();
    actions.renderContent();
  } catch { /* ignore */ }
}

export async function dismissDecision(id) {
  try {
    await fetch(`/api/decision/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.decisionsList = state.decisionsList.filter(d => d.id !== id);
    actions.renderSidebar();
    actions.renderContent();
  } catch { /* ignore */ }
}

export function showBrowserDecisionNotification(d) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return;
  new Notification('RalphFlow — Decision: ' + (d.item || d.loop), {
    body: d.decision + (d.reasoning ? ' — ' + d.reasoning : ''),
  });
}

export function renderDecisionGroups(decisions) {
  // Group by item (STORY-N, TASK-N)
  const byItem = {};
  for (const d of decisions) {
    const key = d.item || 'Other';
    if (!byItem[key]) byItem[key] = [];
    byItem[key].push(d);
  }

  let html = '';
  for (const [item, itemDecisions] of Object.entries(byItem)) {
    const groupId = 'dg-' + item.replace(/[^a-zA-Z0-9-]/g, '_');
    html += `<div class="decision-group">
      <div class="decision-group-header" data-decision-group="${esc(groupId)}">
        <span class="group-chevron expanded">&#9654;</span>
        <span class="group-label">${esc(item)}</span>
        <span class="group-count">${itemDecisions.length}</span>
      </div>
      <div class="decision-group-body" id="${esc(groupId)}">`;

    for (const d of itemDecisions) {
      const time = new Date(d.timestamp).toLocaleTimeString();
      html += `<div class="decision-card" data-decision-id="${esc(d.id)}">
        <div class="decision-card-top">
          <span class="decision-time">${esc(time)}</span>
          <span class="decision-agent">${esc(d.agent)}</span>
          <button class="decision-dismiss" data-dismiss-decision-id="${esc(d.id)}">&times;</button>
        </div>
        <div class="decision-summary">${esc(d.decision)}</div>
        ${d.reasoning ? '<div class="decision-reasoning">' + esc(d.reasoning) + '</div>' : ''}
      </div>`;
    }
    html += '</div></div>';
  }
  return html;
}

export function initAudioContext() {
  if (state.audioCtxInitialized) return;
  state.audioCtxInitialized = true;
  try {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    // Silent fail — audio is best-effort
  }
}

export function playNotificationChime() {
  if (!state.audioCtx) return;
  try {
    const now = state.audioCtx.currentTime;
    // First tone: E5 (659 Hz), 120ms
    const osc1 = state.audioCtx.createOscillator();
    const gain1 = state.audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 659;
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(state.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);
    // Second tone: A5 (880 Hz), 150ms, starts 80ms after first
    const osc2 = state.audioCtx.createOscillator();
    const gain2 = state.audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 880;
    gain2.gain.setValueAtTime(0, now + 0.08);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2);
    gain2.connect(state.audioCtx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.25);
  } catch (e) {
    // Silent fail
  }
}

export function onFirstInteraction() {
  initAudioContext();
  document.removeEventListener('click', onFirstInteraction);
  document.removeEventListener('keydown', onFirstInteraction);
}
