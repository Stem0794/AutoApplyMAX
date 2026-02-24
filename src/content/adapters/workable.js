/**
 * AutoApplyMAX — Workable Adapter
 *
 * Handles Workable job application forms (apply.workable.com).
 */
(function () {
    const WorkableAdapter = Object.assign({}, AAM.AdapterBase, {
        name: 'Workable',

        matches() {
            return window.location.hostname.includes('workable.com');
        },

        getSiteKey() {
            return 'workable.com';
        },

        async prepare() {
            // Wait for the form to render
            await this.waitForElement('form[data-testid="application-form"], input[name="firstname"]', 3000);
        },

        getKnownMappings() {
            return [
                { selector: 'input[name="firstname"]', profileKey: 'firstName' },
                { selector: 'input[name="lastname"]', profileKey: 'lastName' },
                { selector: 'input[name="email"]', profileKey: 'email' },
                { selector: 'input[name="phone"]', profileKey: 'phone' },
                { selector: 'input[name="address"]', profileKey: 'city' },
                { selector: 'textarea[name="summary"]', profileKey: 'summary' },
                { selector: 'input[type="file"]', profileKey: 'resumeFile' },
                { selector: 'input[name="linkedin_url"]', profileKey: 'linkedinUrl' },
                { selector: 'input[name="github_url"]', profileKey: 'githubUrl' },
                { selector: 'input[name="portfolio_url"]', profileKey: 'portfolioUrl' },
            ];
        }
    });

    AAM.registerAdapter(WorkableAdapter);
})();
