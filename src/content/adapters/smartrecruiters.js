/**
 * AutoApplyMAX — SmartRecruiters Adapter
 *
 * Handles SmartRecruiters application forms
 * (jobs.smartrecruiters.com and careers.smartrecruiters.com).
 */
(function () {
  const SmartRecruitersAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'SmartRecruiters',

    matches() {
      const h = window.location.hostname;
      return AAM.isExactOrSubdomain(h, 'smartrecruiters.com');
    },

    getSiteKey() {
      const tenant = window.location.pathname.split('/').filter(Boolean)[0] || 'unknown';
      return `smartrecruiters:${tenant.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('#firstName, input[name="firstName"], form', 4000);
    },

    getKnownMappings() {
      return [
        { selector: '#firstName, input[name="firstName"]', profileKey: 'firstName' },
        { selector: '#lastName, input[name="lastName"]', profileKey: 'lastName' },
        { selector: '#email, input[name="email"]', profileKey: 'email' },
        { selector: '#phoneNumber, input[name="phoneNumber"], input[name*="phone" i]', profileKey: 'phone' },
        { selector: 'input[name*="linkedin" i]', profileKey: 'linkedinUrl' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(SmartRecruitersAdapter);
})();
