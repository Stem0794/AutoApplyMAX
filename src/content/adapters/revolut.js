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
         * We wait a moment and then tag custom dropdowns for reliable selection.
         */
        async prepare() {
            // Wait for the main form to at least start rendering
            await this.waitForElement('input[placeholder="Email"]', 3000);

            // Tag custom dropdowns by looking at their associated labels
            const labels = Array.from(document.querySelectorAll('label'));
            labels.forEach(label => {
                const text = label.innerText.toLowerCase();
                const input = label.querySelector('input');
                if (!input) return;

                if (text.includes('current country')) input.dataset.aamRevolut = 'country';
                else if (text.includes('preferred work locations') || text.includes('locations')) input.dataset.aamRevolut = 'locations';
                else if (text.includes('gender')) input.dataset.aamRevolut = 'gender';
                else if (text.includes('ethnicity')) input.dataset.aamRevolut = 'ethnicity';
            });
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
                // Tagged dropdowns from prepare()
                { selector: 'input[data-aam-revolut="country"]', profileKey: 'country' },
                { selector: 'input[data-aam-revolut="locations"]', profileKey: 'preferredLocations' },
                { selector: 'input[data-aam-revolut="gender"]', profileKey: 'gender' },
                { selector: 'input[data-aam-revolut="ethnicity"]', profileKey: 'ethnicity' },
            ];
        },

        /**
         * Handle Revolut's custom dropdown interaction.
         */
        async fillField(element, profileKey, value) {
            if (!element.dataset.aamRevolut && !element.placeholder?.toLowerCase().includes('select')) {
                return false;
            }

            try {
                // 1. Click to open the dropdown
                element.click();
                // Wait for the menu to appear in the DOM
                await new Promise(r => setTimeout(r, 600));

                // 2. Revolut dropdown options are buttons with role="option"
                const options = Array.from(document.querySelectorAll('button[role="option"]'));
                if (options.length === 0) return false;

                // Handle multi-select (locations) or single select
                const targets = value.split(',').map(v => v.trim().toLowerCase());
                let foundMatch = false;

                for (const target of targets) {
                    const match = options.find(opt => {
                        const optText = opt.innerText.toLowerCase();
                        return optText.includes(target) || target.includes(optText);
                    });

                    if (match) {
                        match.click();
                        foundMatch = true;
                        // For multi-select, wait a bit between clicks
                        if (targets.length > 1) await new Promise(r => setTimeout(r, 200));
                    }
                }

                // For single-select, clicking an option closes the menu.
                // If it's still open (like multi-select), we might need to click outside, 
                // but usually the next field fill will handle it.
                return foundMatch;
            } catch (err) {
                console.warn('[AutoApplyMAX] Revolut custom fill failed:', err);
                return false;
            }
        }
    });

    AAM.registerAdapter(RevolutAdapter);
})();
