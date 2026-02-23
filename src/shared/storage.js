/**
 * AutoApplyMAX — chrome.storage.local wrapper
 */
const AAM = window.AAM || {};

AAM.Storage = {
  /**
   * Get value(s) from chrome.storage.local
   * @param {string|string[]} keys
   * @returns {Promise<object>}
   */
  get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  },

  /**
   * Set value(s) in chrome.storage.local
   * @param {object} data
   * @returns {Promise<void>}
   */
  set(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  },

  /**
   * Get the user profile
   * @returns {Promise<object>}
   */
  async getProfile() {
    const result = await this.get(AAM.CONSTANTS.STORAGE_PROFILE);
    return result[AAM.CONSTANTS.STORAGE_PROFILE] || {};
  },

  /**
   * Save the user profile
   * @param {object} profile
   * @returns {Promise<void>}
   */
  async saveProfile(profile) {
    return this.set({ [AAM.CONSTANTS.STORAGE_PROFILE]: profile });
  },

  /**
   * Get all learned field mappings
   * Mapping structure: { [siteKey]: { [selector]: profileFieldKey } }
   * @returns {Promise<object>}
   */
  async getMappings() {
    const result = await this.get(AAM.CONSTANTS.STORAGE_MAPPINGS);
    return result[AAM.CONSTANTS.STORAGE_MAPPINGS] || {};
  },

  /**
   * Save a new field mapping for a site
   * @param {string} siteKey - hostname or ATS identifier
   * @param {string} selector - CSS selector for the form field
   * @param {string} profileKey - key from the profile schema
   * @returns {Promise<void>}
   */
  async saveMapping(siteKey, selector, profileKey) {
    const mappings = await this.getMappings();
    if (!mappings[siteKey]) {
      mappings[siteKey] = {};
    }
    mappings[siteKey][selector] = profileKey;
    return this.set({ [AAM.CONSTANTS.STORAGE_MAPPINGS]: mappings });
  },

  /**
   * Get mappings for a specific site
   * @param {string} siteKey
   * @returns {Promise<object>}
   */
  async getSiteMappings(siteKey) {
    const mappings = await this.getMappings();
    return mappings[siteKey] || {};
  },

  /**
   * Get extension settings
   * @returns {Promise<object>}
   */
  async getSettings() {
    const result = await this.get(AAM.CONSTANTS.STORAGE_SETTINGS);
    return result[AAM.CONSTANTS.STORAGE_SETTINGS] || {
      autoTrigger: false,
      highlightFilled: true,
      showOverlay: true,
    };
  },

  /**
   * Save extension settings
   * @param {object} settings
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    return this.set({ [AAM.CONSTANTS.STORAGE_SETTINGS]: settings });
  },
};

window.AAM = AAM;
