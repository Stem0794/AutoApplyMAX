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
    return AAM.hostMatches('myworkdayjobs.com') || AAM.hostMatches('workday.com');
  },

  getSiteKey() {
    return `workday:${window.location.hostname}`;
  },

  async prepare() {
    const containerSelector =
      '[data-automation-id="jobApplicationContainer"], ' +
      '[data-automation-id="compositeContainer"], ' +
      '.css-1dbjc4n';
    // Most runs start after document_idle, so avoid paying a fixed delay when
    // the application form is already present.
    if (!document.querySelector(containerSelector)) {
      await this.waitForElement(containerSelector, 2500);
    }

    // Try to expand any collapsed sections
    const expandButtons = document.querySelectorAll(
      '[data-automation-id="expandButton"], ' +
      '[data-automation-id="toggleButton"], ' +
      'button[aria-expanded="false"]'
    );
    for (const btn of expandButtons) {
      btn.click();
    }
    if (expandButtons.length > 0) {
      // Let synchronous framework updates settle without imposing a fixed delay.
      await Promise.resolve();
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

});

AAM.registerAdapter(WorkdayAdapter);

window.AAM = AAM;
