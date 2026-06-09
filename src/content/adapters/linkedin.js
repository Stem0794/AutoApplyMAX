/**
 * AutoApplyMAX — LinkedIn Adapter
 *
 * Handles LinkedIn Easy Apply and standard application forms.
 * LinkedIn uses a multi-step modal for Easy Apply.
 */
var AAM = window.AAM || {};

const LinkedInAdapter = Object.assign({}, AAM.AdapterBase, {
  name: 'LinkedIn',

  matches() {
    return AAM.hostMatches('linkedin.com');
  },

  getSiteKey() {
    return 'linkedin.com';
  },

  async prepare() {
    // LinkedIn Easy Apply forms are in modals — wait for the modal to be present
    const modal = await this.waitForElement(
      '.jobs-easy-apply-modal, .jobs-apply-form, [data-test-modal]',
      3000
    );
    if (!modal) return;

    // Expand any collapsed sections
    const expandButtons = document.querySelectorAll(
      '.jobs-easy-apply-form-section__grouping-toggle, ' +
      'button[aria-label="Show more"]'
    );
    for (const btn of expandButtons) {
      if (btn.getAttribute('aria-expanded') === 'false') {
        btn.click();
      }
    }
  },

  getKnownMappings() {
    return [
      // LinkedIn Easy Apply known field patterns
      { selector: 'input[name="firstName"]', profileKey: 'firstName' },
      { selector: 'input[name="lastName"]', profileKey: 'lastName' },
      { selector: 'input[name="email"]', profileKey: 'email' },
      { selector: 'input[name="phone"]', profileKey: 'phone' },
      { selector: 'input[name="phoneNumber"]', profileKey: 'phone' },
      { selector: 'input[id*="phoneNumber"]', profileKey: 'phone' },
      { selector: 'input[id*="city"]', profileKey: 'city' },
      { selector: '[data-test-text-entity-list-form-component] input', profileKey: 'skills' },
    ];
  },

});

AAM.registerAdapter(LinkedInAdapter);

window.AAM = AAM;
