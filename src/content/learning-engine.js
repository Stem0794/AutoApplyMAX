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

  /**
   * Start listening for manual user inputs on the page.
   * @param {string} siteKey - identifier for the current site (hostname)
   */
  start(siteKey) {
    if (this._listening) return;
    this._siteKey = siteKey;
    this._listening = true;

    // Listen for input events on the entire document
    document.addEventListener('input', this._onInput.bind(this), true);
    document.addEventListener('change', this._onChange.bind(this), true);

    // Listen for form submissions
    document.addEventListener('submit', this._onSubmit.bind(this), true);

    // Also watch for click on common submit buttons
    document.addEventListener('click', this._onButtonClick.bind(this), true);

    console.log('[AutoApplyMAX] Learning engine started for:', siteKey);
  },

  /**
   * Stop listening.
   */
  stop() {
    if (!this._listening) return;
    document.removeEventListener('input', this._onInput.bind(this), true);
    document.removeEventListener('change', this._onChange.bind(this), true);
    document.removeEventListener('submit', this._onSubmit.bind(this), true);
    document.removeEventListener('click', this._onButtonClick.bind(this), true);
    this._listening = false;
  },

  /**
   * Handle input events — track manual changes on form fields
   * that were NOT autofilled by us.
   * @param {Event} e
   */
  _onInput(e) {
    const el = e.target;
    if (!this._isTrackableField(el)) return;

    // Skip fields we already autofilled
    if (el.dataset.aamFilled === 'true') return;

    const selector = AAM.FieldDetector.buildSelector(el);
    const value = el.value || el.textContent || '';

    this._trackedInputs.set(el, {
      selector,
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
    this._processAndSaveMappings();
  },

  /**
   * Detect clicks on submit-like buttons.
   * @param {MouseEvent} e
   */
  _onButtonClick(e) {
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

    for (const [el, data] of this._trackedInputs) {
      const { selector, value } = data;
      if (!value) continue;

      // Try to match the entered value to a profile field value
      const matchedKey = this._findProfileKeyByValue(value, profile);

      if (matchedKey) {
        try {
          await AAM.Storage.saveMapping(this._siteKey, selector, matchedKey);
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
