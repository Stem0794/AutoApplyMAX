/**
 * AutoApplyMAX — Learning Engine
 *
 * Tracks manual user inputs on form fields. When the form is submitted,
 * it attempts to match the manually-entered values to profile field keys
 * and saves the CSS selector → profile key mapping for future use.
 */
var AAM = window.AAM || {};

AAM.LearningEngine = {
  /** @type {Map<HTMLElement, {selector: string, value: string, timestamp: number}>} */
  _trackedInputs: new Map(),

  /** @type {boolean} */
  _listening: false,

  /** @type {string} */
  _siteKey: '',
  _handlers: null,

  /**
   * Start listening for manual user inputs on the page.
   * @param {string} siteKey - identifier for the current site (hostname)
   */
  start(siteKey) {
    if (this._listening) return;
    this._siteKey = siteKey;
    this._listening = true;

    // Listen for input events on the entire document
    this._handlers = {
      input: this._onInput.bind(this),
      change: this._onChange.bind(this),
      submit: this._onSubmit.bind(this),
      click: this._onButtonClick.bind(this),
    };
    document.addEventListener('input', this._handlers.input, true);
    document.addEventListener('change', this._handlers.change, true);
    document.addEventListener('submit', this._handlers.submit, true);
    document.addEventListener('click', this._handlers.click, true);

    console.log('[AutoApplyMAX] Learning engine started for:', siteKey);
  },

  /**
   * Stop listening.
   */
  stop() {
    if (!this._listening) return;
    document.removeEventListener('input', this._handlers.input, true);
    document.removeEventListener('change', this._handlers.change, true);
    document.removeEventListener('submit', this._handlers.submit, true);
    document.removeEventListener('click', this._handlers.click, true);
    this._handlers = null;
    this._listening = false;
  },

  /**
   * Handle input events — track manual changes on form fields
   * that were NOT autofilled by us.
   * @param {Event} e
   */
  _onInput(e) {
    if (!e.isTrusted) return;
    const el = e.target;
    if (!this._isTrackableField(el)) return;

    // Skip fields we already autofilled
    if (el.dataset.aamFilled === 'true') return;

    const selector = AAM.FieldDetector.buildSelector(el);
    const value = el.value || el.textContent || '';

    this._trackedInputs.set(el, {
      selector,
      signature: AAM.FieldDetector.buildSignature(el),
      value: value.trim(),
      timestamp: Date.now(),
    });

    // Optionally highlight manually-filled fields differently
    if (!el.dataset.aamTracked) {
      el.dataset.aamTracked = 'true';
    }
  },

  /**
   * Handle change events (important for <select> and date inputs).
   * @param {Event} e
   */
  _onChange(e) {
    this._onInput(e);
  },

  /**
   * Handle form submission — save learned mappings.
   * @param {Event} e
   */
  _onSubmit(e) {
    if (!e.isTrusted) return;
    this._processAndSaveMappings();
  },

  /**
   * Detect clicks on submit-like buttons.
   * @param {MouseEvent} e
   */
  _onButtonClick(e) {
    if (!e.isTrusted) return;
    const el = e.target.closest('button, input[type="submit"], [role="button"]');
    if (!el) return;

    const text = (el.textContent || el.value || '').toLowerCase();
    const submitKeywords = ['submit', 'apply', 'send', 'save', 'continue', 'next', 'confirm'];

    if (submitKeywords.some(kw => text.includes(kw))) {
      // Delay slightly to let the form submit
      setTimeout(() => this._processAndSaveMappings(), 500);
    }
  },

  /**
   * Check if an element is a trackable form field.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  _isTrackableField(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'email', 'tel', 'url', 'number', 'search', ''].includes(type);
    }
    return tag === 'textarea' || tag === 'select' ||
           el.getAttribute('contenteditable') === 'true' ||
           el.getAttribute('role') === 'textbox';
  },

  /**
   * Process tracked inputs, match them to profile fields,
   * and save the mappings.
   */
  async _processAndSaveMappings() {
    if (this._trackedInputs.size === 0) return;

    let profile;
    try {
      profile = await AAM.Storage.getProfile();
    } catch (err) {
      console.warn('[AutoApplyMAX] Could not load profile for learning:', err);
      return;
    }

    if (!profile || Object.keys(profile).length === 0) return;

    let savedCount = 0;

    for (const data of this._trackedInputs.values()) {
      const { selector, signature, value } = data;
      if (!value) continue;

      // Try to match the entered value to a profile field value
      const matchedKey = this._findProfileKeyByValue(value, profile);

      if (matchedKey) {
        if (!AAM.isProfileKey(matchedKey) || !AAM.PROFILE_MAP[matchedKey].autofillable) continue;
        try {
          await AAM.Storage.saveMapping(this._siteKey, selector, matchedKey, signature);
          savedCount++;
          console.log(
            `[AutoApplyMAX] Learned: "${selector}" → ${matchedKey} (on ${this._siteKey})`
          );
        } catch (err) {
          console.warn('[AutoApplyMAX] Failed to save mapping:', err);
        }
      }
    }

    if (savedCount > 0) {
      console.log(`[AutoApplyMAX] Saved ${savedCount} new field mapping(s) for ${this._siteKey}`);
    }

    // Clear tracked inputs
    this._trackedInputs.clear();
  },

  /**
   * Given a value the user typed, find which profile field it matches.
   * Uses exact matching first, then fuzzy substring matching.
   * @param {string} value
   * @param {object} profile
   * @returns {string|null} profile key or null
   */
  _findProfileKeyByValue(value, profile) {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return null;

    // Exact match
    for (const [key, profileValue] of Object.entries(profile)) {
      if (!profileValue) continue;
      const normalizedProfileValue = String(profileValue).trim().toLowerCase();
      if (normalizedProfileValue === normalizedValue) {
        return key;
      }
    }

    // Fuzzy match — check if profile value starts with or is contained in input value
    for (const [key, profileValue] of Object.entries(profile)) {
      if (!profileValue) continue;
      const pv = String(profileValue).trim().toLowerCase();
      if (pv.length > 3 && (normalizedValue.includes(pv) || pv.includes(normalizedValue))) {
        return key;
      }
    }

    return null;
  },
};

window.AAM = AAM;
