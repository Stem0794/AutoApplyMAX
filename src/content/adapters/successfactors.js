/**
 * AutoApplyMAX — SAP SuccessFactors Adapter
 *
 * Handles SAP SuccessFactors career sites (*.successfactors.com / .eu).
 * Field ids are dynamic GUIDs, so this adapter mostly enables the
 * heuristic detector + learned/community mappings on the domain and
 * provides a stable site key.
 */
(function () {
  const SuccessFactorsAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'SAP SuccessFactors',

    matches() {
      const h = window.location.hostname;
      return AAM.isExactOrSubdomain(h, 'successfactors.com') ||
        AAM.isExactOrSubdomain(h, 'successfactors.eu');
    },

    getSiteKey() {
      return `successfactors:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      // SuccessFactors forms load asynchronously inside the career portal.
      await this.waitForElement('form, input[type="email"], input[type="text"]', 5000);
    },

    getKnownMappings() {
      return [
        { selector: 'input[id*="firstName" i], input[name*="firstName" i]', profileKey: 'firstName' },
        { selector: 'input[id*="lastName" i], input[name*="lastName" i]', profileKey: 'lastName' },
        { selector: 'input[type="email"], input[id*="email" i]', profileKey: 'email' },
        { selector: 'input[id*="phone" i], input[id*="cellPhone" i]', profileKey: 'phone' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(SuccessFactorsAdapter);
})();
