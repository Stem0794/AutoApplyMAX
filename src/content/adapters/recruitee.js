/**
 * AutoApplyMAX — Recruitee Adapter
 *
 * Handles Recruitee careers / application forms (*.recruitee.com).
 */
(function () {
  const RecruiteeAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Recruitee',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'recruitee.com');
    },

    getSiteKey() {
      return `recruitee:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, input[name="candidate[name]"], input[type="email"]', 4000);
    },

    getKnownMappings() {
      return [
        { selector: 'input[name="candidate[name]"]', profileKey: 'fullName' },
        { selector: 'input[name="candidate[email]"]', profileKey: 'email' },
        { selector: 'input[name="candidate[phone]"]', profileKey: 'phone' },
        { selector: 'textarea[name="candidate[cover_letter]"]', profileKey: 'coverLetter' },
        { selector: 'input[name*="linkedin" i]', profileKey: 'linkedinUrl' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(RecruiteeAdapter);
})();
