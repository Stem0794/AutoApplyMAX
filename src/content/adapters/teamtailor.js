/**
 * AutoApplyMAX — Teamtailor Adapter
 *
 * Handles Teamtailor career sites (*.teamtailor.com).
 */
(function () {
  const TeamtailorAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Teamtailor',

    matches() {
      return (
        AAM.isExactOrSubdomain(window.location.hostname, 'teamtailor.com') ||
        window.location.hostname === 'career.cafler.com'
      );
    },

    getSiteKey() {
      return `teamtailor:${window.location.hostname.toLowerCase()}`;
    },

    async prepare() {
      await this.waitForElement(
        'form, #job_application_first_name, input[name="job_application[first_name]"]',
        8000
      );
    },

    getKnownMappings() {
      return [
        { selector: '#job_application_first_name, input[name="job_application[first_name]"]', profileKey: 'firstName' },
        { selector: '#job_application_last_name, input[name="job_application[last_name]"]', profileKey: 'lastName' },
        { selector: '#job_application_email, input[name="job_application[email]"]', profileKey: 'email' },
        { selector: '#job_application_phone, input[name="job_application[phone]"]', profileKey: 'phone' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
      ];
    },
  });

  AAM.registerAdapter(TeamtailorAdapter);
})();
