/**
 * AutoApplyMAX — Mainder AI Adapter
 *
 * Handles Mainder AI careers portals (careers-site.mainder.ai).
 * Mainder uses a React-based modal for applications.
 */
(function () {
    const MainderAdapter = Object.assign({}, AAM.AdapterBase, {
        name: 'Mainder',

        matches() {
            return window.location.hostname.includes('mainder.ai');
        },

        getSiteKey() {
            return 'mainder.ai';
        },

        async prepare() {
            // Find the Apply button. Mainder often uses a sticky primary button.
            const applyBtn = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.trim().toLowerCase() === 'apply' ||
                b.textContent.trim().toLowerCase() === 'inscribirme'
            );

            if (applyBtn) {
                console.log('[AutoApplyMAX] Found Apply button, opening modal...');
                applyBtn.click();
                // Wait for the modal fields to appear
                await this.waitForElement('input[placeholder*="first name"], input[placeholder*="nombre"]', 3000);
            }
        },

        getKnownMappings() {
            return [
                { selector: 'input[placeholder*="first name"], input[placeholder*="nombre"]', profileKey: 'firstName' },
                { selector: 'input[placeholder*="last name"], input[placeholder*="apellido"]', profileKey: 'lastName' },
                { selector: 'input[placeholder*="email"], input[placeholder*="correo"]', profileKey: 'email' },
                { selector: 'input[placeholder*="phone"], input[placeholder*="teléfono"]', profileKey: 'phone' },
                { selector: 'input[placeholder*="LinkedIn"]', profileKey: 'linkedinUrl' },
                { selector: 'input[placeholder*="salary"], input[placeholder*="salario"]', profileKey: 'salaryExpectation' },
                { selector: 'input[type="file"]', profileKey: 'resumeFile' },
                // Generic mappings for common killer questions in the modal
                { selector: 'textarea', profileKey: 'summary' },
            ];
        },

        async afterFill(result) {
            // Auto-check privacy policy if found in the modal
            const privacyCheckbox = document.querySelector('input[type="checkbox"]');
            if (privacyCheckbox && !privacyCheckbox.checked) {
                privacyCheckbox.click();
            }
        }
    });

    AAM.registerAdapter(MainderAdapter);
})();
