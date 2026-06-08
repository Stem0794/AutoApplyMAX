/**
 * AutoApplyMAX — JazzHR Adapter
 *
 * Handles JazzHR application forms (*.applytojob.com).
 */
(function () {
  const JazzHRAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'JazzHR',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'applytojob.com');
    },

    getSiteKey() {
      return `jazzhr:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, #first_name, input[name="first_name"]', 4000);
    },

    getKnownMappings() {
      return [
        { selector: '#first_name, input[name="first_name"]', profileKey: 'firstName' },
        { selector: '#last_name, input[name="last_name"]', profileKey: 'lastName' },
        { selector: '#email, input[name="email"]', profileKey: 'email' },
        { selector: '#phone, input[name="phone"]', profileKey: 'phone' },
        { selector: 'input[name*="linkedin" i]', profileKey: 'linkedinUrl' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(JazzHRAdapter);
})();
