/**
 * AutoApplyMAX — Lever Adapter
 *
 * Handles Lever job application forms.
 * Lever forms typically have a clean structure with standard input fields.
 */
var AAM = window.AAM || {};

const LeverAdapter = Object.assign({}, AAM.AdapterBase, {
  name: 'Lever',

  matches() {
    return AAM.CONSTANTS.ATS_HOSTS.LEVER.some(h => AAM.hostMatches(h, false));
  },

  getSiteKey() {
    const tenant = window.location.pathname.split('/').filter(Boolean)[0] || 'unknown';
    return `lever:${tenant.toLowerCase()}`;
  },

  async prepare() {
    // Lever application forms are usually straightforward.
    // Wait for the form to be present.
    await this.waitForElement('.application-form, .postings-btn-wrapper, [data-qa="application-form"]', 3000);

    // Click the "Apply" button if the form isn't visible yet
    const applyBtn = document.querySelector('.postings-btn-wrapper a, [data-qa="btn-apply"]');
    if (applyBtn && !document.querySelector('.application-form')) {
      applyBtn.click();
      await this.waitForElement('.application-form, [data-qa="application-form"]', 1200);
    }
  },

  getKnownMappings() {
    return [
      { selector: 'input[name="name"]', profileKey: 'fullName' },
      { selector: 'input[name="email"]', profileKey: 'email' },
      { selector: 'input[name="phone"]', profileKey: 'phone' },
      { selector: 'input[name="org"]', profileKey: 'currentCompany' },
      { selector: 'input[name="urls[LinkedIn]"]', profileKey: 'linkedinUrl' },
      { selector: 'input[name="urls[GitHub]"]', profileKey: 'githubUrl' },
      { selector: 'input[name="urls[Portfolio]"]', profileKey: 'portfolioUrl' },
      { selector: 'input[name="urls[Other]"]', profileKey: 'portfolioUrl' },
      { selector: 'textarea[name="comments"]', profileKey: 'coverLetter' },
      { selector: 'input[name="location"]', profileKey: 'city' },
    ];
  },

});

AAM.registerAdapter(LeverAdapter);

window.AAM = AAM;
