/**
 * AutoApplyMAX — Greenhouse Adapter
 *
 * Handles Greenhouse job board application forms.
 * Greenhouse uses a relatively standard form structure with
 * well-labeled fields.
 */
var AAM = window.AAM || {};

const GreenhouseAdapter = Object.assign({}, AAM.AdapterBase, {
  name: 'Greenhouse',

  matches() {
    return AAM.CONSTANTS.ATS_HOSTS.GREENHOUSE.some(
      h => window.location.hostname.includes(h)
    );
  },

  getSiteKey() {
    return 'greenhouse.io';
  },

  async prepare() {
    // Greenhouse forms are usually on the page directly.
    // Wait for the application form container.
    await this.waitForElement('#application_form, #main_fields, .application-form', 3000);
  },

  getKnownMappings() {
    return [
      { selector: '#first_name, input[name*="first_name"]', profileKey: 'firstName' },
      { selector: '#last_name, input[name*="last_name"]', profileKey: 'lastName' },
      { selector: '#email, input[name*="email"]', profileKey: 'email' },
      { selector: '#phone, input[name*="phone"]', profileKey: 'phone' },
      { selector: '#job_application_location, input[name*="location"]', profileKey: 'city' },
      { selector: '#resume_upload, input[type="file"][name*="resume"]', profileKey: 'resumeFile' },
      { selector: 'input[placeholder*="LinkedIn"], input[name*="linkedin"]', profileKey: 'linkedinUrl' },
      { selector: 'input[placeholder*="GitHub"], input[name*="github"]', profileKey: 'githubUrl' },
      { selector: 'input[placeholder*="Portfolio"], input[name*="portfolio"], input[name*="website"]', profileKey: 'portfolioUrl' },
    ];
  },

  async afterFill(result) {
    // Greenhouse may have custom question fields that need blur events
    const filledFields = document.querySelectorAll('[data-aam-filled="true"]');
    for (const field of filledFields) {
      field.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  },
});

AAM.registerAdapter(GreenhouseAdapter);

window.AAM = AAM;
