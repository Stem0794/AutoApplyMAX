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

    // Direct attributes
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);
    if (field.placeholder) parts.push(field.placeholder);
    if (field.getAttribute('aria-label')) parts.push(field.getAttribute('aria-label'));
    if (field.getAttribute('aria-labelledby')) {
      const labelEl = document.getElementById(field.getAttribute('aria-labelledby'));
      if (labelEl) parts.push(labelEl.textContent.trim());
    }
    if (field.getAttribute('data-automation-id')) parts.push(field.getAttribute('data-automation-id'));
    if (field.getAttribute('data-testid')) parts.push(field.getAttribute('data-testid'));
    if (field.title) parts.push(field.title);
    if (field.getAttribute('autocomplete')) parts.push(field.getAttribute('autocomplete'));

    // Associated <label>
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) parts.push(label.textContent.trim());
    }

    // Parent label wrapping the field
    const parentLabel = field.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent.trim());

    // Nearby preceding sibling or parent text
    const parent = field.parentElement;
    if (parent) {
      // Look for a label-like element nearby
      const siblings = parent.querySelectorAll('label, span, div, p, h3, h4, legend');
      siblings.forEach(sib => {
        if (sib !== field && sib.textContent.trim().length < 80) {
          parts.push(sib.textContent.trim());
        }
      });
    }

    // Also check the field's closest fieldset/legend
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
   * @returns {number} - confidence score 0..1
   */
  scoreMatch(context, fieldDef) {
    let score = 0;
    const ctx = context.toLowerCase();

    // Exact keyword match (highest weight)
    for (const keyword of fieldDef.keywords) {
      if (ctx.includes(keyword)) {
        // Longer keywords are more specific, give more weight
        score = Math.max(score, 0.6 + (keyword.length / 50));
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
        const score = this.scoreMatch(context, fieldDef);
        if (score > bestScore) {
          bestScore = score;
          bestKey = fieldDef.key;
        }
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
