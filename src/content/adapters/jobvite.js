/**
 * AutoApplyMAX — Jobvite Adapter
 *
 * Handles Jobvite application forms (jobs.jobvite.com).
 */
(function () {
  const JobviteAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Jobvite',

    matches() {
      return AAM.isExactOrSubdomain(window.location.hostname, 'jobvite.com');
    },

    getSiteKey() {
      const tenant = window.location.pathname.split('/').filter(Boolean)[0] || 'unknown';
      return `jobvite:${tenant.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement('form, #firstname, input[name="firstname"]', 4000);
    },

    getKnownMappings() {
      return [
        { selector: '#firstname, input[name="firstname"]', profileKey: 'firstName' },
        { selector: '#lastname, input[name="lastname"]', profileKey: 'lastName' },
        { selector: '#email, input[name="email"]', profileKey: 'email' },
        { selector: '#phone, input[name="phone"]', profileKey: 'phone' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(JobviteAdapter);
})();
