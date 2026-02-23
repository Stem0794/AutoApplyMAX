/**
 * AutoApplyMAX — Field Filler
 *
 * Takes the detected field mappings and a user profile,
 * then fills each form field with the corresponding profile value.
 * Dispatches native-like events so frameworks (React, Angular, etc.) pick up changes.
 */
var AAM = window.AAM || {};

AAM.FieldFiller = {
  /**
   * Set the value of a form element and dispatch realistic events.
   * @param {HTMLElement} el
   * @param {string} value
   */
  setNativeValue(el, value) {
    if (!value && value !== '') return;

    const tagName = el.tagName.toUpperCase();
    const role = el.getAttribute('role');
    const isContentEditable = el.getAttribute('contenteditable') === 'true';

    // Handle contenteditable / role-based textboxes that are not native inputs
    if ((isContentEditable || role === 'textbox' || role === 'combobox') && 
        tagName !== 'INPUT' && tagName !== 'TEXTAREA') {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Handle <select>
    if (tagName === 'SELECT') {
      this.setSelectValue(el, value);
      return;
    }

    // Handle standard input/textarea
    try {
      el.focus();
    } catch (e) {
      console.warn('[AutoApplyMAX] Could not focus element:', e);
    }

    // Use the native setter to bypass React's synthetic event system
    let setter = null;
    if (el instanceof HTMLInputElement) {
      setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    } else if (el instanceof HTMLTextAreaElement) {
      setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    }

    if (setter) {
      try {
        setter.call(el, value);
      } catch (e) {
        console.error('[AutoApplyMAX] Native setter failed:', e);
        el.value = value;
      }
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
      // Special handling for resume file
      if (profileKey === 'resumeFile') {
        const fileName = profile.resumeFileName;
        const fileContent = profile.resumeFileContent;

        if (fileName && fileContent) {
          // Programmatic file upload is generally not possible for security reasons.
          // Instead, we will notify the user and provide a download link.
          const messageDiv = document.createElement('div');
          messageDiv.className = 'aam-file-upload-message';
          messageDiv.style.cssText = `
            margin-top: 5px;
            padding: 8px;
            border: 1px solid #ffcc00;
            background-color: #fffacd;
            color: #333;
            font-size: 12px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          `;
          messageDiv.innerHTML = `
            <span>&#9888; Please manually upload your CV: <strong>${escapeHtml(fileName)}</strong></span>
            <button class="aam-download-btn" data-filename="${escapeHtml(fileName)}" data-filecontent="${escapeHtml(fileContent)}"
                    style="
                      background-color: #4CAF50;
                      color: white;
                      padding: 5px 10px;
                      border: none;
                      border-radius: 3px;
                      cursor: pointer;
                      font-size: 11px;
                      margin-left: 10px;
                    ">Download</button>
          `;

          element.parentNode.insertBefore(messageDiv, element.nextSibling);

          messageDiv.querySelector('.aam-download-btn').addEventListener('click', (event) => {
            const btn = event.target;
            const dlFileName = btn.dataset.filename;
            const dlFileContent = btn.dataset.filecontent;
            if (dlFileName && dlFileContent) {
              const link = document.createElement('a');
              link.href = dlFileContent; // Base64 content directly as href
              link.download = dlFileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          });
          skipped++; // Mark as skipped for autofill, as user interaction is needed
          continue; // Skip further processing for this field
        } else {
          skipped++;
          continue;
        }
      }

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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.AAM = AAM;
