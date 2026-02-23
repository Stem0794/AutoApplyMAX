/**
 * AutoApplyMAX — Field Filler
 *
 * Takes the detected field mappings and a user profile,
 * then fills each form field with the corresponding profile value.
 * Dispatches native-like events so frameworks (React, Angular, etc.) pick up changes.
 */
const AAM = window.AAM || {};

AAM.FieldFiller = {
  /**
   * Set the value of a form element and dispatch realistic events.
   * @param {HTMLElement} el
   * @param {string} value
   */
  setNativeValue(el, value) {
    if (!value && value !== '') return;

    // Handle contenteditable / role=textbox
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Handle <select>
    if (el.tagName === 'SELECT') {
      this.setSelectValue(el, value);
      return;
    }

    // Handle standard input/textarea
    el.focus();

    // Use the native setter to bypass React's synthetic event system
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const setter = el.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }

    // Dispatch events that frameworks listen for
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  },

  /**
   * Try to set a <select> to a matching option.
   * @param {HTMLSelectElement} el
   * @param {string} value
   */
  setSelectValue(el, value) {
    const lowerVal = value.toLowerCase();
    let matched = false;

    for (const option of el.options) {
      const optText = option.textContent.trim().toLowerCase();
      const optVal = option.value.toLowerCase();
      if (optText === lowerVal || optVal === lowerVal ||
          optText.includes(lowerVal) || lowerVal.includes(optText)) {
        el.value = option.value;
        matched = true;
        break;
      }
    }

    if (matched) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  /**
   * Fill all detected fields with profile data.
   * @param {Array} detectedFields - output from FieldDetector.detectFields()
   * @param {object} profile - user profile data
   * @param {object} settings - extension settings
   * @returns {{filled: number, skipped: number, unmatched: number, filledFields: Array}}
   */
  fillFields(detectedFields, profile, settings = {}) {
    let filled = 0;
    let skipped = 0;
    let unmatched = 0;
    const filledFields = [];

    for (const detection of detectedFields) {
      const { element, profileKey, confidence, selector } = detection;

      // Skip unmatched fields
      if (!profileKey || confidence < AAM.CONSTANTS.CONFIDENCE_LOW) {
        unmatched++;
        continue;
      }

      // Get the profile value
      const value = profile[profileKey];
      if (!value) {
        skipped++;
        continue;
      }

      // Skip if already filled with the same value
      const currentValue = element.value || element.textContent || '';
      if (currentValue.trim() === value.trim()) {
        skipped++;
        continue;
      }

      // Fill the field
      this.setNativeValue(element, value);
      filled++;

      // Highlight the filled field
      if (settings.highlightFilled !== false) {
        element.style.backgroundColor = AAM.CONSTANTS.HIGHLIGHT_COLOR;
        element.style.borderColor = AAM.CONSTANTS.HIGHLIGHT_BORDER;
        element.style.transition = 'background-color 0.3s, border-color 0.3s';
        element.dataset.aamFilled = 'true';
        element.dataset.aamProfileKey = profileKey;
      }

      filledFields.push({
        selector,
        profileKey,
        confidence,
        source: detection.source,
      });
    }

    return { filled, skipped, unmatched, filledFields };
  },
};

window.AAM = AAM;
