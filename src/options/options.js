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
  loadAccount();
  initEventListeners();
});

let _currentProfile = {};
let _authState = { signedIn: false };

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
      if (tab.dataset.tab === 'account') {
        loadAccount();
      }
      if (tab.dataset.tab === 'admin') {
        loadAdmin();
      }
      if (tab.dataset.tab === 'platforms') {
        renderPlatforms();
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
    _currentProfile = profile;
    for (const [key, value] of Object.entries(profile)) {
      const input = document.querySelector(`[name="${key}"]`);
      if (input) {
        // For regular inputs, or the file input itself
        if (value) {
          input.value = value;
        }
      }
    }
    const resumeName = document.getElementById('file-name-resumeFile');
    if (resumeName) resumeName.textContent = profile.resumeAsset?.name || 'No file selected';
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
      if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        validateResume(file);
        const response = await chrome.runtime.sendMessage({
          type: AAM.CONSTANTS.MSG.SAVE_RESUME,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          bytesBase64: await fileToBase64(file),
        });
        if (response?.error) throw new Error(response.error);
        profile.resumeAsset = response;
      } else if (_currentProfile.resumeAsset) {
        profile.resumeAsset = _currentProfile.resumeAsset;
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
    _currentProfile = profile;
    const msg = _authState.signedIn
      ? 'Profile saved and synced to your account!'
      : 'Profile saved successfully!';
    showStatus(msg, 'success');
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
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
}

async function saveSettings() {
  const settings = {
    highlightFilled: document.getElementById('setting-highlight').checked,
    showOverlay: document.getElementById('setting-overlay').checked,
    showProactiveTrigger: document.getElementById('setting-proactive').checked,
  };

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
      container.innerHTML =
        '<p class="empty-state">No learned mappings yet. Mappings are created automatically when you manually fill fields on job application pages.</p>';
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
let _historyPage = 1;

async function loadHistory() {
  const container = document.getElementById('history-content');
  const countEl = document.getElementById('history-count');
  try {
    _allJobs = await AAM.Storage.getAppliedJobs();
    countEl.textContent = _allJobs.length + ' application' + (_allJobs.length !== 1 ? 's' : '');
    _historyPage = 1;
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
        <p>No submissions logged yet.<br>Trusted form submissions appear here as pending.</p>
      </div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(jobs.length / AAM.CONSTANTS.HISTORY_PAGE_SIZE));
  _historyPage = Math.min(_historyPage, totalPages);
  const start = (_historyPage - 1) * AAM.CONSTANTS.HISTORY_PAGE_SIZE;
  const pageJobs = jobs.slice(start, start + AAM.CONSTANTS.HISTORY_PAGE_SIZE);
  let html = `
    <table class="history-table">
      <thead>
        <tr>
          <th class="col-date">Date</th>
          <th class="col-company">Company</th>
          <th class="col-title">Job Title</th>
          <th class="col-ats">ATS</th>
          <th>Status</th>
          <th class="col-link">Link</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>`;

  pageJobs.forEach(job => {
    const date = formatDate(job.timestamp);
    const company = escapeHtml(job.company || 'Unknown');
    const title = escapeHtml(job.jobTitle || 'Unknown');
    const ats = escapeHtml(job.ats || '');
    const safeUrl = toSafeHttpUrl(job.url);
    const url = escapeHtml(safeUrl);
    const status = job.status === 'confirmed' ? 'Confirmed' : 'Pending';
    // We need to find the real index in _allJobs (in case of filtering)
    const realIdx = _allJobs.indexOf(job);

    html += `
      <tr>
        <td class="col-date">${date}</td>
        <td class="col-company">${company}</td>
        <td class="col-title">${title}</td>
        <td class="col-ats"><span class="ats-badge">${ats}</span></td>
        <td>${status}${job.status === 'confirmed' ? '' : ` <button class="btn-confirm-row" data-idx="${realIdx}">Confirm</button>`}</td>
        <td class="col-link">${url ? `<a href="${url}" target="_blank" rel="noopener" class="history-link">Open</a>` : '-'}</td>
        <td class="col-actions"><button class="btn-delete-row" data-idx="${realIdx}" title="Remove entry">&times;</button></td>
      </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
  renderHistoryPagination(totalPages, jobs);

  // Attach delete handlers
  container.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (isNaN(idx)) return;
      await AAM.Storage.deleteAppliedJob(idx);
      loadHistory();
    });
  });
  container.querySelectorAll('.btn-confirm-row').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (isNaN(idx)) return;
      await AAM.Storage.confirmAppliedJob(idx);
      loadHistory();
    });
  });
}

function renderHistoryPagination(totalPages, jobs) {
  const pagination = document.getElementById('history-pagination');
  if (!pagination || totalPages <= 1) {
    if (pagination) pagination.textContent = '';
    return;
  }
  pagination.textContent = '';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'btn btn-outline';
  previous.textContent = 'Previous';
  previous.disabled = _historyPage === 1;
  previous.addEventListener('click', () => {
    _historyPage--;
    renderHistoryTable(jobs);
  });
  const label = document.createElement('span');
  label.textContent = `Page ${_historyPage} of ${totalPages}`;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-outline';
  next.textContent = 'Next';
  next.disabled = _historyPage === totalPages;
  next.addEventListener('click', () => {
    _historyPage++;
    renderHistoryTable(jobs);
  });
  pagination.append(previous, label, next);
}

function filterHistory(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderHistoryTable(_allJobs);
    return;
  }
  const filtered = _allJobs.filter(
    j =>
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
  let safe = String(val);
  if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return (
      d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
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
    if (file.size > AAM.CONSTANTS.MAX_IMPORT_BYTES) throw new Error('Profile file exceeds 1 MB');
    const text = await file.text();
    const profile = JSON.parse(text);

    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
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
        await AAM.Storage.clearMappings();
        loadMappings();
        showStatus('All mappings cleared.', 'success');
      } catch (err) {
        showStatus('Failed to clear mappings: ' + err.message, 'error');
      }
    }
  });

  // Account tab
  document.getElementById('btn-sign-in').addEventListener('click', handleSignIn);
  document.getElementById('account-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignIn();
  });
  document.getElementById('btn-sign-out').addEventListener('click', handleSignOut);

  // Admin tab
  document.getElementById('btn-refresh-mappings').addEventListener('click', loadAdminMappings);
  document.getElementById('btn-refresh-requests').addEventListener('click', loadAdminRequests);
  document.getElementById('btn-export-schema').addEventListener('click', exportFieldSchema);
  document.getElementById('btn-copy-snippet').addEventListener('click', () => {
    const code = document.getElementById('admin-snippet-code').textContent;
    navigator.clipboard.writeText(code).then(
      () => showStatus('Field definition copied to clipboard.', 'success'),
      () => showStatus('Copy failed — select and copy manually.', 'error')
    );
  });

  // Status bar close
  document.getElementById('status-close').addEventListener('click', hideStatus);
  // File input change listener for resume file to update displayed name
  const resumeFileInput = document.getElementById('field-resumeFile');
  if (resumeFileInput) {
    resumeFileInput.addEventListener('change', e => {
      const fileNameSpan = document.getElementById('file-name-resumeFile');
      if (fileNameSpan) {
        fileNameSpan.textContent =
          e.target.files.length > 0 ? e.target.files[0].name : 'No file selected';
      }
    });
  }
}

// ── Account / Auth ────────────────────────────────────

async function loadAccount() {
  try {
    const state = await chrome.runtime.sendMessage({ type: AAM.CONSTANTS.MSG.GET_AUTH_STATE });
    if (state?.error) throw new Error(state.error);
    _authState = state || { signedIn: false };
    renderAccountState(_authState);
  } catch (err) {
    console.warn('Failed to load auth state:', err);
  }
}

function renderAccountState(state) {
  const signedOut = document.getElementById('account-signed-out');
  const signedIn = document.getElementById('account-signed-in');
  if (!signedOut || !signedIn) return;

  const hint = document.getElementById('save-hint');

  if (state?.signedIn) {
    signedOut.classList.add('hidden');
    signedIn.classList.remove('hidden');
    document.getElementById('account-email-display').textContent = state.email || '';
    if (hint) hint.textContent = 'Profile is saved locally and synced to your account.';
  } else {
    signedOut.classList.remove('hidden');
    signedIn.classList.add('hidden');
    if (hint) hint.textContent = 'Profile is stored locally in your browser.';
  }

  // Reveal the Admin tab only for reviewers.
  const adminTab = document.getElementById('tab-admin');
  if (adminTab) adminTab.hidden = !state?.isReviewer;
}

async function handleSignIn() {
  const email = document.getElementById('account-email').value.trim();
  const password = document.getElementById('account-password').value;
  const btn = document.getElementById('btn-sign-in');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const result = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.SIGN_IN,
      email,
      password,
    });
    if (result?.error) throw new Error(result.error);
    _authState = { signedIn: true, email: result.email };
    document.getElementById('account-password').value = '';
    showStatus('Signed in! Your profile is now syncing.', 'success');
    renderAccountState(_authState);
    await loadProfile();
  } catch (err) {
    showStatus(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function handleSignOut() {
  const btn = document.getElementById('btn-sign-out');
  btn.disabled = true;
  btn.textContent = 'Signing out...';

  try {
    await chrome.runtime.sendMessage({ type: AAM.CONSTANTS.MSG.SIGN_OUT });
    _authState = { signedIn: false };
    document.getElementById('account-email').value = '';
    showStatus('Signed out.', 'success');
    renderAccountState(_authState);
  } catch (err) {
    showStatus('Sign out failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign out';
  }
}

// ── Admin: community review ──────────────────────────

function loadAdmin() {
  loadAdminMappings();
  loadAdminRequests();
}

function parseSignatureLabel(signature) {
  try {
    const sig = JSON.parse(signature);
    return { label: sig.label || '', name: sig.name || '', tag: sig.tag || 'input' };
  } catch {
    return { label: '', name: '', tag: 'input' };
  }
}

async function loadAdminMappings() {
  const container = document.getElementById('admin-mappings-content');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const groups = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.ADMIN_LIST_PENDING_MAPPINGS,
    });
    if (groups?.error) throw new Error(groups.error);
    renderAdminMappings(groups || []);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${escapeText(err.message)}</p>`;
  }
}

function renderAdminMappings(groups) {
  const container = document.getElementById('admin-mappings-content');
  if (!groups.length) {
    container.innerHTML = '<p class="empty-state">No pending mappings. All caught up 🎉</p>';
    return;
  }
  container.innerHTML = '';
  for (const g of groups) {
    const sig = parseSignatureLabel(g.fieldSignature);
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-main">
        <div class="admin-row-title">
          ${escapeText(sig.label || sig.name || '(no label)')} → ${escapeText(g.profileKey)}
          <span class="admin-count-badge">${g.submitterCount} user${g.submitterCount > 1 ? 's' : ''}</span>
        </div>
        <div class="admin-row-meta">
          site <code>${escapeText(g.siteKey)}</code> · ${escapeText(sig.tag)}${sig.name ? ` <code>${escapeText(sig.name)}</code>` : ''}
        </div>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="btn btn-approve">Approve</button>
        <button type="button" class="btn btn-danger">Reject</button>
      </div>
    `;
    row
      .querySelector('.btn-approve')
      .addEventListener('click', () => reviewMapping(g.submissionId, 'approved', row));
    row.querySelector('.btn-danger').addEventListener('click', () => {
      const note = prompt('Reason for rejecting this mapping?');
      if (note === null) return;
      reviewMapping(g.submissionId, 'rejected', row, note);
    });
    container.appendChild(row);
  }
}

async function reviewMapping(submissionId, decision, row, note = '') {
  const buttons = row.querySelectorAll('button');
  buttons.forEach(b => (b.disabled = true));
  try {
    const res = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.ADMIN_REVIEW_MAPPING,
      submissionId,
      decision,
      note,
    });
    if (res?.error) throw new Error(res.error);
    row.style.opacity = '0.5';
    showStatus(
      decision === 'approved' ? 'Mapping approved and live.' : 'Mapping rejected.',
      'success'
    );
    setTimeout(loadAdminMappings, 600);
  } catch (err) {
    buttons.forEach(b => (b.disabled = false));
    showStatus(err.message, 'error');
  }
}

async function loadAdminRequests() {
  const container = document.getElementById('admin-requests-content');
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const rows = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.ADMIN_LIST_REQUESTS,
    });
    if (rows?.error) throw new Error(rows.error);
    renderAdminRequests(rows || []);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${escapeText(err.message)}</p>`;
  }
}

function renderAdminRequests(rows) {
  const container = document.getElementById('admin-requests-content');
  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">No field requests yet.</p>';
    return;
  }
  container.innerHTML = '';
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="admin-row-main">
        <div class="admin-row-title">
          ${escapeText(r.suggested_label)}
          <span class="admin-status-badge admin-status-${escapeText(r.status)}">${escapeText(r.status)}</span>
        </div>
        <div class="admin-row-meta">
          ${r.note ? escapeText(r.note) + ' · ' : ''}${r.host ? `<code>${escapeText(r.host)}</code>` : 'no host'}
        </div>
      </div>
      <div class="admin-row-actions">
        <button type="button" class="btn btn-approve">Promote</button>
        <button type="button" class="btn btn-outline">Done</button>
        <button type="button" class="btn btn-danger">Decline</button>
      </div>
    `;
    const [promoteBtn, doneBtn, declineBtn] = row.querySelectorAll('button');
    promoteBtn.addEventListener('click', () => promoteRequest(r));
    doneBtn.addEventListener('click', () => setRequestStatus(r.id, 'done', row));
    declineBtn.addEventListener('click', () => setRequestStatus(r.id, 'declined', row));
    container.appendChild(row);
  }
}

async function setRequestStatus(id, status, row) {
  try {
    const res = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.ADMIN_SET_REQUEST_STATUS,
      id,
      status,
    });
    if (res?.error) throw new Error(res.error);
    showStatus(`Request marked ${status}.`, 'success');
    if (row) setTimeout(loadAdminRequests, 400);
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

/** Generate a ready-to-paste PROFILE_FIELDS entry from a request label. */
function buildFieldSnippet(label) {
  const clean = label.trim().replace(/\s+/g, ' ');
  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean);
  const key = words.length
    ? words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('')
    : 'newField';
  const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const keywords = [...new Set([clean.toLowerCase(), ...words])].map(k => `'${esc(k)}'`);
  const aliasSrc = words.length ? words.join('[\\\\s_-]?') : esc(key);
  return `  {
    key: '${esc(key)}',
    label: '${esc(clean)}',
    type: 'text',
    group: 'additional',
    keywords: [${keywords.join(', ')}],
    aliases: [/${aliasSrc}/i],
  },`;
}

/**
 * Export the current PROFILE_FIELDS schema plus open/planned field requests as
 * a single JSON document — hand it to an AI or dev to implement new fields in a
 * release. Regex aliases are serialised to their source strings.
 */
async function exportFieldSchema() {
  let requests = [];
  try {
    const rows = await chrome.runtime.sendMessage({ type: AAM.CONSTANTS.MSG.ADMIN_LIST_REQUESTS });
    if (Array.isArray(rows)) {
      requests = rows
        .filter(r => r.status === 'open' || r.status === 'planned')
        .map(r => ({
          suggestedLabel: r.suggested_label,
          note: r.note || null,
          host: r.host || null,
          status: r.status,
        }));
    }
  } catch {
    // Export the schema even if requests can't be loaded.
  }

  const currentFields = AAM.PROFILE_FIELDS.map(f => ({
    key: f.key,
    label: f.label,
    type: f.type,
    group: f.group,
    keywords: f.keywords,
    aliases: (f.aliases || []).map(re => re.source),
    sensitivity: f.sensitivity,
    cloudMappable: f.cloudMappable,
  }));

  const doc = {
    exportedAt: new Date().toISOString(),
    schemaVersion: AAM.CONSTANTS.SCHEMA_VERSION,
    note:
      'currentFields = the live AAM.PROFILE_FIELDS schema (aliases are regex source strings). ' +
      'requestedFields = user-submitted fields the app does not have yet. ' +
      'To add a field, append an entry to AAM.PROFILE_FIELDS in src/shared/profile-schema.js ' +
      '(aliases must be real /regex/ literals) and ship an extension update.',
    currentFields,
    requestedFields: requests,
  };

  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'autoapplymax-field-schema.json';
  a.click();
  URL.revokeObjectURL(url);
  showStatus(
    `Exported ${currentFields.length} fields and ${requests.length} request(s).`,
    'success'
  );
}

async function promoteRequest(request) {
  const snippet = buildFieldSnippet(request.suggested_label);
  document.getElementById('admin-snippet-code').textContent = snippet;
  document.getElementById('admin-snippet').classList.remove('hidden');
  document.getElementById('admin-snippet').scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Mark the request as planned so it leaves the open queue.
  await setRequestStatus(request.id, 'planned');
  setTimeout(loadAdminRequests, 400);
}

function escapeText(value) {
  const el = document.createElement('div');
  el.textContent = String(value == null ? '' : value);
  return el.innerHTML;
}

// ── Supported Platforms ──────────────────────────────

/**
 * Returns the set of hostnames the manifest auto-injects content scripts into.
 * Used to mark a platform "Live" only when its adapter actually runs in this build.
 */
function getInjectedHostPatterns() {
  try {
    const manifest = chrome.runtime.getManifest();
    const patterns = [];
    for (const cs of manifest.content_scripts || []) {
      for (const match of cs.matches || []) patterns.push(match.toLowerCase());
    }
    return patterns;
  } catch {
    return [];
  }
}

/** True if any manifest match pattern covers one of the platform's hosts. */
function platformIsLive(platform, patterns) {
  return platform.hosts.some(host => {
    // strip any path segment (e.g. "revolut.com/careers" → "revolut.com")
    const bareHost = host.split('/')[0];
    return patterns.some(p => p.includes('://') && hostInPattern(bareHost, p));
  });
}

function hostInPattern(host, pattern) {
  // pattern looks like "https://*.example.com/*" or "https://jobs.example.com/*"
  const m = /^[a-z]+:\/\/([^/]+)/.exec(pattern);
  if (!m) return false;
  const patternHost = m[1].replace(/^\*\./, '').replace(/^\*/, '');
  return patternHost === host || patternHost.endsWith('.' + host) || host.endsWith('.' + patternHost) || host === patternHost;
}

function renderPlatforms() {
  const container = document.getElementById('platforms-content');
  const countEl = document.getElementById('platforms-count');
  if (!container) return;

  const platforms = AAM.SUPPORTED_PLATFORMS || [];
  const patterns = getInjectedHostPatterns();

  const rows = platforms.map(p => {
    const live = platformIsLive(p, patterns);
    const status = live ? 'live' : 'ready';
    const statusLabel = live ? 'Live' : 'Adapter ready';
    const hosts = p.hosts.map(h => `<code>${escapeText(h)}</code>`).join(' ');
    return `
      <div class="platform-row">
        <div class="platform-main">
          <span class="platform-name">${escapeText(p.name)}</span>
          <span class="platform-hosts">${hosts}</span>
        </div>
        <span class="platform-status platform-status-${status}">${statusLabel}</span>
      </div>`;
  });

  const liveCount = platforms.filter(p => platformIsLive(p, patterns)).length;
  if (countEl) {
    countEl.textContent = `${liveCount} live · ${platforms.length} total`;
  }

  container.innerHTML = rows.length
    ? `<div class="platform-list">${rows.join('')}</div>`
    : '<p class="empty-state">No platforms registered.</p>';
}

// ── Utilities ───────────────────────────────────────

function validateResume(file) {
  if (file.size > AAM.CONSTANTS.MAX_RESUME_BYTES) throw new Error('Resume exceeds 5 MB');
  if (!/\.(pdf|doc|docx)$/i.test(file.name)) throw new Error('Resume must be PDF, DOC, or DOCX');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,<b64>" — strip the prefix
      const b64 = String(reader.result).split(',')[1] || '';
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
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
