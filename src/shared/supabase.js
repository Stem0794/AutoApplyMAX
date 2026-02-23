/**
 * AutoApplyMAX — Supabase REST Client
 *
 * Lightweight wrapper for Supabase REST API to sync shared mappings.
 */
var AAM = window.AAM || {};

AAM.Supabase = {
    /**
     * Helper to perform fetch requests to Supabase
     * @param {string} endpoint - table name or RPC
     * @param {string} method - GET, POST, etc.
     * @param {object} body - optional body
     * @param {string} query - optional query string
     * @param {object} extraHeaders - optional extra headers
     * @returns {Promise<any>}
     */
    async _request(endpoint, method = 'GET', body = null, query = '', extraHeaders = {}) {
        const url = AAM.CONSTANTS.SUPABASE_URL;
        const key = AAM.CONSTANTS.SUPABASE_KEY;

        if (!url || !key) {
            console.warn('[AutoApplyMAX] Supabase URL or Key not configured.');
            return null;
        }

        const headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
            ...extraHeaders
        };

        const options = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${url}/rest/v1/${endpoint}${query}`, options);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Supabase error: ${response.status} ${errorText}`);
            }
            return await response.json();
        } catch (err) {
            console.error('[AutoApplyMAX] Supabase request failed:', err);
            return null;
        }
    },

    /**
     * Fetch all mappings for a specific site
     * @param {string} siteKey
     * @returns {Promise<Array>}
     */
    async getMappings(siteKey) {
        return this._request(AAM.CONSTANTS.SUPABASE_TABLE, 'GET', null, `?site_key=eq.${encodeURIComponent(siteKey)}`);
    },

    /**
     * Upsert a mapping to Supabase
     * @param {string} siteKey
     * @param {string} selector
     * @param {string} profileKey
     */
    async saveMapping(siteKey, selector, profileKey) {
        return this.saveMappingsBulk([{ siteKey, selector, profileKey }]);
    },

    /**
     * Bulk upsert mappings to Supabase
     * @param {Array<{siteKey: string, selector: string, profileKey: string}>} mappings
     */
    async saveMappingsBulk(mappings) {
        if (!mappings || mappings.length === 0) return null;

        const payload = mappings.map(m => ({
            site_key: m.siteKey,
            selector: m.selector,
            profile_key: m.profileKey
        }));

        return this._request(
            AAM.CONSTANTS.SUPABASE_TABLE,
            'POST',
            payload,
            '?on_conflict=site_key,selector',
            { 'Prefer': 'return=representation,resolution=merge-duplicates' }
        );
    }
};

window.AAM = AAM;
