/**
 * AutoApplyMAX — Popup Script
 *
 * Displays the user's profile status and provides the
 * one-click autofill trigger button.
 */
document.addEventListener('DOMContentLoaded', () => {
  loadProfileStatus();
  initEventListeners();
});

/**
 * Load and display the user's profile status.
 */
async function loadProfileStatus() {
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const iconEl = document.getElementById('profile-icon');
  const btnEl = document.getElementById('btn-autofill');

  try {
    const profile = await AAM.Storage.getProfile();
    const hasProfile = profile && Object.keys(profile).length > 0;

    if (hasProfile) {
      const displayName = profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Profile Ready';
      nameEl.textContent = displayName;
      emailEl.textContent = profile.email || '';
      iconEl.textContent = (profile.firstName || displayName)[0].toUpperCase();
      iconEl.classList.add('ready');
      btnEl.disabled = false;
    } else {
      nameEl.textContent = 'No profile set up';
      emailEl.textContent = 'Click "Edit Profile" below to get started';
      iconEl.textContent = '!';
      iconEl.classList.add('empty');
      btnEl.disabled = true;
    }
  } catch (err) {
    nameEl.textContent = 'Error loading profile';
    emailEl.textContent = err.message;
    iconEl.textContent = '!';
    iconEl.classList.add('empty');
  }
}

/**
 * Trigger autofill on the current tab.
 */
async function triggerAutofill() {
  const btnEl = document.getElementById('btn-autofill');
  const btnText = document.getElementById('btn-text');
  const btnLoading = document.getElementById('btn-loading');
  const resultEl = document.getElementById('result');
  const errorEl = document.getElementById('error');

  // Reset UI
  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  btnEl.disabled = true;
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');

  try {
    const response = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.TRIGGER_AUTOFILL,
    });

    if (response && response.error) {
      showError(response.error);
    } else if (response) {
      showResult(response);
    } else {
      showError('No response from content script. Make sure you are on a job application page.');
    }
  } catch (err) {
    showError('Could not connect to the page. Try refreshing the tab.');
  } finally {
    btnEl.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

/**
 * Show autofill results.
 */
function showResult(result) {
  document.getElementById('stat-filled').textContent = result.filled || 0;
  document.getElementById('stat-skipped').textContent = result.skipped || 0;
  document.getElementById('stat-unmatched').textContent = result.unmatched || 0;

  const adapterEl = document.getElementById('result-adapter');
  if (result.adapter && result.adapter !== 'Generic') {
    adapterEl.textContent = 'Detected: ' + result.adapter;
  } else {
    adapterEl.textContent = '';
  }

  document.getElementById('result').classList.remove('hidden');
}

/**
 * Show error message.
 */
function showError(msg) {
  document.getElementById('error-text').textContent = msg;
  document.getElementById('error').classList.remove('hidden');
}

/**
 * Initialize event listeners.
 */
function initEventListeners() {
  // Autofill button
  document.getElementById('btn-autofill').addEventListener('click', triggerAutofill);

  // Edit Profile link
  document.getElementById('link-options').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Mappings link — open options page to mappings tab
  document.getElementById('link-mappings').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}
