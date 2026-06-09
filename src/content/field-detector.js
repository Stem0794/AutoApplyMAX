/**
 * AutoApplyMAX — Heuristic Field Detection Engine
 *
 * Scans the DOM for form fields and uses fuzzy matching to determine
 * which profile field each form element corresponds to.
 */
var AAM = window.AAM || {};

AAM.FieldDetector = {
  /**
   * Gather all fillable form elements on the page, including those inside Shadow DOMs.
   * @returns {HTMLElement[]}
   */
  getFormFields() {
    const selectors = [
      'input[type="text"]', 'input[type="email"]', 'input[type="tel"]', 'input[type="url"]',
      'input[type="number"]', 'input[type="search"]', 'input[type="file"]',
      'input[type="date"]', 'input[type="month"]',
      'input[type="checkbox"]', 'input[type="radio"]',
      'input:not([type])',
      'textarea', 'select', '[contenteditable="true"]', '[role="textbox"]', '[role="combobox"]',
    ].join(', ');

    const seen = new WeakSet();
    const allFields = [];

    function traverse(root) {
      if (!root) return;
      root.querySelectorAll(selectors).forEach(node => {
        if (!seen.has(node)) { seen.add(node); allFields.push(node); }
      });
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) traverse(el.shadowRoot);
      });
    }

    traverse(document);

    return allFields.filter(el => {
      if (el.dataset?.aamIgnore === 'true') return false;
      if (el.disabled || el.readOnly) return false;
      if (el.type === 'hidden') return false;
      if (el.tagName === 'INPUT' && el.type === 'file') return true;
      // Checkboxes/radios can be tiny — only check visibility
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      }
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

    // 1. Direct attributes
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);
    if (field.placeholder) parts.push(field.placeholder);

    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) parts.push(ariaLabel);

    const ariaLabelledBy = field.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      for (const id of ariaLabelledBy.split(/\s+/)) {
        const el = document.getElementById(id);
        if (el) parts.push(el.textContent.trim());
      }
    }

    const ariaDescribedBy = field.getAttribute('aria-describedby');
    if (ariaDescribedBy) {
      for (const id of ariaDescribedBy.split(/\s+/)) {
        const el = document.getElementById(id);
        if (el) {
          const t = el.textContent.trim();
          if (t.length < 100) parts.push(t);
        }
      }
    }

    if (field.title) parts.push(field.title);
    if (field.getAttribute('autocomplete')) parts.push(field.getAttribute('autocomplete'));

    // 2. Semantic data-* attributes common in modern ATS
    for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-label', 'data-field-name', 'data-key', 'data-field']) {
      const v = field.getAttribute(attr);
      if (v) parts.push(v.replace(/[-_]/g, ' '));
    }

    // 3. Associated <label> via 'for' attribute
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) parts.push(label.textContent.trim());
    }

    // 4. Parent label wrapping the field
    const parentLabel = field.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent.trim());

    // 5. Walk up to 3 ancestor levels looking for preceding label-like siblings
    //    and data-* attributes on container elements.
    let el = field;
    let labelFound = false;
    for (let depth = 0; depth < 3 && el; depth++) {
      // data-* on ancestor containers (e.g., Workday wraps fields in labeled divs)
      for (const attr of ['data-field-name', 'data-key', 'data-qa', 'data-testid', 'data-label']) {
        const v = el.getAttribute(attr);
        if (v) parts.push(v.replace(/[-_]/g, ' '));
      }
      // Closest preceding sibling that looks like a label
      if (!labelFound) {
        let prev = el.previousElementSibling;
        while (prev) {
          const tag = prev.tagName.toLowerCase();
          if (['label', 'span', 'div', 'p', 'h3', 'h4', 'h5', 'th', 'dt'].includes(tag)) {
            const text = prev.textContent.trim();
            if (text && text.length < 80) {
              parts.push(text);
              labelFound = true;
              break;
            }
          }
          prev = prev.previousElementSibling;
        }
      }
      el = el.parentElement;
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
   * Get a human-readable label for the field to show in the UI.
   * @param {HTMLElement} field
   * @returns {string}
   */
  getDisplayLabel(field) {
    // 1. Associated <label>
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label && label.textContent.trim()) return label.textContent.trim();
    }
    // 2. Parent label
    const parentLabel = field.closest('label');
    if (parentLabel && parentLabel.textContent.trim()) {
      return parentLabel.textContent.replace(field.textContent, '').trim();
    }
    // 3. aria-label
    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 4. aria-labelledby (multi-ID support)
    const ariaLabelledBy = field.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const texts = ariaLabelledBy.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent.trim())
        .filter(Boolean);
      if (texts.length) return texts.join(' ');
    }

    // 5. placeholder
    if (field.placeholder) return field.placeholder;

    // 6. Closest preceding text
    let prev = field.previousElementSibling;
    if (prev && prev.textContent.trim() && prev.textContent.trim().length < 50) {
      return prev.textContent.trim();
    }

    // 7. data-label / data-field-name
    const dataLabel = field.getAttribute('data-label') || field.getAttribute('data-field-name');
    if (dataLabel) return dataLabel.replace(/[-_]/g, ' ');

    // 8. Name or ID as last resort (cleaned up)
    const raw = field.getAttribute('name') || field.id || '';
    if (raw) {
      return raw.replace(/rec-form_/, '').replace(/[-_]/g, ' ').trim();
    }

    return 'Unnamed Field';
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

    // Disambiguate firstName / lastName / fullName
    if (fieldDef.key === 'firstName') {
      if (/\b(last|sur|family|apellido|nachname|cognome)\b/.test(ctx)) score = Math.min(score, 0.1);
      if (/\bfull[\s_-]?(name|nom|nombre)\b/.test(ctx)) score = Math.min(score, 0.15);
    }
    if (fieldDef.key === 'lastName') {
      if (/\b(first|given|prénom|prenom|vorname)\b/.test(ctx) && !/\b(last|sur|family)\b/.test(ctx)) {
        score = Math.min(score, 0.1);
      }
      if (/\bfull[\s_-]?(name|nom|nombre)\b/.test(ctx)) score = Math.min(score, 0.15);
    }
    if (fieldDef.key === 'fullName') {
      if (/\b(first name|last name|given name|surname)\b/.test(ctx) && !/\bfull\b/.test(ctx)) {
        score = Math.min(score, 0.1);
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

    // Check actual autocomplete attribute
    const autocompleteAttr = (field.getAttribute('autocomplete') || '').toLowerCase();
    const autocompleteTokens = autocompleteAttr.split(/\s+/);

    for (const [autoVal, profileKey] of Object.entries(autocompleteMap)) {
      if (autocompleteTokens.includes(autoVal) && profileKey === fieldDef.key) {
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

    // Try test/QA id attributes common across ATS platforms
    for (const attr of ['data-testid', 'data-test-id', 'data-qa', 'data-cy']) {
      const v = el.getAttribute(attr);
      if (v) {
        const matches = document.querySelectorAll(`[${attr}="${CSS.escape(v)}"]`);
        if (matches.length === 1) return `[${attr}="${CSS.escape(v)}"]`;
      }
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

  buildSignature(field, displayLabel = this.getDisplayLabel(field)) {
    const normalize = value => String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N} @.+_-]/gu, '')
      .trim()
      .slice(0, 120);
    return JSON.stringify({
      v: 1,
      tag: field.tagName.toLowerCase(),
      type: normalize(field.getAttribute('type')),
      autocomplete: normalize(field.getAttribute('autocomplete')),
      name: normalize(field.getAttribute('name')),
      label: normalize(displayLabel),
    });
  },

  /**
   * Detect all form fields and return a mapping of each field to its
   * best-matching profile key + confidence score.
   *
   * @param {object} [siteMappings] - previously learned mappings for this site
   * @returns {Array<{element: HTMLElement, selector: string, profileKey: string|null, confidence: number, context: string}>}
   */
  detectFields(siteMappings = {}, knownMappings = []) {
    const fields = this.getFormFields();
    const results = [];
    const seenSelectors = new Set();
    const localMappings = siteMappings.localMappings || {};
    const communityMappings = siteMappings.communityMappings || {};

    for (const field of fields) {
      const selector = this.buildSelector(field);
      // Deduplicate: the same element might appear via both document and Shadow DOM traversal
      if (seenSelectors.has(selector)) continue;
      seenSelectors.add(selector);
      const displayLabel = this.getDisplayLabel(field);
      if (
        /(?:do not|don't|dont)\s+open\s+(?:the\s+)?sidebar/i.test(displayLabel) ||
        field.closest('#aam-overlay')
      ) {
        continue;
      }
      const signature = this.buildSignature(field, displayLabel);

      const localMapping = localMappings[selector];
      if (localMapping && AAM.isProfileKey(localMapping.profileKey)) {
        results.push({
          element: field,
          selector,
          signature,
          profileKey: localMapping.profileKey,
          confidence: 1.0,
          context: displayLabel.toLowerCase(),
          displayLabel,
          source: 'learned',
        });
        continue;
      }

      const knownMapping = knownMappings.find(mapping => {
        try {
          return AAM.isProfileKey(mapping.profileKey) && field.matches(mapping.selector);
        } catch {
          return false;
        }
      });
      if (knownMapping) {
        results.push({
          element: field,
          selector,
          signature,
          profileKey: knownMapping.profileKey,
          confidence: 0.95,
          context: displayLabel.toLowerCase(),
          displayLabel,
          source: 'adapter',
        });
        continue;
      }

      let bestKey = null;
      let bestScore = 0;
      const context = this.getFieldContext(field);

      for (const fieldDef of AAM.PROFILE_FIELDS) {
        const score = this.scoreMatch(context, fieldDef, field);
        if (score > bestScore) {
          bestScore = score;
          bestKey = fieldDef.key;
        }
      }

      const communityMapping = communityMappings[signature];
      if (communityMapping && AAM.isCloudMappableProfileKey(communityMapping.profileKey)) {
        const communityDefinition = AAM.PROFILE_MAP[communityMapping.profileKey];
        const semanticScore = this.scoreMatch(context, communityDefinition, field);
        const requiresSemanticAgreement = communityDefinition.sensitivity === 'sensitive';
        if (!requiresSemanticAgreement || semanticScore >= AAM.CONSTANTS.CONFIDENCE_LOW) {
          bestKey = communityMapping.profileKey;
          bestScore = Math.max(semanticScore, 0.75);
        }
      }

      results.push({
        element: field,
        selector,
        signature,
        profileKey: bestScore >= AAM.CONSTANTS.CONFIDENCE_LOW ? bestKey : null,
        confidence: bestScore,
        context,
        displayLabel,
        source: communityMapping && bestKey === communityMapping.profileKey
          ? 'community'
          : (bestScore >= AAM.CONSTANTS.CONFIDENCE_LOW ? 'heuristic' : 'unmatched'),
      });
    }

    return results;
  },
};

window.AAM = AAM;
