/**
 * AutoApplyMAX — iCIMS Adapter
 *
 * Handles iCIMS application forms (*.icims.com).
 * iCIMS field ids are dynamic, so selectors match on partial id/name and
 * the heuristic detector + learned mappings cover the rest.
 */
(function () {
  const ICIMSAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'iCIMS',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'icims.com');
    },

    getSiteKey() {
      return `icims:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, input[id*="firstname" i], input[type="email"]', 4000);
    },

    getKnownMappings() {
      return [
        { selector: 'input[id*="firstname" i], input[name*="firstname" i]', profileKey: 'firstName' },
        { selector: 'input[id*="lastname" i], input[name*="lastname" i]', profileKey: 'lastName' },
        { selector: 'input[id*="email" i], input[type="email"]', profileKey: 'email' },
        { selector: 'input[id*="phone" i], input[name*="phone" i]', profileKey: 'phone' },
        { selector: 'input[id*="addressline" i]', profileKey: 'address' },
        { selector: 'input[id*="city" i]', profileKey: 'city' },
        { selector: 'input[id*="zip" i], input[id*="postal" i]', profileKey: 'zip' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(ICIMSAdapter);
})();
