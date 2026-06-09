/**
 * AutoApplyMAX — HireHive Adapter
 *
 * Handles HireHive application forms.
 * HireHive uses relatively standard form elements.
 */
var AAM = window.AAM || {};

const HireHiveAdapter = Object.assign({}, AAM.AdapterBase, {
  name: 'HireHive',

  matches() {
    return AAM.hostMatches('hirehive.com');
  },

  getSiteKey() {
    return 'hirehive.com';
  },

  async prepare() {
    // Wait for HireHive's application form to load
    await this.waitForElement(
      '.application-form, form.job-application, #application-form',
      3000
    );
  },

  getKnownMappings() {
    return [
      { selector: 'input[name="first_name"]', profileKey: 'firstName' },
      { selector: 'input[name="last_name"]', profileKey: 'lastName' },
      { selector: 'input[name="email"]', profileKey: 'email' },
      { selector: 'input[name="phone"]', profileKey: 'phone' },
      { selector: 'input[name="linkedin"]', profileKey: 'linkedinUrl' },
      { selector: 'input[name="website"]', profileKey: 'portfolioUrl' },
      { selector: 'textarea[name="cover_letter"]', profileKey: 'coverLetter' },
      { selector: 'input[name="location"]', profileKey: 'city' },
    ];
  },

});

AAM.registerAdapter(HireHiveAdapter);

window.AAM = AAM;
