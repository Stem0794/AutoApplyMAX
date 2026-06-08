/**
 * AutoApplyMAX — Breezy HR Adapter
 *
 * Handles Breezy HR application forms (*.breezy.hr).
 */
(function () {
  const BreezyAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Breezy HR',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'breezy.hr');
    },

    getSiteKey() {
      return `breezy:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, input[name="name"], input[type="email"]', 4000);
    },

    getKnownMappings() {
      return [
        { selector: 'input[name="name"]', profileKey: 'fullName' },
        { selector: 'input[name="email"], input[type="email"]', profileKey: 'email' },
        { selector: 'input[name="phone"], input[name*="phone" i]', profileKey: 'phone' },
        { selector: 'textarea[name*="cover" i]', profileKey: 'coverLetter' },
        { selector: 'input[name*="linkedin" i]', profileKey: 'linkedinUrl' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(BreezyAdapter);
})();
