/**
 * AutoApplyMAX — Revolut Careers Adapter
 * 
 * Revolut uses a proprietary ATS built on a React-based UI framework.
 */
(function () {
    const RevolutAdapter = Object.assign({}, AAM.AdapterBase, {
        name: 'Revolut Careers',

        /**
         * Matches Revolut's career application pages
         */
        matches() {
            const h = window.location.hostname;
            const p = window.location.pathname;
            return (h.includes('revolut.com')) && p.includes('/careers/apply/');
        },

        /**
         * Revolut's React UI can be dynamic.
         * We wait a moment for the form structure to settle.
         */
        async prepare() {
            // Wait for the main container or specific labels
            await this.waitForElement('input[placeholder="Email"]', 2000);
        },

        getKnownMappings() {
            // Revolut uses stable placeholders and some name attributes
            return [
                { selector: 'input[placeholder="Full name"]', profileKey: 'fullName' },
                { selector: 'input[placeholder="Email"]', profileKey: 'email' },
                { selector: 'input[name="phoneNumber"]', profileKey: 'phone' },
                { selector: 'input[type="file"][name="file"]', profileKey: 'resumeFile' },
                { selector: 'input[placeholder*="LinkedIn"]', profileKey: 'linkedinUrl' },
                { selector: 'input[placeholder*="Github"]', profileKey: 'githubUrl' },
                { selector: 'input[placeholder*="Portfolio"]', profileKey: 'portfolioUrl' },
            ];
        }
    });

    AAM.registerAdapter(RevolutAdapter);
})();
