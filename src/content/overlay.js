/**
 * AutoApplyMAX — Floating Overlay UI
 *
 * Injects a non-intrusive floating overlay to notify the user
 * that autofill is complete and they should review before submitting.
 */
var AAM = window.AAM || {};

function aamEscapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = String(value || '');
  return element.innerHTML;
}

AAM.Overlay = {
  /** @type {HTMLElement|null} */
  _container: null,

  /**
   * Show the autofill result overlay.
   * @param {{filled: number, skipped: number}} stats
   * @param {Array} detectedFields
   * @param {string} siteKey
   * @param {string} notice - optional banner shown above the stats (e.g. drift nudge)
   */
  show(stats, detectedFields = [], siteKey = '', notice = '') {
    const allFields = detectedFields || [];
    const reviewFields = allFields.filter(
      f => f.source === 'unmatched' ||
        f.confidence < AAM.CONSTANTS.CONFIDENCE_LOW ||
        ['missing_value', 'requires_confirmation', 'not_autofillable'].includes(f.status)
    );

    // Review fields first, then the rest
    const sortedFields = [
      ...reviewFields,
      ...allFields.filter(f => !reviewFields.includes(f)),
    ];

    // Build grouped profile options for the zap picker
    const groupOrder = ['personal', 'professional', 'additional'];
    const groupLabels = { personal: 'Personal', professional: 'Professional', additional: 'Application' };
    const profileGroups = {};
    for (const f of AAM.PROFILE_FIELDS) {
      if (!f.autofillable) continue;
      if (!profileGroups[f.group]) profileGroups[f.group] = [];
      profileGroups[f.group].push(f);
    }
    const buildOptions = selectedKey => [
      '<option value="">-- Map this field --</option>',
      ...groupOrder.filter(g => profileGroups[g]).map(g =>
        `<optgroup label="${groupLabels[g]}">${
          profileGroups[g].map(f =>
            `<option value="${f.key}"${f.key === selectedKey ? ' selected' : ''}>${aamEscapeHtml(f.label)}</option>`
          ).join('')
        }</optgroup>`
      ),
    ].join('');

    const makeFieldItem = (field, idx) => {
      const isReview = reviewFields.includes(field);
      const badgeClass = field.profileKey
        ? `aam-badge-${field.source || 'heuristic'}`
        : 'aam-badge-unmatched';
      const badgeText = field.profileKey
        ? aamEscapeHtml(field.profileKey)
        : 'Unmatched';
      return `
        <div class="aam-field-item${isReview ? ' aam-field-review' : ''}"
             data-field-index="${idx}"
             data-selector="${encodeURIComponent(field.selector || '')}"
             data-signature="${encodeURIComponent(field.signature || '')}">
          <div class="aam-field-row">
            <span class="aam-field-label" title="${aamEscapeHtml(field.context || '')}">
              ${aamEscapeHtml(field.displayLabel || 'Field ' + (idx + 1))}
            </span>
            <span class="aam-field-src-badge ${badgeClass}">${badgeText}</span>
            <button class="aam-zap-btn" title="Map this field to a profile field">&#9889;</button>
          </div>
          <div class="aam-zap-picker" hidden>
            <select class="aam-zap-select">${buildOptions(field.profileKey || '')}</select>
            <div class="aam-zap-actions">
              <button class="aam-zap-confirm" disabled>&#9889; Match &amp; share</button>
              <button class="aam-zap-cancel">&#10005; Cancel</button>
            </div>
            <p class="aam-zap-hint"></p>
          </div>
          ${field.status === 'requires_confirmation'
            ? `<button type="button" class="aam-confirm-sensitive" data-field-index="${idx}">Fill this sensitive field</button>`
            : ''}
        </div>
      `;
    };

    const container = this._getOrCreateContainer();
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');

    const fieldsToggleLabel = reviewFields.length > 0
      ? `&#9889; Fix ${reviewFields.length} unmatched &amp; map fields &#8595;`
      : `&#9889; Map fields &#8595;`;

    container.innerHTML = `
      <style>
        #aam-overlay {
          position: fixed; bottom: 24px; right: 24px;
          z-index: ${AAM.CONSTANTS.OVERLAY_Z};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px; line-height: 1.5; color: #1a1a1a;
          pointer-events: auto;
          animation: aamSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes aamSlideIn {
          from { transform: translateY(20px) scale(0.95); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes aamSlideOut {
          from { transform: translateY(0) scale(1); opacity: 1; }
          to   { transform: translateY(20px) scale(0.95); opacity: 0; }
        }
        @keyframes aamFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aamPulse {
          0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0.4); }
          70%  { box-shadow: 0 0 0 10px rgba(37,99,235,0); }
          100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
        }
        #aam-overlay-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.05);
          padding: 20px; max-width: 380px; min-width: 300px;
        }
        #aam-overlay-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px;
        }
        #aam-overlay-title {
          display: flex; align-items: center; gap: 10px;
          font-weight: 700; font-size: 16px; color: #0f172a;
        }
        #aam-overlay-icon {
          width: 24px; height: 24px; border-radius: 50%;
          background: #10b981; display: flex; align-items: center;
          justify-content: center; color: white; font-size: 14px;
          font-weight: bold; flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(16,185,129,0.3);
        }
        #aam-overlay-close {
          background: none; border: none; cursor: pointer;
          color: #94a3b8; font-size: 20px; padding: 4px;
          border-radius: 8px; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        #aam-overlay-close:hover { background: #f1f5f9; color: #475569; }
        #aam-overlay-stats {
          display: flex; gap: 12px; margin-bottom: 16px;
          padding: 12px; background: #f8fafc; border-radius: 12px;
          border: 1px solid #f1f5f9;
        }
        .aam-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
        .aam-stat-number { font-size: 20px; font-weight: 800; color: #1e293b; }
        .aam-stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .aam-stat-filled .aam-stat-number { color: #10b981; }
        .aam-stat-review .aam-stat-number { color: #f59e0b; }
        #aam-overlay-notice {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 12px; line-height: 1.4; color: #92400e;
          background: #fffbeb; border: 1px solid #fde68a;
          border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
        }
        #aam-overlay-notice .aam-notice-icon { flex-shrink: 0; font-weight: 800; }
        #aam-overlay-message {
          font-size: 13px; color: #475569; text-align: center;
          margin-bottom: 14px; line-height: 1.5;
        }
        #aam-overlay-message strong { color: #1e293b; }

        /* Fields panel */
        #aam-fields-toggle {
          display: block; width: 100%; padding: 9px 12px;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
          color: #475569; font-size: 13px; font-weight: 600;
          cursor: pointer; text-align: left; transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        #aam-fields-toggle:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
        #aam-fields-toggle.has-review { border-color: #fde68a; background: #fffbeb; color: #92400e; }
        #aam-fields-panel {
          margin-top: 8px; max-height: 280px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 5px;
        }
        .aam-field-item {
          border: 1px solid #f1f5f9; border-radius: 10px;
          background: #fff; overflow: hidden; transition: border-color 0.2s;
        }
        .aam-field-item.aam-field-review { border-color: #fde68a; background: #fffbeb; }
        .aam-field-item.aam-field-done { border-color: #bbf7d0 !important; background: #f0fdf4 !important; }
        .aam-field-row {
          display: flex; align-items: center; gap: 6px; padding: 7px 10px;
        }
        .aam-field-label {
          flex: 1; font-weight: 600; font-size: 12px; color: #1e293b;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .aam-field-src-badge {
          font-size: 9px; padding: 2px 5px; border-radius: 4px;
          font-weight: 700; text-transform: uppercase; flex-shrink: 0;
        }
        .aam-badge-adapter   { background: #dbeafe; color: #1d4ed8; }
        .aam-badge-learned   { background: #d1fae5; color: #065f46; }
        .aam-badge-heuristic { background: #e0f2fe; color: #0369a1; }
        .aam-badge-community { background: #f3e8ff; color: #7c3aed; }
        .aam-badge-unmatched { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .aam-zap-btn {
          background: none; border: none; cursor: pointer;
          font-size: 14px; padding: 2px 5px; border-radius: 6px;
          color: #94a3b8; transition: all 0.2s; flex-shrink: 0; line-height: 1;
        }
        .aam-zap-btn:hover { color: #f59e0b; background: #fffbeb; }
        .aam-field-review .aam-zap-btn { color: #d97706; }
        .aam-field-review .aam-zap-btn:hover { background: #fef3c7; }
        .aam-zap-picker {
          padding: 8px 10px 10px; border-top: 1px solid #f1f5f9;
          background: #f8fafc; display: flex; flex-direction: column; gap: 6px;
        }
        .aam-field-review .aam-zap-picker { border-top-color: #fde68a; }
        .aam-zap-select {
          width: 100%; padding: 6px 8px; font-size: 12px;
          border-radius: 8px; border: 1px solid #e2e8f0;
          color: #1e293b; background: #fff; outline: none;
        }
        .aam-zap-select:focus { border-color: #3b82f6; }
        .aam-zap-actions { display: flex; gap: 6px; }
        .aam-zap-confirm {
          flex: 1; padding: 6px 10px; font-size: 12px; font-weight: 700;
          border: none; border-radius: 8px; cursor: pointer;
          background: #f59e0b; color: #fff; transition: background 0.2s;
        }
        .aam-zap-confirm.local { background: #6366f1; }
        .aam-zap-confirm.local:not(:disabled):hover { background: #4f46e5; }
        .aam-zap-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
        .aam-zap-confirm:not(:disabled):hover { background: #d97706; }
        .aam-zap-cancel {
          padding: 6px 10px; font-size: 12px; font-weight: 600;
          border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer;
          background: #fff; color: #475569; transition: background 0.2s;
        }
        .aam-zap-cancel:hover { background: #f1f5f9; }
        .aam-zap-hint { font-size: 11px; color: #64748b; margin: 0; min-height: 14px; }
        .aam-confirm-sensitive {
          display: block; width: calc(100% - 20px); margin: 0 10px 8px;
          padding: 6px; font-size: 12px; font-weight: 600;
          background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;
          color: #92400e; cursor: pointer; text-align: center; transition: background 0.2s;
        }
        .aam-confirm-sensitive:hover { background: #fde68a; }
      </style>
      <div id="aam-overlay-card">
        <div id="aam-overlay-header">
          <div id="aam-overlay-title">
            <div id="aam-overlay-icon">&#10003;</div>
            Autofill Complete
          </div>
          <button id="aam-overlay-close" title="Dismiss">&times;</button>
        </div>
        ${notice ? `<div id="aam-overlay-notice"><span class="aam-notice-icon">&#9888;</span><span>${aamEscapeHtml(notice)}</span></div>` : ''}
        <div id="aam-overlay-stats">
          <div class="aam-stat aam-stat-filled">
            <span class="aam-stat-number">${stats.filled}</span>
            <span class="aam-stat-label">Filled</span>
          </div>
          <div class="aam-stat">
            <span class="aam-stat-number">${stats.skipped}</span>
            <span class="aam-stat-label">Skipped</span>
          </div>
          <div class="aam-stat aam-stat-review">
            <span class="aam-stat-number">${reviewFields.length}</span>
            <span class="aam-stat-label">Review</span>
          </div>
        </div>
        <div id="aam-overlay-message">
          <strong>Please review your info</strong> before manually submitting.
        </div>
        ${sortedFields.length > 0 ? `
          <button id="aam-fields-toggle" class="${reviewFields.length > 0 ? 'has-review' : ''}">
            ${fieldsToggleLabel}
          </button>
          <div id="aam-fields-panel" ${reviewFields.length === 0 ? 'hidden' : ''}>
            ${sortedFields.map((field, idx) => makeFieldItem(field, idx)).join('')}
          </div>
        ` : ''}
      </div>
    `;

    // Toggle fields panel
    const fieldsToggle = container.querySelector('#aam-fields-toggle');
    if (fieldsToggle) {
      fieldsToggle.addEventListener('click', event => {
        if (!event.isTrusted) return;
        if (this._dismissTimer) { clearTimeout(this._dismissTimer); this._dismissTimer = null; }
        const panel = container.querySelector('#aam-fields-panel');
        const hidden = panel.hidden;
        panel.hidden = !hidden;
        const hasReview = reviewFields.length > 0;
        fieldsToggle.innerHTML = !hidden
          ? (hasReview ? `&#9889; Fix ${reviewFields.length} unmatched &amp; map fields &#8595;` : '&#9889; Map fields &#8595;')
          : (hasReview ? `&#9889; Fix ${reviewFields.length} unmatched &amp; map fields &#8593;` : '&#9889; Map fields &#8593;');
      });
    }

    // Highlight field on hover
    container.querySelectorAll('.aam-field-item').forEach(item => {
      const selector = decodeURIComponent(item.dataset.selector);
      const el = document.querySelector(selector);
      item.addEventListener('mouseenter', () => {
        if (el) {
          el.style.outline = '3px solid #3b82f6';
          el.style.outlineOffset = '2px';
          el.style.animation = 'aamPulse 1.5s infinite';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      item.addEventListener('mouseleave', () => {
        if (el && !item.classList.contains('aam-field-done')) {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.animation = '';
        }
      });
    });

    // ⚡ zap button — open/close picker
    container.querySelectorAll('.aam-zap-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        if (!event.isTrusted) return;
        if (this._dismissTimer) { clearTimeout(this._dismissTimer); this._dismissTimer = null; }
        const item = btn.closest('.aam-field-item');
        const picker = item.querySelector('.aam-zap-picker');
        const isOpen = !picker.hidden;
        // Close all other pickers first
        container.querySelectorAll('.aam-zap-picker').forEach(p => { p.hidden = true; });
        picker.hidden = isOpen;
        if (!isOpen) item.querySelector('.aam-zap-select').focus();
      });
    });

    // Zap picker — select change
    container.querySelectorAll('.aam-zap-select').forEach(select => {
      select.addEventListener('change', () => {
        const item = select.closest('.aam-field-item');
        const confirmBtn = item.querySelector('.aam-zap-confirm');
        const hint = item.querySelector('.aam-zap-hint');
        const key = select.value;
        confirmBtn.disabled = !key;
        if (key) {
          const isCloud = AAM.isCloudMappableProfileKey(key);
          if (isCloud) {
            confirmBtn.textContent = '⚡ Match & share';
            confirmBtn.className = 'aam-zap-confirm';
            hint.textContent = 'Your correction will be shared to improve detection for everyone.';
          } else {
            confirmBtn.textContent = '💾 Save locally';
            confirmBtn.className = 'aam-zap-confirm local';
            hint.textContent = 'Sensitive field — saved locally only, not shared with the community.';
          }
        } else {
          hint.textContent = '';
        }
      });
    });

    // Zap picker — cancel
    container.querySelectorAll('.aam-zap-cancel').forEach(btn => {
      btn.addEventListener('click', event => {
        if (!event.isTrusted) return;
        btn.closest('.aam-zap-picker').hidden = true;
      });
    });

    // Zap picker — confirm & submit
    container.querySelectorAll('.aam-zap-confirm').forEach(confirmBtn => {
      confirmBtn.addEventListener('click', async event => {
        if (!event.isTrusted) return;
        const item = confirmBtn.closest('.aam-field-item');
        const select = item.querySelector('.aam-zap-select');
        const profileKey = select.value;
        if (!profileKey) return;

        const selector = decodeURIComponent(item.dataset.selector);
        const signature = decodeURIComponent(item.dataset.signature);

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving…';

        try {
          await AAM.Storage.saveMappingExplicit(siteKey, selector, profileKey, signature);

          // Visual feedback on the actual form field
          const el = document.querySelector(selector);
          if (el) {
            el.style.outline = '3px solid #10b981';
            el.style.outlineOffset = '2px';
            el.style.animation = '';
          }

          // Update the row
          item.classList.remove('aam-field-review');
          item.classList.add('aam-field-done');
          const badge = item.querySelector('.aam-field-src-badge');
          badge.className = 'aam-field-src-badge aam-badge-learned';
          badge.textContent = profileKey;
          item.querySelector('.aam-zap-picker').hidden = true;

          // Brief "Saved ✓" feedback on the ⚡ button
          const zapBtn = item.querySelector('.aam-zap-btn');
          zapBtn.textContent = '✓';
          zapBtn.style.color = '#10b981';
          setTimeout(() => {
            zapBtn.textContent = '⚡';
            zapBtn.style.color = '';
          }, 2000);
        } catch (err) {
          console.error('[AutoApplyMAX] Failed to save mapping:', err);
          confirmBtn.disabled = false;
          confirmBtn.textContent = '⚡ Retry';
          item.querySelector('.aam-zap-hint').textContent = 'Save failed — please try again.';
        }
      });
    });

    // Sensitive field fill button
    container.querySelectorAll('.aam-confirm-sensitive').forEach(button => {
      button.addEventListener('click', async event => {
        if (!event.isTrusted) return;
        const item = event.currentTarget.closest('.aam-field-item');
        const fieldIndex = Number(item.dataset.fieldIndex);
        const field = sortedFields[fieldIndex];
        if (field && await AAM.FieldFiller.fillConfirmedField(field)) {
          event.currentTarget.textContent = '✓ Filled';
          event.currentTarget.disabled = true;
        }
      });
    });

    // Close button
    container.querySelector('#aam-overlay-close').addEventListener('click', () => {
      this.remove();
    });

    // Auto-dismiss after 15 seconds if not interacting
    this._dismissTimer = setTimeout(() => this.remove(), 15000);
  },

  /**
   * Show an error/info message overlay.
   * @param {string} message
   * @param {'error'|'info'|'warning'} type
   */
  showMessage(message, type = 'info') {
    this.remove();

    const colors = {
      error: { bg: '#fde8e8', border: '#f5a5a5', text: '#b91c1c', icon: '!' },
      info: { bg: '#e8f0fe', border: '#a5c8f5', text: '#1a56db', icon: 'i' },
      warning: { bg: '#fef3cd', border: '#ffc107', text: '#856404', icon: '!' },
    };
    const c = colors[type] || colors.info;

    const container = document.createElement('div');
    container.id = 'aam-overlay';
    container.innerHTML = `
      <style>
        #aam-overlay {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: ${AAM.CONSTANTS.OVERLAY_Z};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          animation: aamSlideIn 0.3s ease-out;
        }
        @keyframes aamSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        #aam-msg-card {
          background: ${c.bg};
          border: 1px solid ${c.border};
          border-radius: 10px;
          padding: 14px 18px;
          max-width: 320px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        }
        #aam-msg-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${c.text};
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
          flex-shrink: 0;
        }
        #aam-msg-text { color: ${c.text}; flex: 1; }
        #aam-msg-close {
          background: none; border: none; cursor: pointer;
          color: ${c.text}; font-size: 16px; padding: 2px 6px;
          border-radius: 4px;
        }
        #aam-msg-close:hover { background: rgba(0,0,0,0.05); }
      </style>
      <div id="aam-msg-card">
        <div id="aam-msg-icon">${c.icon}</div>
        <div id="aam-msg-text">${aamEscapeHtml(message)}</div>
        <button id="aam-msg-close">&times;</button>
      </div>
    `;

    document.body.appendChild(container);
    this._container = container;

    container.querySelector('#aam-msg-close').addEventListener('click', () => this.remove());
    this._dismissTimer = setTimeout(() => this.remove(), 8000);
  },

  /**
   * Remove the current overlay with animation
   * @param {boolean} immediate - skip animation
   */
  remove(immediate = false) {
    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }

    const container = document.getElementById('aam-overlay');
    if (!container) {
      this._container = null;
      return;
    }

    if (immediate) {
      if (container.parentNode) container.parentNode.removeChild(container);
      this._container = null;
    } else {
      container.style.animation = 'aamSlideOut 0.2s ease-in forwards';
      setTimeout(() => {
        if (container.parentNode) container.parentNode.removeChild(container);
        if (this._container === container) this._container = null;
      }, 200);
    }
  },

  /**
   * Internal helper to get or create the main overlay container
   * @private
   */
  _getOrCreateContainer() {
    let container = document.getElementById('aam-overlay');
    if (!container) {
      container = document.createElement('div');
      container.id = 'aam-overlay';
      document.body.appendChild(container);
    }
    this._container = container;

    // Clear auto-dismiss timer whenever we interact/update
    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }

    return container;
  },

  /**
   * Show a loading state within the existing overlay
   */
  showLoading(message = 'AutoApplyMAX is working...') {
    const container = this._getOrCreateContainer();

    container.innerHTML = `
      <style>
        #aam-overlay-loading {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 50px;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          min-width: 240px;
          animation: aamFadeIn 0.3s ease;
        }
        .aam-spinner {
          width: 20px; height: 20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: aamSpin 1s linear infinite;
        }
        @keyframes aamSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        #aam-loading-text { font-weight: 600; color: #1e293b; font-size: 14px; }
      </style>
      <div id="aam-overlay-loading">
        <div class="aam-spinner"></div>
        <div id="aam-loading-text">${aamEscapeHtml(message)}</div>
      </div>
    `;
  },

  /**
   * Show a proactive "Prefill" trigger button
   */
  showTrigger(onTrigger) {
    const container = this._getOrCreateContainer();

    container.innerHTML = `
      <style>
        #aam-overlay {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: ${AAM.CONSTANTS.OVERLAY_Z};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          animation: aamSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #aam-trigger-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid #e2e8f0;
          border-radius: 50px;
          padding: 8px 10px 8px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: all 0.3s ease;
        }
        #aam-trigger-card:hover { transform: translateY(-2px); box-shadow: 0 15px 45px rgba(0,0,0,0.12); }
        #aam-trigger-logo {
          width: 32px; height: 32px; border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: white; display: flex; align-items: center;
          justify-content: center; font-weight: 800; font-size: 15px;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
        }
        #aam-trigger-text { font-size: 14px; font-weight: 600; color: #1e293b; }
        #aam-trigger-btn {
          background: #3b82f6; color: white; border: none;
          padding: 8px 20px; border-radius: 20px; font-size: 13px;
          font-weight: 700; cursor: pointer; transition: background 0.2s;
        }
        #aam-trigger-btn:hover { background: #2563eb; }
        #aam-trigger-close {
          background: none; border: none; cursor: pointer;
          color: #94a3b8; font-size: 20px; padding: 0 8px;
        }
        #aam-trigger-close:hover { color: #64748b; }
      </style>
      <div id="aam-trigger-card">
        <div id="aam-trigger-logo">M</div>
        <div id="aam-trigger-text">AutoApplyMAX</div>
        <button id="aam-trigger-btn">Prefill Form</button>
        <button id="aam-trigger-close" title="Dismiss">&times;</button>
      </div>
    `;

    const handleClick = (e) => {
      if (!e.isTrusted) return;
      e.stopPropagation();
      this.showLoading('Prefilling with Max...');
      onTrigger();
    };

    container.querySelector('#aam-trigger-btn').addEventListener('click', handleClick);
    container.querySelector('#aam-trigger-card').addEventListener('click', handleClick);
    container.querySelector('#aam-trigger-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove();
    });

    this._dismissTimer = setTimeout(() => this.remove(), 45000);
  },
};

window.AAM = AAM;
