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

    // Safety check: Browsers prevent programmatically setting the value of file inputs
    if (el instanceof HTMLInputElement && el.type === 'file') {
      console.warn('[AutoApplyMAX] Skipping native value set on file input.');
      return;
    }

    // Handle checkboxes: value is a boolean (true = tick it)
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.dataset.aamFilled = 'true';
      const shouldCheck = value === true || value === 'true' || value === '1' || value === 'yes';
      el.checked = shouldCheck;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    el.dataset.aamFilled = 'true';
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
   * @returns {Promise<{filled: number, skipped: number, unmatched: number, filledFields: Array}>}
   */
  async fillFields(detectedFields, profile, settings = {}) {
    let filled = 0;
    let skipped = 0;
    let unmatched = 0;
    const filledFields = [];
    const adapter = AAM.getAdapter();

    for (const detection of detectedFields) {
      const { element, profileKey, confidence, selector, displayLabel } = detection;

      // Skip unmatched fields
      if (!profileKey || confidence < AAM.CONSTANTS.CONFIDENCE_LOW) {
        detection.status = 'unmatched';
        unmatched++;
        continue;
      }

      // Get the profile value
      // Special handling for file uploads (resume, portfolio, etc.)
      const isFileInput = element instanceof HTMLInputElement && element.type === 'file';
      if (profileKey === 'resumeFile' || isFileInput) {
        const resumeAsset = profile.resumeAsset;
        let fileName = resumeAsset?.name || 'resume.pdf';

        // Smarter file renaming based on profile data and field context
        if (profile.firstName && profile.lastName) {
          const cleanFirst = profile.firstName.trim().replace(/[^a-zA-Z]/g, '');
          const cleanLast = profile.lastName.trim().replace(/[^a-zA-Z]/g, '');
          const labelContext = (displayLabel || 'Resume').replace(/[^a-zA-Z]/g, '');
          const docType = labelContext.length > 0 ? labelContext : 'Document';
          const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.pdf';

          if (cleanFirst && cleanLast) {
            fileName = `${cleanFirst}_${cleanLast}_${docType}${ext}`;
          }
        }

        if (fileName && resumeAsset?.id) {
          detection.status = 'manual_file';
          // Programmatic file upload is generally not possible for security reasons.
          // We provide a premium "Manual Upload Helper"
          const helperId = `aam-helper-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`;
          if (document.getElementById(helperId)) continue; // Don't duplicate

          const helper = document.createElement('div');
          helper.id = helperId;
          helper.className = 'aam-file-upload-helper';
          // ... (style omitted for brevity in replacement, but I will keep it)
          helper.style.cssText = `
            margin: 12px 0;
            padding: 16px;
            background: #f8faff;
            border: 1px dashed #2563eb;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
            display: flex;
            flex-direction: column;
            gap: 10px;
            animation: aamFadeIn 0.3s ease-out;
          `;

          const fieldName = escapeHtml(displayLabel || 'CV/Resume');
          helper.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">📎</span>
              <span style="font-weight: 700; color: #1e293b; font-size: 14px;">Manual ${fieldName} Upload Required</span>
            </div>
            <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.4;">
              Browsers block automatic file uploads for security. Download your file below and then click <strong>Browse</strong> to upload it.
            </p>
            <div style="display: flex; align-items: center; justify-content: space-between; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span style="font-family: monospace; font-size: 12px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                ${escapeHtml(fileName)}
              </span>
              <button class="aam-download-btn"
                      style="
                        background: #2563eb;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 6px;
                        font-weight: 600;
                        font-size: 12px;
                        cursor: pointer;
                        transition: background 0.2s;
                      ">Download File</button>
            </div>
          `;

          // Placement: If the input is hidden, try to find the nearest visible parent or sibling
          let target = element;
          if (window.getComputedStyle(element).display === 'none' || element.type === 'hidden') {
            target = element.closest('.rec-form-field, .field-wrapper, .form-group') || element.parentNode;
          }

          if (target && target.parentNode) {
            target.parentNode.insertBefore(helper, target.nextSibling);
          }

          helper.querySelector('.aam-download-btn').addEventListener('click', async (event) => {
            if (!event.isTrusted) return;
            const btn = event.currentTarget;
            try {
              const response = await chrome.runtime.sendMessage({
                type: AAM.CONSTANTS.MSG.DOWNLOAD_RESUME,
                assetId: resumeAsset.id,
                filename: fileName,
              });
              if (response?.error) throw new Error(response.error);
              btn.textContent = 'Downloaded!';
              btn.style.background = '#16a34a';
              setTimeout(() => {
                btn.textContent = 'Download File';
                btn.style.background = '#2563eb';
              }, 3000);
            } catch (error) {
              console.warn('[AutoApplyMAX] Resume download failed:', error);
              btn.textContent = 'Download failed';
            }
          });

          skipped++;
          detection.status = 'skipped_file';
          continue;
        } else {
          detection.status = 'skipped_file_no_content';
          skipped++;
          continue;
        }
      }

      const value = profile[profileKey];
      const isCheckbox = element instanceof HTMLInputElement && element.type === 'checkbox';
      if (!isCheckbox && !value) {
        detection.status = 'missing_value';
        skipped++;
        continue;
      }

      // Skip if already filled with the same value
      if (isCheckbox) {
        const shouldCheck = value === true || value === 'true';
        if (element.checked === shouldCheck) {
          detection.status = 'skipped_already_filled';
          skipped++;
          continue;
        }
      } else {
        const currentValue = element.value || element.textContent || '';
        if (currentValue.trim() === String(value).trim()) {
          detection.status = 'skipped_already_filled';
          skipped++;
          continue;
        }
      }

      const fieldDefinition = AAM.PROFILE_MAP[profileKey];
      if (!fieldDefinition?.autofillable) {
        detection.status = 'not_autofillable';
        skipped++;
        continue;
      }
      if (fieldDefinition.requiresConfirmation) {
        detection.status = 'requires_confirmation';
        detection.pendingValue = value;
        skipped++;
        continue;
      }

      // Fill the field (check for adapter-specific override first)
      let fieldFilled = false;
      if (adapter && typeof adapter.fillField === 'function') {
        fieldFilled = await adapter.fillField(element, profileKey, value);
      }

      if (!fieldFilled) {
        this.setNativeValue(element, value);
        fieldFilled = true;
      }

      detection.status = 'filled';
      filled++;

      // Highlight the filled field
      element.dataset.aamFilled = 'true';
      element.dataset.aamProfileKey = profileKey;
      if (settings.highlightFilled !== false) {
        element.style.backgroundColor = AAM.CONSTANTS.HIGHLIGHT_COLOR;
        element.style.borderColor = AAM.CONSTANTS.HIGHLIGHT_BORDER;
        element.style.transition = 'background-color 0.3s, border-color 0.3s';
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

  async fillConfirmedField(detection) {
    if (!detection?.element || typeof detection.pendingValue !== 'string') return false;
    const definition = AAM.PROFILE_MAP[detection.profileKey];
    if (!definition?.requiresConfirmation) return false;
    const adapter = AAM.getAdapter();
    detection.element.dataset.aamFilled = 'true';
    detection.element.dataset.aamProfileKey = detection.profileKey;
    let filled = false;
    if (adapter && typeof adapter.fillField === 'function') {
      filled = await adapter.fillField(
        detection.element,
        detection.profileKey,
        detection.pendingValue
      );
    }
    if (!filled) this.setNativeValue(detection.element, detection.pendingValue);
    detection.status = 'filled_confirmed';
    delete detection.pendingValue;
    return true;
  },
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

window.AAM = AAM;
