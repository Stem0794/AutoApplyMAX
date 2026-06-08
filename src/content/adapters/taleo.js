/**
 * AutoApplyMAX — Oracle Taleo Adapter
 *
 * Handles Oracle Taleo career sites (*.taleo.net).
 * Taleo uses dynamic field ids, so selectors match on partial id/name
 * and the heuristic detector covers the rest.
 */
(function () {
  const TaleoAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Oracle Taleo',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'taleo.net');
    },

    getSiteKey() {
      return `taleo:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, input[type="email"], input[id*="email" i]', 5000);
    },

    getKnownMappings() {
      return [
        { selector: 'input[id*="firstName" i], input[name*="firstName" i]', profileKey: 'firstName' },
        { selector: 'input[id*="lastName" i], input[name*="lastName" i]', profileKey: 'lastName' },
        { selector: 'input[id*="email" i], input[type="email"]', profileKey: 'email' },
        { selector: 'input[id*="phone" i], input[id*="telephone" i]', profileKey: 'phone' },
        { selector: 'input[id*="city" i]', profileKey: 'city' },
        { selector: 'input[id*="zipCode" i], input[id*="postalCode" i]', profileKey: 'zip' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(TaleoAdapter);
})();
