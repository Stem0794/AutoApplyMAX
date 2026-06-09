/**
 * AutoApplyMAX — JobFluent Adapter
 *
 * Handles application controls on JobFluent job-detail pages. JobFluent
 * requires the applicant to review and accept its legal consent manually.
 */
(function () {
  const JobFluentAdapter = Object.assign({}, AAM.AdapterBase, {
    name: 'JobFluent',

    matches() {
      return (
        window.location.hostname === 'www.jobfluent.com' &&
        window.location.pathname.startsWith('/jobs/')
      );
    },

    getSiteKey() {
      return 'jobfluent:www.jobfluent.com';
    },

    async prepare() {
      await this.waitForElement(
        'input[autocomplete="name"], input[type="email"], input[type="file"], textarea',
        4000
      );
    },

    getKnownMappings() {
      return [
        {
          selector:
            'input[autocomplete="name"], input[name="name"], input[name="full_name"], input[name="candidate[name]"]',
          profileKey: 'fullName',
        },
        {
          selector:
            'input[autocomplete="given-name"], input[name="first_name"], input[name="candidate[first_name]"]',
          profileKey: 'firstName',
        },
        {
          selector:
            'input[autocomplete="family-name"], input[name="last_name"], input[name="candidate[last_name]"]',
          profileKey: 'lastName',
        },
        {
          selector:
            'input[autocomplete="email"], input[name="email"], input[name="candidate[email]"]',
          profileKey: 'email',
        },
        {
          selector:
            'input[autocomplete="tel"], input[name="phone"], input[name="candidate[phone]"]',
          profileKey: 'phone',
        },
        {
          selector:
            'input[name="linkedin_url"], input[name="linkedin"], input[name="candidate[linkedin_url]"]',
          profileKey: 'linkedinUrl',
        },
        {
          selector:
            'textarea[name="cover_letter"], textarea[name="candidate[cover_letter]"]',
          profileKey: 'coverLetter',
        },
        {
          selector:
            'input[type="file"][name*="resume" i], input[type="file"][name*="cv" i]',
          profileKey: 'resumeFile',
        },
      ];
    },
  });

  AAM.registerAdapter(JobFluentAdapter);
})();
