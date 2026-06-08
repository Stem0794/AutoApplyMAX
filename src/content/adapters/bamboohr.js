/**
 * AutoApplyMAX — BambooHR Adapter
 *
 * Handles BambooHR hosted careers / application forms (*.bamboohr.com).
 */
(function () {
  const BambooHRAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'BambooHR',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'bamboohr.com');
    },

    getSiteKey() {
      return `bamboohr:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, input[name="firstName"], input[type="email"]', 4000);
    },

    getKnownMappings() {
      return [
        { selector: 'input[name="firstName"], input[id*="firstName" i]', profileKey: 'firstName' },
        { selector: 'input[name="lastName"], input[id*="lastName" i]', profileKey: 'lastName' },
        { selector: 'input[name="email"], input[type="email"]', profileKey: 'email' },
        { selector: 'input[name="phone"], input[name*="phone" i]', profileKey: 'phone' },
        { selector: 'input[name*="address" i]', profileKey: 'address' },
        { selector: 'input[name="city"]', profileKey: 'city' },
        { selector: 'input[name*="zip" i], input[name*="postal" i]', profileKey: 'zip' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(BambooHRAdapter);
})();
