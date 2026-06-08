/**
 * Storage facade. Extension pages use trusted storage directly; content scripts
 * call the background broker using operation-specific messages.
 */
var AAM = window.AAM || {};

AAM.Storage = {
  _isExtensionPage() {
    return window.location.protocol === 'chrome-extension:';
  },

  async _operation(operation, payload = {}) {
    const response = await chrome.runtime.sendMessage({
      type: AAM.CONSTANTS.MSG.STORAGE_OPERATION,
      operation,
      ...payload,
    });
    if (response?.error) throw new Error(response.error);
    return response;
  },

  get(keys) {
    if (!this._isExtensionPage()) return Promise.reject(new Error('Direct storage access is unavailable'));
    return chrome.storage.local.get(keys);
  },

  set(data) {
    if (!this._isExtensionPage()) return Promise.reject(new Error('Direct storage access is unavailable'));
    return chrome.storage.local.set(data);
  },

  getProfile() {
    return this._operation('getProfile');
  },

  saveProfile(profile) {
    return this._operation('saveProfile', { profile });
  },

  getMappings() {
    return this._operation('getMappings');
  },

  saveMapping(siteKey, selector, profileKey, signature = '') {
    return this._operation('saveMapping', { siteKey, selector, profileKey, signature });
  },


  getSiteMappings(siteKey) {
    return this._operation('getSiteMappings', { siteKey });
  },

  getSettings() {
    return this._operation('getSettings');
  },

  saveSettings(settings) {
    return this._operation('saveSettings', { settings });
  },

  getAppliedJobs() {
    return this._operation('getAppliedJobs');
  },

  logAppliedJob(entry) {
    return this._operation('logAppliedJob', { entry });
  },

  clearAppliedJobs() {
    return this._operation('clearAppliedJobs');
  },

  deleteAppliedJob(index) {
    return this._operation('deleteAppliedJob', { index });
  },

  confirmAppliedJob(index) {
    return this._operation('confirmAppliedJob', { index });
  },

  clearMappings() {
    return this._operation('clearMappings');
  },
};

window.AAM = AAM;
