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
   */
  show(stats) {
    this.remove(); // Remove any existing overlay

    const container = document.createElement('div');
    container.id = 'aam-overlay';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');

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
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes aamSlideOut {
          from {
            transform: translateY(0);
            opacity: 1;
          }
          to {
            transform: translateY(20px);
            opacity: 0;
          }
        }

        #aam-overlay-card {
          background: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 16px 20px;
          max-width: 340px;
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
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #1a7f37;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
          font-weight: bold;
          flex-shrink: 0;
        }

        #aam-overlay-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
          font-size: 18px;
          line-height: 1;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background 0.15s;
        }

        #aam-overlay-close:hover {
          background: #f0f0f0;
          color: #333;
        }

        #aam-overlay-stats {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          padding: 8px 0;
          border-top: 1px solid #f0f0f0;
          border-bottom: 1px solid #f0f0f0;
        }

        .aam-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .aam-stat-number {
          font-size: 18px;
          font-weight: 700;
          color: #333;
        }

        .aam-stat-label {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .aam-stat-filled .aam-stat-number { color: #1a7f37; }
        .aam-stat-unmatched .aam-stat-number { color: #d4a017; }

        #aam-overlay-message {
          font-size: 13px;
          color: #555;
          text-align: center;
        }

        #aam-overlay-message strong {
          color: #333;
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
      </div>
    `;

    document.body.appendChild(container);
    this._container = container;

    // Close button
    container.querySelector('#aam-overlay-close').addEventListener('click', () => {
      this.remove();
    });

    // Auto-dismiss after 15 seconds
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
