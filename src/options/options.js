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

      // Refresh mappings when switching to that tab
      if (tab.dataset.tab === 'mappings') {
        loadMappings();
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
