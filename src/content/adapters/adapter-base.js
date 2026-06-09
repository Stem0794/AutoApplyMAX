/**
 * AutoApplyMAX — Base ATS Adapter
 *
 * Provides the interface and shared utilities for ATS-specific adapters.
 * Each adapter can override methods to handle ATS-specific DOM quirks.
 */
var AAM = window.AAM || {};

AAM.AdapterBase = {
  /** Human-readable name */
  name: 'Generic',

  /**
   * Check if this adapter should handle the current page.
   * @returns {boolean}
   */
  matches() {
    return false;
  },

  /**
   * Return a site key used for storing learned mappings.
   * @returns {string}
   */
  getSiteKey() {
    return window.location.hostname;
  },

  /**
   * Optional: perform any pre-fill preparation (e.g., expanding hidden sections,
   * clicking "show more" buttons, waiting for lazy-loaded fields).
   * @returns {Promise<void>}
   */
  async prepare() {
    // Default: no-op
  },

  /**
   * Optional: return extra field mappings specific to this ATS.
   * These supplement the generic heuristic detection.
   * @returns {Array<{selector: string, profileKey: string}>}
   */
  getKnownMappings() {
    return [];
  },

  /**
   * Optional: post-fill hook for ATS-specific actions
   * (e.g., triggering validation, handling multi-step forms).
   * @param {{filled: number}} result
   * @returns {Promise<void>}
   */
  async afterFill(result) {
    // Default: no-op
  },

  /**
   * Utility: wait for an element to appear in the DOM.
   * @param {string} selector
   * @param {number} timeout - ms
   * @returns {Promise<HTMLElement|null>}
   */
  waitForElement(selector, timeout = 5000) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      let timer = null;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          if (timer) clearTimeout(timer);
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  },

};

/** Registry of all adapters */
AAM.Adapters = [];

/**
 * Register an ATS adapter.
 * @param {object} adapter - must implement matches()
 */
AAM.registerAdapter = function (adapter) {
  AAM.Adapters.push(adapter);
};

AAM.hostMatches = function (allowedHost, allowSubdomains = true) {
  return AAM.isExactOrSubdomain(window.location.hostname, allowedHost, allowSubdomains);
};

/**
 * Find the best adapter for the current page.
 * @returns {object} - the matching adapter or a generic fallback
 */
AAM.getAdapter = function () {
  for (const adapter of AAM.Adapters) {
    if (adapter.matches()) {
      return adapter;
    }
  }
  // Return a generic adapter that always matches
  return Object.assign({}, AAM.AdapterBase, {
    name: 'Generic',
    matches: () => true,
  });
};

window.AAM = AAM;
