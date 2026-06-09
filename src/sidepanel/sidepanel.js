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
    chrome.runtime.onMessage.addListener((msg, sender) => {
        if (msg.type === AAM.CONSTANTS.MSG.LOG_APPLICATION) {
            updateStats();
            updateRecentActivity();
        }
        if (msg.type === AAM.CONSTANTS.MSG.AUTOFILL_COMPLETED) {
            showFillResult(msg.result, sender.tab?.id);
        }
    });

    document.getElementById('review-close').addEventListener('click', () => {
        document.getElementById('review-section').classList.add('hidden');
    });
}

/**
 * Display the result of the autofill in the status card
 */
function showFillResult(result, tabId) {
    const siteStatusEl = document.getElementById('site-status');
    siteStatusEl.textContent = `Prefill complete. Filled ${Number(result.filled) || 0} and skipped ${Number(result.skipped) || 0} fields.`;
    renderReview(result, tabId);
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
    const reviewState = tab.id
        ? await chrome.runtime.sendMessage({
            type: AAM.CONSTANTS.MSG.GET_REVIEW_STATE,
            tabId: tab.id,
        }).catch(() => null)
        : null;
    if (reviewState) renderReview(reviewState, tab.id);

    if (detectedATS || /^https?:$/.test(url.protocol)) {
        siteNameEl.textContent = detectedATS
            ? detectedATS.charAt(0) + detectedATS.slice(1).toLowerCase()
            : url.hostname;
        siteStatusEl.textContent = detectedATS
            ? 'Ready to prefill this application.'
            : 'Generic autofill available for this page.';
        dotEl.className = 'status-indicator active';
        btnPrefill.disabled = false;
    } else {
        siteNameEl.textContent = 'Unknown Platform';
        siteStatusEl.textContent = 'This site is not supported.';
        dotEl.className = 'status-indicator inactive';
        btnPrefill.disabled = true;
    }
}

function fieldNeedsReview(field) {
    return field.source === 'unmatched' ||
        field.confidence < AAM.CONSTANTS.CONFIDENCE_LOW ||
        ['missing_value', 'not_autofillable'].includes(field.status);
}

function buildProfileSelect(selectedKey) {
    const select = document.createElement('select');
    select.className = 'review-field-select';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Map this field';
    select.appendChild(empty);
    for (const field of AAM.PROFILE_FIELDS) {
        if (!field.autofillable) continue;
        const option = document.createElement('option');
        option.value = field.key;
        option.textContent = field.label;
        option.selected = field.key === selectedKey;
        select.appendChild(option);
    }
    return select;
}

function renderReview(result, tabId) {
    if (!result || !Array.isArray(result.fields) || !Number.isInteger(tabId)) return;
    const section = document.getElementById('review-section');
    const fieldsContainer = document.getElementById('review-fields');
    const reviewFields = result.fields.filter(fieldNeedsReview);
    let showAll = false;

    section.classList.remove('hidden');
    document.getElementById('review-title').textContent =
        reviewFields.length > 0
            ? `${reviewFields.length} field${reviewFields.length === 1 ? '' : 's'} need review`
            : 'Autofill complete';
    document.getElementById('review-notice').textContent = result.notice || '';
    document.getElementById('review-filled').textContent = Number(result.filled) || 0;
    document.getElementById('review-skipped').textContent = Number(result.skipped) || 0;
    document.getElementById('review-count').textContent = reviewFields.length;

    const drawFields = () => {
        fieldsContainer.replaceChildren();
        const visibleFields = showAll ? result.fields : reviewFields;
        for (const field of visibleFields) {
            const item = document.createElement('div');
            item.className = `review-field${fieldNeedsReview(field) ? ' needs-review' : ''}`;

            const header = document.createElement('div');
            header.className = 'review-field-header';
            const label = document.createElement('span');
            label.className = 'review-field-label';
            label.textContent = field.label || `Field ${field.fieldIndex + 1}`;
            label.title = field.context || '';
            const badge = document.createElement('span');
            badge.className = 'review-field-badge';
            badge.textContent = field.profileKey || 'Unmatched';
            header.append(label, badge);

            const controls = document.createElement('div');
            controls.className = 'review-field-controls';
            const select = buildProfileSelect(field.profileKey);
            const apply = document.createElement('button');
            apply.type = 'button';
            apply.className = 'review-field-apply';
            apply.textContent = 'Match & fill';
            apply.disabled = !select.value;
            select.addEventListener('change', () => {
                apply.disabled = !select.value;
            });
            const status = document.createElement('p');
            status.className = 'review-field-status';
            apply.addEventListener('click', async () => {
                apply.disabled = true;
                apply.textContent = 'Applying...';
                const response = await chrome.runtime.sendMessage({
                    type: AAM.CONSTANTS.MSG.REVIEW_FIELD_ACTION,
                    requestId: crypto.randomUUID(),
                    tabId,
                    action: 'mapAndFill',
                    fieldIndex: field.fieldIndex,
                    profileKey: select.value,
                }).catch(error => ({ error: error.message }));
                if (response?.error) {
                    apply.disabled = false;
                    apply.textContent = 'Retry';
                    status.textContent = response.error;
                    return;
                }
                field.profileKey = select.value;
                field.source = 'learned';
                field.confidence = 1;
                item.classList.remove('needs-review');
                item.classList.add('done');
                badge.textContent = select.value;
                apply.textContent = response.filled ? 'Filled' : 'Mapped';
                status.textContent = response.communitySubmitted
                    ? 'Sent for community review.'
                    : response.communityError || 'Saved locally.';
            });
            controls.append(select, apply);
            item.append(header, controls, status);
            fieldsContainer.appendChild(item);
        }
    };

    const toggle = document.getElementById('review-toggle-all');
    if (result.fields.length > reviewFields.length) {
        toggle.classList.remove('hidden');
        toggle.textContent = `Show all ${result.fields.length} detected fields`;
        toggle.onclick = () => {
            showAll = !showAll;
            toggle.textContent = showAll
                ? 'Show only fields that need review'
                : `Show all ${result.fields.length} detected fields`;
            drawFields();
        };
    } else {
        toggle.classList.add('hidden');
    }
    drawFields();
}

/**
 * Send prefill message to the active tab
 */
async function triggerAutofill() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return;

    const btn = document.getElementById('btn-prefill');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = 'Finding application form...';

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'aam:trigger_autofill'
            ,requestId: crypto.randomUUID()
            ,tabId: tab.id
            ,expectedOrigin: new URL(tab.url).origin
        });

        if (response && response.error) {
            document.getElementById('site-status').textContent = response.error;
            console.warn('[AutoApplyMAX] Fill error:', response.error);
        } else if (response) {
            showFillResult(response, tab.id);
        }
    } catch (err) {
        document.getElementById('site-status').textContent =
            err.message || 'Could not connect to the application form.';
        console.error('[AutoApplyMAX] Communication failed:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
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
