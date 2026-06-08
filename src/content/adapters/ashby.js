/**
 * AutoApplyMAX — Ashby Adapter
 *
 * Handles Ashby job application forms (jobs.ashbyhq.com).
 * Ashby renders a React-based form; field labels are reliable so the
 * heuristic detector handles most fields. These known mappings cover
 * the standard system fields.
 */
(function () {
  const AshbyAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'Ashby',

    matches() {
      return AAM.hostMatches('jobs.ashbyhq.com', false) ||
        AAM.hostMatches('ashbyhq.com', true);
    },

    getSiteKey() {
      const tenant = window.location.pathname.split('/').filter(Boolean)[0] || 'unknown';
      return `ashby:${tenant.toLowerCase()}`;
    },

    async prepare() {
      // Ashby lazy-renders the application form after the job posting loads.
      await this.waitForElement(
        'form, input[name="_systemfield_name"], input[name="_systemfield_email"]',
        4000
      );
    },

    getKnownMappings() {
      return [
        { selector: 'input[name="_systemfield_name"]', profileKey: 'fullName' },
        { selector: 'input[name="_systemfield_email"]', profileKey: 'email' },
        { selector: 'input[name*="phone" i]', profileKey: 'phone' },
        { selector: 'input[type="file"]', profileKey: 'resumeFile' },
        { selector: 'input[name*="linkedin" i]', profileKey: 'linkedinUrl' },
        { selector: 'input[name*="github" i]', profileKey: 'githubUrl' },
        { selector: 'input[name*="website" i], input[name*="portfolio" i]', profileKey: 'portfolioUrl' },
      ];
    },
  });

  AAM.registerAdapter(AshbyAdapter);
})();
