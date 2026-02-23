/**
 * AutoApplyMAX — Heuristic Field Detection Engine
 *
 * Scans the DOM for form fields and uses fuzzy matching to determine
 * which profile field each form element corresponds to.
 */
var AAM = window.AAM || {};

AAM.FieldDetector = {
  /**
   * Gather all fillable form elements on the page.
   * @returns {HTMLElement[]}
   */
  getFormFields() {
    const selectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="url"]',
      'input[type="number"]',
      'input[type="search"]',
      'input[type="file"]', // Added to detect file upload inputs
      'input:not([type])',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[role="combobox"]',
    ];

    const fields = document.querySelectorAll(selectors.join(', '));
    // Filter out hidden, disabled, or very small fields
    return Array.from(fields).filter(el => {
      if (el.disabled || el.readOnly) return false;
      if (el.type === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
  },

  /**
   * Extract contextual text clues from a form field's surroundings.
   * Returns a combined string of label text, name, id, placeholder, aria-label, etc.
   * @param {HTMLElement} field
   * @returns {string}
   */
  getFieldContext(field) {
    const parts = [];

    // 1. Direct attributes (highly specific)
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);
    if (field.placeholder) parts.push(field.placeholder);

    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) parts.push(ariaLabel);

    const ariaLabelledBy = field.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl) parts.push(labelEl.textContent.trim());
    }

    if (field.title) parts.push(field.title);
    if (field.getAttribute('autocomplete')) parts.push(field.getAttribute('autocomplete'));

    // 2. Associated <label> via 'for' attribute
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) parts.push(label.textContent.trim());
    }

    // 3. Parent label wrapping the field
    const parentLabel = field.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent.trim());

    // 4. Closest preceding label-like element
    // This is often more accurate than gathering all siblings
    let prev = field.previousElementSibling;
    while (prev) {
      const tag = prev.tagName.toLowerCase();
      if (['label', 'span', 'div', 'p', 'h3', 'h4'].includes(tag)) {
        const text = prev.textContent.trim();
        if (text && text.length < 50) {
          parts.push(text);
          break; // Only take the closest one
        }
      }
      prev = prev.previousElementSibling;
    }

    // 5. Parent's preceding sibling (common for table-like layouts)
    const parent = field.parentElement;
    if (parent && !parentLabel) {
      let parentPrev = parent.previousElementSibling;
      while (parentPrev) {
        const text = parentPrev.textContent.trim();
        if (text && text.length < 50) {
          parts.push(text);
          break;
        }
        parentPrev = parentPrev.previousElementSibling;
      }
    }

    // 6. Closest fieldset legend
    const fieldset = field.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) parts.push(legend.textContent.trim());
    }

    return parts.join(' ').toLowerCase();
  },

  /**
  * Score how well a context string matches a profile field definition.
  * @param {string} context - the lowercase context string
  * @param {object} fieldDef - a profile field definition from PROFILE_FIELDS
  * @param {HTMLElement} field - the actual DOM element
  * @returns {number} - confidence score 0..1
  */
  scoreMatch(context, fieldDef, field) {
    let score = 0;
    const ctx = context.toLowerCase();

    // Keyword match
    for (const keyword of fieldDef.keywords) {
      const kw = keyword.toLowerCase();
      // For short keywords (<= 4 chars), use word boundary check to avoid partial matches
      if (kw.length <= 4) {
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(ctx)) {
          // Boost if it's an exact match in context
          score = Math.max(score, ctx === kw ? 0.75 : 0.65);
        }
      } else if (ctx.includes(kw)) {
        // Longer keywords are more specific, give more weight
        let weight = 0.6 + (kw.length / 50);

        // Multi-word keywords get a significant boost
        if (kw.includes(' ')) weight += 0.15;

        score = Math.max(score, weight);
      }
    }

    // Special case for phone country code (e.g., +XX)
    // If the field is a combobox/dropdown near "phone" or "mobile"
    if (fieldDef.key === 'phoneCountryCode') {
      const isDropdown = field.tagName === 'SELECT' ||
        field.getAttribute('role') === 'combobox' ||
        field.closest('lyte-dropdown');

      if (isDropdown && (ctx.includes('mobile') || ctx.includes('phone'))) {
        score = Math.max(score, 0.85);
      }

      // If the context contains a '+' as a standalone word or prefix
      if (/\+/.test(ctx)) {
        score = Math.max(score, 0.7);
      }
    }

    // Regex alias match
    for (const regex of fieldDef.aliases) {
      if (regex.test(ctx)) {
        score = Math.max(score, 0.75);
      }
    }

    // autocomplete attribute match
    const autocompleteMap = {
      'given-name': 'firstName',
      'family-name': 'lastName',
      'name': 'fullName',
      'email': 'email',
      'tel': 'phone',
      'street-address': 'address',
      'address-level2': 'city',
      'address-level1': 'state',
      'postal-code': 'zip',
      'country-name': 'country',
      'organization': 'currentCompany',
      'url': 'portfolioUrl',
    };

    // Check autocomplete in context
    for (const [autoVal, profileKey] of Object.entries(autocompleteMap)) {
      if (ctx.includes(autoVal) && profileKey === fieldDef.key) {
        score = Math.max(score, 0.95);
      }
    }

    return Math.min(score, 1);
  },

  /**
   * Build a unique CSS selector for an element.
   * @param {HTMLElement} el
   * @returns {string}
   */
  buildSelector(el) {
    // Try ID first
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }

    // Try name attribute
    if (el.name) {
      const byName = document.querySelectorAll(`[name="${CSS.escape(el.name)}"]`);
      if (byName.length === 1) {
        return `[name="${CSS.escape(el.name)}"]`;
      }
    }

    // Try data-automation-id (common in Workday)
    const autoId = el.getAttribute('data-automation-id');
    if (autoId) {
      return `[data-automation-id="${CSS.escape(autoId)}"]`;
    }

    // Fall back to nth-child path
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(selector);
      current = parent;
    }
    return path.join(' > ');
  },

  /**
   * Detect all form fields and return a mapping of each field to its
   * best-matching profile key + confidence score.
   *
   * @param {object} [siteMappings] - previously learned mappings for this site
   * @returns {Array<{element: HTMLElement, selector: string, profileKey: string|null, confidence: number, context: string}>}
   */
  detectFields(siteMappings = {}) {
    const fields = this.getFormFields();
    const results = [];

    for (const field of fields) {
      const selector = this.buildSelector(field);
      const context = this.getFieldContext(field);

      // Check learned mappings first
      if (siteMappings[selector]) {
        results.push({
          element: field,
          selector,
          profileKey: siteMappings[selector],
          confidence: 1.0, // learned mapping = full confidence
          context,
          source: 'learned',
        });
        continue;
      }

      // Heuristic matching
      let bestKey = null;
      let bestScore = 0;

      for (const fieldDef of AAM.PROFILE_FIELDS) {
        const score = this.scoreMatch(context, fieldDef, field);
        if (score > bestScore) {
          bestScore = score;
          bestKey = fieldDef.key;
        }
      }

      if (bestScore >= AAM.CONSTANTS.CONFIDENCE_LOW) {
        console.log(`[AutoApplyMAX] Match: ${bestKey} (${Math.round(bestScore * 100)}%) for selector: ${selector}`);
        console.debug(`  Context: "${context}"`);
      }

      results.push({
        element: field,
        selector,
        profileKey: bestScore >= AAM.CONSTANTS.CONFIDENCE_LOW ? bestKey : null,
        confidence: bestScore,
        context,
        source: bestScore >= AAM.CONSTANTS.CONFIDENCE_LOW ? 'heuristic' : 'unmatched',
      });
    }

    return results;
  },
};

window.AAM = AAM;
