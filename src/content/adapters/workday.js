/**
 * AutoApplyMAX — Workday Adapter
 *
 * Handles Workday application forms.
 * Workday is notoriously complex with dynamic rendering,
 * shadow DOM-like structures, and data-automation-id attributes.
 */
var AAM = window.AAM || {};

const WorkdayAdapter = Object.assign({}, AAM.AdapterBase, {
  name: 'Workday',

  matches() {
    return AAM.CONSTANTS.ATS_HOSTS.WORKDAY.some(
      h => window.location.hostname.includes(h)
    );
  },

  getSiteKey() {
    return 'workday.com';
  },

  async prepare() {
    // Workday forms are heavily JS-rendered. Wait for the main container.
    await this.waitForElement(
      '[data-automation-id="jobApplicationContainer"], ' +
      '[data-automation-id="compositeContainer"], ' +
      '.css-1dbjc4n',
      5000
    );

    // Wait a bit extra for Workday's dynamic rendering
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Try to expand any collapsed sections
    const expandButtons = document.querySelectorAll(
      '[data-automation-id="expandButton"], ' +
      '[data-automation-id="toggleButton"], ' +
      'button[aria-expanded="false"]'
    );
    for (const btn of expandButtons) {
      await this.clickAndWait(btn, 500);
    }
  },

  getKnownMappings() {
    return [
      // Workday uses data-automation-id extensively
      { selector: '[data-automation-id="legalNameSection_firstName"]', profileKey: 'firstName' },
      { selector: '[data-automation-id="legalNameSection_lastName"]', profileKey: 'lastName' },
      { selector: '[data-automation-id="email"]', profileKey: 'email' },
      { selector: '[data-automation-id="phone-number"]', profileKey: 'phone' },
      { selector: '[data-automation-id="addressSection_addressLine1"]', profileKey: 'address' },
      { selector: '[data-automation-id="addressSection_city"]', profileKey: 'city' },
      { selector: '[data-automation-id="addressSection_region"]', profileKey: 'state' },
      { selector: '[data-automation-id="addressSection_postalCode"]', profileKey: 'zip' },
      { selector: '[data-automation-id="addressSection_countryRegion"]', profileKey: 'country' },
      { selector: '[data-automation-id="linkedInQuestion"]', profileKey: 'linkedinUrl' },
      { selector: '[data-automation-id="githubQuestion"]', profileKey: 'githubUrl' },
      // Common Workday input patterns
      { selector: 'input[data-automation-id="name-input-firstName"]', profileKey: 'firstName' },
      { selector: 'input[data-automation-id="name-input-lastName"]', profileKey: 'lastName' },
    ];
  },

  async afterFill(result) {
    // Workday fields often need focus/blur cycles to validate
    const filledFields = document.querySelectorAll('[data-aam-filled="true"]');
    for (const field of filledFields) {
      field.focus();
      await new Promise(resolve => setTimeout(resolve, 100));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  },
});

AAM.registerAdapter(WorkdayAdapter);

window.AAM = AAM;
