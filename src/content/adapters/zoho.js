/**
 * AutoApplyMAX — Zoho Recruit Adapter
 */
(function () {
    const ZohoAdapter = Object.assign({}, AAM.AdapterBase, {
        name: 'Zoho Recruit',

        /**
         * Matches URLs like *.zohorecruit.com or *.zohorecruit.eu
         */
        matches() {
            const h = window.location.hostname;
            return h.includes('zohorecruit.com') || h.includes('zohorecruit.eu');
        },

        /**
         * Zoho Recruit forms are often dynamic or inside shadow DOM/iframes,
         * but usually they are just standard fields once loaded.
         */
        async prepare() {
            // Zoho sometimes uses "Show More" for optional fields
            const showMore = document.querySelector('.showMoreFields, [id*="showMore"]');
            if (showMore) {
                showMore.click();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        },

        getKnownMappings() {
            return [
                { selector: '[id^="rec-form_Salutation"]', profileKey: 'salutation' },
                { selector: '[id^="rec-form_First_Name"]', profileKey: 'firstName' },
                { selector: '[id^="rec-form_Last_Name"]', profileKey: 'lastName' },
                { selector: '[id^="rec-form_Email"]', profileKey: 'email' },
                { selector: '[id^="rec-form_Mobile"]', profileKey: 'phone' },
                { selector: '[id^="rec-form_Phone"]', profileKey: 'phone' },
                { selector: '[id^="rec-form_Resume"]', profileKey: 'resumeFile' },
                { selector: '[id^="rec-form_CV"]', profileKey: 'resumeFile' },
                { selector: '[id^="rec-form_LinkedIn"]', profileKey: 'linkedinUrl' },
            ];
        }
    });

    AAM.registerAdapter(ZohoAdapter);
})();
