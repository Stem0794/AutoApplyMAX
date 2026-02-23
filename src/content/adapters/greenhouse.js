/**
 * AutoApplyMAX — Greenhouse Adapter
 *
 * Handles Greenhouse job board application forms.
 * Greenhouse uses a relatively standard form structure with
 * well-labeled fields.
 */
const AAM = window.AAM || {};

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
      { selector: '#first_name', profileKey: 'firstName' },
      { selector: '#last_name', profileKey: 'lastName' },
      { selector: '#email', profileKey: 'email' },
      { selector: '#phone', profileKey: 'phone' },
      { selector: '#job_application_location', profileKey: 'city' },
      { selector: '#job_application_answers_attributes_0_text_value', profileKey: 'linkedinUrl' },
      { selector: 'input[name="job_application[first_name]"]', profileKey: 'firstName' },
      { selector: 'input[name="job_application[last_name]"]', profileKey: 'lastName' },
      { selector: 'input[name="job_application[email]"]', profileKey: 'email' },
      { selector: 'input[name="job_application[phone]"]', profileKey: 'phone' },
      { selector: 'input[name="job_application[location]"]', profileKey: 'city' },
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
