/**
 * AutoApplyMAX — Side Panel Logic
 *
 * Manages the Side Panel UI state, communicates with active tabs,
 * and displays application statistics/history.
 */

async function init() {
    document.getElementById('extension-version').textContent = chrome.runtime.getManifest().version;
    updateStats();
    updateRecentActivity();
    checkCurrentTab();

    // Listen for tab updates to refresh the platform detection
    chrome.tabs.onActivated.addListener(checkCurrentTab);
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') checkCurrentTab();
    });

    // Event Listeners
    document.getElementById('btn-prefill').addEventListener('click', triggerAutofill);
    document.getElementById('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('view-all-history').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage(); // Options page has the history tab
    });

    // Listen for logs and results from content scripts
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === AAM.CONSTANTS.MSG.LOG_APPLICATION) {
            updateStats();
            updateRecentActivity();
        }
        if (msg.type === AAM.CONSTANTS.MSG.AUTOFILL_COMPLETED) {
            showFillResult(msg.result);
        }
    });
}

/**
 * Display the result of the autofill in the status card
 */
function showFillResult(result) {
    const siteStatusEl = document.getElementById('site-status');
    siteStatusEl.textContent = `Prefill complete. Filled ${Number(result.filled) || 0} and skipped ${Number(result.skipped) || 0} fields.`;

    // Revert after a few seconds
    setTimeout(checkCurrentTab, 5000);
}

/**
 * Check if the active tab is a supported job site
 */
async function checkCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    const url = new URL(tab.url);
    const detectedATS = AAM.getSupportedATS(url);

    const siteNameEl = document.getElementById('site-name');
    const siteStatusEl = document.getElementById('site-status');
    const dotEl = document.getElementById('status-dot');
    const btnPrefill = document.getElementById('btn-prefill');

    if (detectedATS) {
        siteNameEl.textContent = detectedATS.charAt(0) + detectedATS.slice(1).toLowerCase();
        siteStatusEl.textContent = 'Ready to prefill this application.';
        dotEl.className = 'status-indicator active';
        btnPrefill.disabled = false;
    } else {
        siteNameEl.textContent = 'Unknown Platform';
        siteStatusEl.textContent = 'This site is not supported.';
        dotEl.className = 'status-indicator inactive';
        btnPrefill.disabled = true;
    }
}

/**
 * Send prefill message to the active tab
 */
async function triggerAutofill() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !AAM.getSupportedATS(tab.url)) return;

    const btn = document.getElementById('btn-prefill');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Filling...';

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'aam:trigger_autofill'
            ,requestId: crypto.randomUUID()
            ,tabId: tab.id
            ,expectedOrigin: new URL(tab.url).origin
        });

        if (response && response.error) {
            console.warn('[AutoApplyMAX] Fill error:', response.error);
        }
    } catch (err) {
        console.error('[AutoApplyMAX] Communication failed:', err);
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = originalText;
        }, 1000);
    }
}

/**
 * Update stats from storage
 */
async function updateStats() {
    const jobs = await AAM.Storage.getAppliedJobs();
    document.getElementById('stat-total').textContent = jobs.length;

    const today = new Date().toISOString().split('T')[0];
    const todayCount = jobs.filter(j => j.timestamp && j.timestamp.startsWith(today)).length;
    document.getElementById('stat-today').textContent = todayCount;
}

/**
 * Update recent activity list
 */
async function updateRecentActivity() {
    const jobs = await AAM.Storage.getAppliedJobs();
    const list = document.getElementById('activity-list');

    if (jobs.length === 0) {
        list.innerHTML = '<p class="empty-msg">No recent applications.</p>';
        return;
    }

    const recent = jobs.slice(0, 5);
    list.innerHTML = recent.map(j => `
    <div style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
      <div style="font-weight: 600;">${escapeHtml(j.company || 'Unknown')}</div>
      <div style="color: #64748b; font-size: 11px;">${escapeHtml(j.jobTitle || 'Job Application')}</div>
    </div>
  `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
