// Shared utility functions used across dashboard modules.

export function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

export function renderMarkdown(md) {
  let html = '';
  const lines = md.split('\n');
  let inTable = false;
  let tableHtml = '';
  let inCodeBlock = false;
  let codeBlockContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre class="md-code-block"><code>${esc(codeBlockContent)}</code></pre>`;
        codeBlockContent = '';
        inCodeBlock = false;
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</tbody></table>';
          html += tableHtml;
          tableHtml = '';
        }
        inCodeBlock = true;
        codeBlockContent = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? '\n' : '') + line;
      continue;
    }

    // Table detection
    if (line.match(/^\|.+\|$/)) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table>';
        // Header row
        const cells = line.split('|').filter(Boolean).map(c => c.trim());
        tableHtml += '<thead><tr>' + cells.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
        continue;
      }
      // Separator row
      if (line.match(/^\|[\s\-|]+\|$/)) continue;
      // Data row
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      tableHtml += '<tr>' + cells.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>';
      continue;
    } else if (inTable) {
      inTable = false;
      tableHtml += '</tbody></table>';
      html += tableHtml;
      tableHtml = '';
    }

    // Headers
    if (line.startsWith('### ')) { html += `<h3>${esc(line.slice(4))}</h3>`; continue; }
    if (line.startsWith('## ')) { html += `<h2>${esc(line.slice(3))}</h2>`; continue; }
    if (line.startsWith('# ')) { html += `<h1>${esc(line.slice(2))}</h1>`; continue; }

    // Checkboxes
    if (line.match(/^- \[x\]/i)) {
      html += `<div class="cb-done">${esc(line)}</div>`;
      continue;
    }
    if (line.match(/^- \[ \]/)) {
      html += `<div class="cb-todo">${esc(line)}</div>`;
      continue;
    }

    // Regular lines
    html += line.trim() === '' ? '<br>' : `<div>${esc(line)}</div>`;
  }

  if (inTable) {
    tableHtml += '</tbody></table>';
    html += tableHtml;
  }

  if (inCodeBlock) {
    html += `<pre class="md-code-block"><code>${esc(codeBlockContent)}</code></pre>`;
  }

  return html;
}

export function calculatePipelineProgress(loops) {
  const perLoop = [];
  let aggCompleted = 0;
  let aggTotal = 0;
  for (const loop of (loops || [])) {
    const st = loop.status || {};
    const completed = st.completed || 0;
    const total = st.total || 0;
    const fraction = total > 0 ? completed / total : 0;
    perLoop.push({ key: loop.key, completed, total, fraction });
    if (total > 0) {
      aggCompleted += completed;
      aggTotal += total;
    }
  }
  const percentage = aggTotal > 0 ? Math.round(aggCompleted / aggTotal * 100) : 0;
  return { perLoop, completed: aggCompleted, total: aggTotal, percentage };
}

export function formatModelName(model) {
  if (!model) return null;
  return model.replace(/^claude-/, '');
}

export function getLoopStatusClass(loop) {
  if (!loop.status) return 'pending';
  const st = loop.status;
  if (st.total > 0 && st.completed === st.total) return 'complete';
  if (st.agents && st.agents.length > 0) return 'running';
  if (st.total > 0 && st.completed > 0 && st.completed < st.total) return 'running';
  if (st.stage && st.stage !== '—' && st.stage !== 'idle') return 'running';
  return 'pending';
}

export function extractNotifMessage(payload) {
  if (!payload) return 'Attention needed';
  if (typeof payload === 'string') return payload;
  if (payload.message) return payload.message;
  if (payload.type) return payload.type;
  if (payload.event) return payload.event;
  return 'Attention needed';
}
