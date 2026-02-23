/**
 * AutoApplyMAX — Floating Overlay UI
 *
 * Injects a non-intrusive floating overlay to notify the user
 * that autofill is complete and they should review before submitting.
 */
var AAM = window.AAM || {};

AAM.Overlay = {
  /** @type {HTMLElement|null} */
  _container: null,

  /**
   * Show the autofill result overlay.
   * @param {{filled: number, skipped: number}} stats
   * @param {Array} detectedFields
   * @param {string} siteKey
   */
  show(stats, detectedFields = [], siteKey = '') {
    const reviewFields = (detectedFields || []).filter(
      f => f.source === 'unmatched' || f.confidence < AAM.CONSTANTS.CONFIDENCE_LOW || f.status === 'missing_value'
    );

    const profileOptions = AAM.PROFILE_FIELDS.map(f =>
      `<option value="${f.key}">${f.label}</option>`
    ).join('');

    const container = this._getOrCreateContainer();
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');

    container.innerHTML = `
      <style>
        #aam-overlay {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: ${AAM.CONSTANTS.OVERLAY_Z};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #1a1a1a;
          pointer-events: auto;
          animation: aamSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes aamSlideIn {
          from { transform: translateY(20px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        @keyframes aamSlideOut {
          from { transform: translateY(0) scale(1); opacity: 1; }
          to { transform: translateY(20px) scale(0.95); opacity: 0; }
        }

        @keyframes aamFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        #aam-overlay-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 2px 10px rgba(0, 0, 0, 0.05);
          padding: 20px;
          max-width: 380px;
          min-width: 300px;
          transition: all 0.3s ease;
        }

        #aam-overlay-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        #aam-overlay-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 16px;
          color: #0f172a;
        }

        #aam-overlay-icon {
          width: 24px; height: 24px; border-radius: 50%;
          background: #10b981; display: flex; align-items: center;
          justify-content: center; color: white; font-size: 14px;
          font-weight: bold; flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
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

        .aam-missing-badge {
          font-size: 9px;
          background: #fee2e2;
          color: #b91c1c;
          padding: 1px 6px;
          border-radius: 4px;
          margin-left: 6px;
          text-transform: uppercase;
          font-weight: 700;
          display: inline-block;
          vertical-align: middle;
          border: 1px solid #fca5a5;
        }

        #aam-overlay-message { font-size: 13px; color: #475569; text-align: center; margin-bottom: 16px; line-height: 1.5; }
        #aam-overlay-message strong { color: #1e293b; }
        
        #aam-train-toggle {
          display: block; width: 100%; padding: 10px;
          background: #ffffff; border: 1px solid #e2e8f0;
          border-radius: 10px; color: #475569; font-size: 13px;
          font-weight: 600; cursor: pointer; text-align: center;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        #aam-train-toggle:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

        #aam-train-content {
          margin-top: 12px; max-height: 200px;
          overflow-y: auto; display: none;
          padding: 10px; background: #fafafa;
          border-radius: 8px; border: 1px solid #eee;
        }

        .aam-train-item {
          margin-bottom: 12px; padding: 12px;
          border: 1px solid #f1f5f9;
          background: #ffffff;
          border-radius: 12px;
          transition: all 0.2s;
        }
        .aam-train-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: #e2e8f0; }
        .aam-train-item:last-child { margin-bottom: 4px; }
        
        .aam-train-label-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
        .aam-train-label { font-weight: 700; font-size: 13px; color: #1e293b; flex: 1; }

        .aam-matched-badge {
          font-size: 10px; background: #e0f2fe; color: #0369a1;
          padding: 1px 6px; border-radius: 4px; text-transform: uppercase;
          font-weight: 700; border: 1px solid #bae6fd;
        }

        .aam-train-select {
          width: 100%; padding: 8px; font-size: 13px;
          border-radius: 8px; border: 1px solid #e2e8f0;
          color: #1e293b; background: #f8fafc;
          outline: none; transition: border-color 0.2s;
        }
        .aam-train-select:focus { border-color: #3b82f6; background: #ffffff; }

        @keyframes aamPulse {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
      </style>
      <div id="aam-overlay-card">
        <div id="aam-overlay-header">
          <div id="aam-overlay-title">
            <div id="aam-overlay-icon">&#10003;</div>
            Autofill Complete
          </div>
          <button id="aam-overlay-close" title="Dismiss">&times;</button>
        </div>
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
        
        ${reviewFields.length > 0 ? `
          <button id="aam-train-toggle">Fix ${reviewFields.length} Review Fields &darr;</button>
          <div id="aam-train-content">
            ${reviewFields.map((field, idx) => {
      const matchedKey = field.profileKey || '';
      return `
              <div class="aam-train-item" data-selector="${encodeURIComponent(field.selector)}">
                <div class="aam-train-label-row">
                  <span class="aam-train-label" title="${field.context}">${field.displayLabel || 'Field ' + (idx + 1)}</span>
                  ${matchedKey ? `<span class="aam-matched-badge">${matchedKey}</span>` : ''}
                  ${field.status === 'missing_value' ? '<span class="aam-missing-badge">Missing Data</span>' : ''}
                </div>
                <select class="aam-train-select">
                  <option value="">-- Map this field --</option>
                  ${profileOptions.replace(`value="${matchedKey}"`, `value="${matchedKey}" selected`)}
                </select>
              </div>
            `}).join('')}
          </div>
        ` : ''}
      </div>
    `;

    // Toggle training content
    const toggle = container.querySelector('#aam-train-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const content = container.querySelector('#aam-train-content');
        const isHidden = content.style.display === 'none' || !content.style.display;
        content.style.display = isHidden ? 'block' : 'none';
        toggle.innerHTML = isHidden ? 'Close Trainer &uarr;' : `Fix ${reviewFields.length} Review Fields &darr;`;

        // Disable auto-dismiss when training
        if (this._dismissTimer) {
          clearTimeout(this._dismissTimer);
          this._dismissTimer = null;
        }
      });
    }

    // Handle hovering over training items to highlight fields
    container.querySelectorAll('.aam-train-item').forEach(item => {
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
        if (el) {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.animation = '';
        }
      });
    });

    // Handle mapping selection
    container.querySelectorAll('.aam-train-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const profileKey = e.target.value;
        const item = e.target.closest('.aam-train-item');
        const selector = decodeURIComponent(item.dataset.selector);

        if (profileKey && siteKey) {
          try {
            await AAM.Storage.saveMapping(siteKey, selector, profileKey);

            // Highlight the field we just mapped
            const el = document.querySelector(selector);
            if (el) {
              el.style.outline = '';
              el.style.animation = '';
              el.style.boxShadow = '0 0 0 3px rgba(26, 127, 55, 0.5)';
            }

            // Remove the item from the list
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
            e.target.disabled = true;
          } catch (err) {
            console.error('[AutoApplyMAX] Failed to save mapping:', err);
          }
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
        <div id="aam-msg-text">${message}</div>
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
        <div id="aam-loading-text">${message}</div>
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
