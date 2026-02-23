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
   * @param {{filled: number, skipped: number, unmatched: number}} stats
   * @param {Array} detectedFields
   * @param {string} siteKey
   */
  show(stats, detectedFields = [], siteKey = '') {
    this.remove(); // Remove any existing overlay

    const unmatchedFields = (detectedFields || []).filter(
      f => f.source === 'unmatched' || f.confidence < AAM.CONSTANTS.CONFIDENCE_LOW
    );

    const container = document.createElement('div');
    container.id = 'aam-overlay';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');

    const profileOptions = AAM.PROFILE_FIELDS.map(f =>
      `<option value="${f.key}">${f.label}</option>`
    ).join('');

    container.innerHTML = `
      <style>
        #aam-overlay {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: ${AAM.CONSTANTS.OVERLAY_Z};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #1a1a1a;
          pointer-events: auto;
          animation: aamSlideIn 0.3s ease-out;
        }

        @keyframes aamSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes aamSlideOut {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(20px); opacity: 0; }
        }

        #aam-overlay-card {
          background: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 16px 20px;
          max-width: 380px;
          min-width: 280px;
        }

        #aam-overlay-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        #aam-overlay-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 15px;
          color: #1a7f37;
        }

        #aam-overlay-icon {
          width: 20px; height: 20px; border-radius: 50%;
          background: #1a7f37; display: flex; align-items: center;
          justify-content: center; color: white; font-size: 12px;
          font-weight: bold; flex-shrink: 0;
        }

        #aam-overlay-close {
          background: none; border: none; cursor: pointer;
          color: #666; font-size: 18px; padding: 2px 6px;
          border-radius: 4px; transition: background 0.15s;
        }

        #aam-overlay-close:hover { background: #f0f0f0; color: #333; }

        #aam-overlay-stats {
          display: flex; gap: 12px; margin-bottom: 12px;
          padding: 8px 0; border-top: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;
        }

        .aam-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
        .aam-stat-number { font-size: 18px; font-weight: 700; color: #333; }
        .aam-stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .aam-stat-filled .aam-stat-number { color: #1a7f37; }
        .aam-stat-unmatched .aam-stat-number { color: #d4a017; }

        #aam-overlay-message { font-size: 13px; color: #555; text-align: center; margin-bottom: 10px; }
        #aam-overlay-message strong { color: #333; }
        
        #aam-train-toggle {
          display: block; width: 100%; padding: 6px;
          background: #f8f9fa; border: 1px solid #dee2e6;
          border-radius: 6px; color: #495057; font-size: 12px;
          font-weight: 600; cursor: pointer; text-align: center;
          transition: all 0.2s;
        }
        #aam-train-toggle:hover { background: #e9ecef; }

        #aam-train-content {
          margin-top: 12px; max-height: 200px;
          overflow-y: auto; display: none;
          padding: 10px; background: #fafafa;
          border-radius: 8px; border: 1px solid #eee;
        }

        .aam-train-item {
          margin-bottom: 10px; padding: 6px;
          border-bottom: 1px solid #eee;
          border-radius: 4px;
          transition: background 0.2s;
        }
        .aam-train-item:hover { background: #eef2ff; }
        .aam-train-item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
        
        .aam-train-label {
          display: block; font-size: 11px; color: #444; font-weight: 600;
          margin-bottom: 4px; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .aam-train-select {
          width: 100%; padding: 4px; font-size: 12px;
          border-radius: 4px; border: 1px solid #ccc;
        }

        @keyframes aamPulse {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
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
          <div class="aam-stat aam-stat-unmatched">
            <span class="aam-stat-number">${stats.unmatched}</span>
            <span class="aam-stat-label">Unknown</span>
          </div>
        </div>
        <div id="aam-overlay-message">
          <strong>Please review your info</strong> before manually submitting.
        </div>
        
        ${unmatchedFields.length > 0 ? `
          <button id="aam-train-toggle">Fix ${unmatchedFields.length} Unknown Fields &darr;</button>
          <div id="aam-train-content">
            ${unmatchedFields.map((field, idx) => `
              <div class="aam-train-item" data-selector="${encodeURIComponent(field.selector)}">
                <span class="aam-train-label" title="${field.context}">${field.displayLabel || 'Field ' + (idx + 1)}</span>
                <select class="aam-train-select">
                  <option value="">-- Map this field --</option>
                  ${profileOptions}
                </select>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(container);
    this._container = container;

    // Toggle training content
    const toggle = container.querySelector('#aam-train-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const content = container.querySelector('#aam-train-content');
        const isHidden = content.style.display === 'none' || !content.style.display;
        content.style.display = isHidden ? 'block' : 'none';
        toggle.innerHTML = isHidden ? 'Close Trainer &uarr;' : `Fix ${unmatchedFields.length} Unknown Fields &darr;`;

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
          el.style.outline = '3px solid #6366f1';
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
   * Remove the overlay from the DOM.
   */
  remove() {
    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
    if (this._container) {
      this._container.style.animation = 'aamSlideOut 0.2s ease-in forwards';
      setTimeout(() => {
        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
      }, 200);
    }
  },
};

window.AAM = AAM;
