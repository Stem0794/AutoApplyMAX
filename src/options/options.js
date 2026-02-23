/**
 * AutoApplyMAX — Options Page Script
 *
 * Dynamically generates the profile form from the schema,
 * handles saving/loading profile data and settings,
 * and manages import/export and learned mappings.
 */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  buildFormFields();
  loadProfile();
  loadSettings();
  loadMappings();
  loadHistory();
  initEventListeners();
});

// ── Tab Navigation ──────────────────────────────────

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panelId = 'panel-' + tab.dataset.tab;
      document.getElementById(panelId).classList.add('active');

      // Show/hide save button depending on active tab
      const formActions = document.getElementById('form-actions');
      const isDataTab = ['personal', 'professional', 'additional'].includes(tab.dataset.tab);
      formActions.style.display = isDataTab ? 'flex' : 'none';

      // Refresh data when switching to relevant tabs
      if (tab.dataset.tab === 'mappings') {
        loadMappings();
      }
      if (tab.dataset.tab === 'history') {
        loadHistory();
      }
    });
  });
}

// ── Build Form Fields ────────────────────────────────

function buildFormFields() {
  const groups = { personal: [], professional: [], additional: [] };

  AAM.PROFILE_FIELDS.forEach(field => {
    if (groups[field.group]) {
      groups[field.group].push(field);
    }
  });

  for (const [group, fields] of Object.entries(groups)) {
    const container = document.getElementById('fields-' + group);
    if (!container) continue;

    fields.forEach(field => {
      const div = document.createElement('div');
      div.className = 'form-group';
      if (field.type === 'textarea') {
        div.classList.add('full-width');
      }

      const label = document.createElement('label');
      label.setAttribute('for', 'field-' + field.key);
      label.textContent = field.label;

      let input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 4;
      } else {
        input = document.createElement('input');
        input.type = field.type || 'text';
      }
      input.id = 'field-' + field.key;
      input.name = field.key;
      input.placeholder = field.label + '...';

      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
    });
  }
}

// ── Load / Save Profile ─────────────────────────────

async function loadProfile() {
  try {
    const profile = await AAM.Storage.getProfile();
    for (const [key, value] of Object.entries(profile)) {
      const input = document.querySelector(`[name="${key}"]`);
      if (input && value) {
        input.value = value;
      }
    }
  } catch (err) {
    showStatus('Failed to load profile: ' + err.message, 'error');
  }
}

async function saveProfile() {
  const profile = {};
  AAM.PROFILE_FIELDS.forEach(field => {
    const input = document.querySelector(`[name="${field.key}"]`);
    if (input) {
      const val = input.value.trim();
      if (val) {
        profile[field.key] = val;
      }
    }
  });

  // Auto-generate fullName if not set
  if (!profile.fullName && profile.firstName && profile.lastName) {
    profile.fullName = profile.firstName + ' ' + profile.lastName;
    const fullNameInput = document.querySelector('[name="fullName"]');
    if (fullNameInput) fullNameInput.value = profile.fullName;
  }

  try {
    await AAM.Storage.saveProfile(profile);
    showStatus('Profile saved successfully!', 'success');
  } catch (err) {
    showStatus('Failed to save profile: ' + err.message, 'error');
  }
}

// ── Load / Save Settings ────────────────────────────

async function loadSettings() {
  try {
    const settings = await AAM.Storage.getSettings();
    document.getElementById('setting-highlight').checked = settings.highlightFilled !== false;
    document.getElementById('setting-overlay').checked = settings.showOverlay !== false;
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
}

async function saveSettings() {
  const settings = {
    highlightFilled: document.getElementById('setting-highlight').checked,
    showOverlay: document.getElementById('setting-overlay').checked,
  };
  try {
    await AAM.Storage.saveSettings(settings);
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

// ── Learned Mappings ────────────────────────────────

async function loadMappings() {
  const container = document.getElementById('mappings-content');
  try {
    const mappings = await AAM.Storage.getMappings();
    const sites = Object.keys(mappings);

    if (sites.length === 0) {
      container.innerHTML = '<p class="empty-state">No learned mappings yet. Mappings are created automatically when you manually fill fields on job application pages.</p>';
      return;
    }

    let html = '';
    for (const site of sites) {
      const fields = mappings[site];
      const entries = Object.entries(fields);
      if (entries.length === 0) continue;

      html += `<div class="mapping-site">`;
      html += `<div class="mapping-site-name">${escapeHtml(site)}</div>`;
      html += `<table class="mapping-table"><thead><tr><th>Selector</th><th>Profile Field</th></tr></thead><tbody>`;

      for (const [selector, profileKey] of entries) {
        const fieldDef = AAM.PROFILE_MAP[profileKey];
        const label = fieldDef ? fieldDef.label : profileKey;
        html += `<tr><td><code>${escapeHtml(selector)}</code></td><td>${escapeHtml(label)}</td></tr>`;
      }

      html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Error loading mappings: ${escapeHtml(err.message)}</p>`;
  }
}

// ── Application History ─────────────────────────────

/** @type {Array} cached full list of applied jobs */
let _allJobs = [];

async function loadHistory() {
  const container = document.getElementById('history-content');
  const countEl = document.getElementById('history-count');
  try {
    _allJobs = await AAM.Storage.getAppliedJobs();
    countEl.textContent = _allJobs.length + ' application' + (_allJobs.length !== 1 ? 's' : '');
    renderHistoryTable(_allJobs);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Error loading history: ${escapeHtml(err.message)}</p>`;
    countEl.textContent = '';
  }
}

function renderHistoryTable(jobs) {
  const container = document.getElementById('history-content');

  if (jobs.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">&#128203;</div>
        <p>No applications logged yet.<br>Applications are recorded automatically when you submit job forms.</p>
      </div>`;
    return;
  }

  let html = `
    <table class="history-table">
      <thead>
        <tr>
          <th class="col-date">Date</th>
          <th class="col-company">Company</th>
          <th class="col-title">Job Title</th>
          <th class="col-ats">ATS</th>
          <th class="col-link">Link</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>`;

  jobs.forEach((job, idx) => {
    const date = formatDate(job.timestamp);
    const company = escapeHtml(job.company || 'Unknown');
    const title = escapeHtml(job.jobTitle || 'Unknown');
    const ats = escapeHtml(job.ats || '');
    const url = escapeHtml(job.url || '');
    // We need to find the real index in _allJobs (in case of filtering)
    const realIdx = _allJobs.indexOf(job);

    html += `
      <tr>
        <td class="col-date">${date}</td>
        <td class="col-company">${company}</td>
        <td class="col-title">${title}</td>
        <td class="col-ats"><span class="ats-badge">${ats}</span></td>
        <td class="col-link">${url ? `<a href="${url}" target="_blank" rel="noopener" class="history-link">Open</a>` : '-'}</td>
        <td class="col-actions"><button class="btn-delete-row" data-idx="${realIdx}" title="Remove entry">&times;</button></td>
      </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;

  // Attach delete handlers
  container.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (isNaN(idx)) return;
      await AAM.Storage.deleteAppliedJob(idx);
      loadHistory();
    });
  });
}

function filterHistory(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderHistoryTable(_allJobs);
    return;
  }
  const filtered = _allJobs.filter(j =>
    (j.jobTitle || '').toLowerCase().includes(q) ||
    (j.company || '').toLowerCase().includes(q) ||
    (j.ats || '').toLowerCase().includes(q)
  );
  renderHistoryTable(filtered);
}

function exportHistoryCSV() {
  if (_allJobs.length === 0) {
    showStatus('No applications to export.', 'error');
    return;
  }

  const header = ['Date', 'Company', 'Job Title', 'ATS', 'URL'];
  const rows = _allJobs.map(j => [
    j.timestamp || '',
    csvEscape(j.company || ''),
    csvEscape(j.jobTitle || ''),
    csvEscape(j.ats || ''),
    csvEscape(j.url || ''),
  ]);

  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'autoapplymax-applications-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Application history exported to CSV!', 'success');
}

function csvEscape(val) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
           ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

// ── Import / Export ─────────────────────────────────

async function exportProfile() {
  try {
    const profile = await AAM.Storage.getProfile();
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autoapplymax-profile.json';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Profile exported!', 'success');
  } catch (err) {
    showStatus('Export failed: ' + err.message, 'error');
  }
}

function importProfile() {
  document.getElementById('import-file').click();
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const profile = JSON.parse(text);

    if (typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error('Invalid profile format');
    }

    await AAM.Storage.saveProfile(profile);
    await loadProfile();
    showStatus('Profile imported successfully!', 'success');
  } catch (err) {
    showStatus('Import failed: ' + err.message, 'error');
  }

  // Reset file input
  e.target.value = '';
}

// ── Event Listeners ─────────────────────────────────

function initEventListeners() {
  // Save profile on form submit
  document.getElementById('profile-form').addEventListener('submit', e => {
    e.preventDefault();
    saveProfile();
  });

  // Export/Import buttons
  document.getElementById('btn-export').addEventListener('click', exportProfile);
  document.getElementById('btn-import').addEventListener('click', importProfile);
  document.getElementById('import-file').addEventListener('change', handleImportFile);

  // Settings toggles — auto-save
  document.getElementById('setting-highlight').addEventListener('change', saveSettings);
  document.getElementById('setting-overlay').addEventListener('change', saveSettings);

  // History: search filter
  document.getElementById('history-search').addEventListener('input', e => {
    filterHistory(e.target.value);
  });

  // History: export CSV
  document.getElementById('btn-export-csv').addEventListener('click', exportHistoryCSV);

  // History: clear all
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your entire application history?')) {
      try {
        await AAM.Storage.clearAppliedJobs();
        loadHistory();
        showStatus('Application history cleared.', 'success');
      } catch (err) {
        showStatus('Failed to clear history: ' + err.message, 'error');
      }
    }
  });

  // Clear mappings
  document.getElementById('btn-clear-mappings').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all learned mappings?')) {
      try {
        await AAM.Storage.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: {} });
        loadMappings();
        showStatus('All mappings cleared.', 'success');
      } catch (err) {
        showStatus('Failed to clear mappings: ' + err.message, 'error');
      }
    }
  });

  // Status bar close
  document.getElementById('status-close').addEventListener('click', hideStatus);
}

// ── Utilities ───────────────────────────────────────

function showStatus(message, type) {
  const bar = document.getElementById('status-bar');
  const text = document.getElementById('status-text');
  bar.className = 'status-bar ' + type;
  text.textContent = message;

  clearTimeout(window._statusTimer);
  window._statusTimer = setTimeout(hideStatus, 4000);
}

function hideStatus() {
  document.getElementById('status-bar').classList.add('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
