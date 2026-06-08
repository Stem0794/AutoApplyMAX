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
            return AAM.hostMatches('mainder.ai');
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
                { selector: 'input[placeholder*="first name"], input[placeholder*="nombre"], input[placeholder*="prénom"], input[placeholder*="vorname"], input[placeholder*="nome"]', profileKey: 'firstName' },
                { selector: 'input[placeholder*="last name"], input[placeholder*="apellido"], input[placeholder*="nom"], input[placeholder*="nachname"], input[placeholder*="cognome"]', profileKey: 'lastName' },
                { selector: 'input[placeholder*="email"], input[placeholder*="correo"], input[placeholder*="e-mail"]', profileKey: 'email' },
                { selector: 'input[placeholder*="phone"], input[placeholder*="teléfono"], input[placeholder*="téléphone"], input[placeholder*="telefon"], input[placeholder*="telefono"]', profileKey: 'phone' },
                { selector: 'input[placeholder*="LinkedIn"]', profileKey: 'linkedinUrl' },
                { selector: 'input[placeholder*="salary"], input[placeholder*="salario"], input[placeholder*="salaire"], input[placeholder*="gehalt"], input[placeholder*="stipendio"]', profileKey: 'salaryExpectation' },
                { selector: 'input[type="file"]', profileKey: 'resumeFile' },
                // Generic dropdown and textarea support
                { selector: 'select', profileKey: 'heuristic' }, // Let field-detector map selects
                { selector: 'textarea', profileKey: 'summary' },
            ];
        },

        async afterFill(result) {}
    });

    AAM.registerAdapter(MainderAdapter);
})();
