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
      div.appendChild(label); // Always add label first

      let input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 4;
      } else if (field.type === 'file') {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'field-' + field.key;
        input.name = field.key;

        const fileNameSpan = document.createElement('span');
        fileNameSpan.id = `file-name-${field.key}`;
        fileNameSpan.className = 'file-name-display';
        div.appendChild(input);
        div.appendChild(fileNameSpan);

        // Hidden input for storing filename
        const hiddenFileNameInput = document.createElement('input');
        hiddenFileNameInput.type = 'hidden';
        hiddenFileNameInput.id = `field-${field.key}Name`;
        hiddenFileNameInput.name = `${field.key}Name`;
        div.appendChild(hiddenFileNameInput);

        // Hidden textarea for storing Base64 content
        const hiddenFileContentInput = document.createElement('textarea');
        hiddenFileContentInput.style.display = 'none';
        hiddenFileContentInput.id = `field-${field.key}Content`;
        hiddenFileContentInput.name = `${field.key}Content`;
        div.appendChild(hiddenFileContentInput);

        // Don't add default placeholder for file input
        input.placeholder = '';
      } else {
        input = document.createElement('input');
        input.type = field.type || 'text';
        input.id = 'field-' + field.key;
        input.name = field.key;
        input.placeholder = field.label + '...';
      }

      // For 'file' type, input is already added. For others, add here.
      if (field.type !== 'file') {
        div.appendChild(input);
      }
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
      // Also get the hidden fields for file name and content
      const hiddenInput = document.querySelector(`[name="${key}"]`);
      if (input) {
        // For regular inputs, or the file input itself
        if (value) {
          input.value = value;
        }
      } else if (hiddenInput) {
        // For hidden inputs (like resumeFileName, resumeFileContent)
        if (value) {
          hiddenInput.value = value;
        }
      }

      // Special handling for file inputs to display file name
      // This is for the span that visually shows the filename, not the hidden input
      const fieldDef = AAM.PROFILE_MAP[key.replace('Name', '').replace('Content', '')]; // Adjust key to get original fieldDef
      if (fieldDef && fieldDef.type === 'file' && key.endsWith('Name')) {
        const fileKey = key.replace('Name', ''); // e.g., resumeFileName -> resumeFile
        const fileNameSpan = document.getElementById(`file-name-${fileKey}`);
        if (fileNameSpan) {
          fileNameSpan.textContent = value;
        }
      }

    }
  } catch (err) {
    showStatus('Failed to load profile: ' + err.message, 'error');
  }
}

async function saveProfile() {
  const profile = {};
  const form = document.getElementById('profile-form'); // Get the form element once

  for (const fieldDef of AAM.PROFILE_FIELDS) {
    if (fieldDef.type === 'file') {
      const fileInput = form.querySelector(`[name="${fieldDef.key}"]`); // The <input type="file">
      const hiddenFileNameInput = form.querySelector(`[name="${fieldDef.key}Name"]`);
      const hiddenFileContentInput = form.querySelector(`[name="${fieldDef.key}Content"]`);

      if (fileInput && fileInput.files.length > 0) {
        // New file selected
        const file = fileInput.files[0];
        profile[fieldDef.key + 'Name'] = file.name;
        profile[fieldDef.key + 'Content'] = await fileToBase64(file);
      } else {
        // No new file selected, retain existing if any
        if (hiddenFileNameInput && hiddenFileNameInput.value) {
          profile[fieldDef.key + 'Name'] = hiddenFileNameInput.value;
        }
        if (hiddenFileContentInput && hiddenFileContentInput.value) {
          profile[fieldDef.key + 'Content'] = hiddenFileContentInput.value;
        }
      }
    } else {
      const input = form.querySelector(`[name="${fieldDef.key}"]`);
      if (input) {
        const val = input.value.trim();
        if (val) {
          profile[fieldDef.key] = val;
        }
      }
    }
  }

  // Auto-generate fullName if not set
  if (!profile.fullName && profile.firstName && profile.lastName) {
    profile.fullName = profile.firstName + ' ' + profile.lastName;
    const fullNameInput = form.querySelector('[name="fullName"]'); // Use form to query
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
    document.getElementById('setting-proactive').checked = settings.showProactiveTrigger !== false;
    document.getElementById('setting-supabase-url').value = settings.supabaseUrl || '';
    document.getElementById('setting-supabase-key').value = settings.supabaseKey || '';

    // Update constants with loaded values
    if (settings.supabaseUrl) AAM.CONSTANTS.SUPABASE_URL = settings.supabaseUrl;
    if (settings.supabaseKey) AAM.CONSTANTS.SUPABASE_KEY = settings.supabaseKey;
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
}

async function saveSettings() {
  const settings = {
    highlightFilled: document.getElementById('setting-highlight').checked,
    showOverlay: document.getElementById('setting-overlay').checked,
    showProactiveTrigger: document.getElementById('setting-proactive').checked,
    supabaseUrl: document.getElementById('setting-supabase-url').value.trim(),
    supabaseKey: document.getElementById('setting-supabase-key').value.trim(),
  };

  // Update constants immediately
  AAM.CONSTANTS.SUPABASE_URL = settings.supabaseUrl;
  AAM.CONSTANTS.SUPABASE_KEY = settings.supabaseKey;

  try {
    await AAM.Storage.saveSettings(settings);
    showStatus('Settings saved!', 'success');
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

async function syncLocalToSupabase() {
  const btn = document.getElementById('btn-sync-mappings');
  const originalText = btn.textContent;

  try {
    btn.disabled = true;
    btn.textContent = 'Syncing...';

    // Ensure config is loaded
    await AAM.Storage._ensureSupabaseConfig();

    const mappings = await AAM.Storage.getMappings();
    const bulkData = [];

    for (const [siteKey, siteFields] of Object.entries(mappings)) {
      for (const [selector, profileKey] of Object.entries(siteFields)) {
        bulkData.push({ siteKey, selector, profileKey });
      }
    }

    if (bulkData.length === 0) {
      showStatus('No local mappings to sync.', 'info');
      return;
    }

    const result = await AAM.Supabase.saveMappingsBulk(bulkData);
    if (result) {
      showStatus(`Successfully synced ${bulkData.length} mappings to the cloud!`, 'success');
    } else {
      throw new Error('Supabase request returned no result.');
    }
  } catch (err) {
    showStatus('Sync failed: ' + err.message, 'error');
    console.error('[AutoApplyMAX] Sync error:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
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
  document.getElementById('setting-proactive').addEventListener('change', saveSettings);
  document.getElementById('setting-supabase-url').addEventListener('change', saveSettings);
  document.getElementById('setting-supabase-key').addEventListener('change', saveSettings);

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

  // Sync mappings
  const syncBtn = document.getElementById('btn-sync-mappings');
  if (syncBtn) {
    syncBtn.addEventListener('click', syncLocalToSupabase);
  }

  // Status bar close
  document.getElementById('status-close').addEventListener('click', hideStatus);
  // File input change listener for resume file to update displayed name
  const resumeFileInput = document.getElementById('field-resumeFile');
  if (resumeFileInput) {
    resumeFileInput.addEventListener('change', (e) => {
      const fileNameSpan = document.getElementById('file-name-resumeFile');
      if (fileNameSpan) {
        fileNameSpan.textContent = e.target.files.length > 0 ? e.target.files[0].name : 'No file selected';
      }
    });
  }
}

// ── Utilities ───────────────────────────────────────

/**
 * Converts a File object to a Base64 string.
 * @param {File} file
 * @returns {Promise<String>} Base64 encoded string
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

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
