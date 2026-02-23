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
     * @returns {Promise<any>}
     */
    async _request(endpoint, method = 'GET', body = null, query = '') {
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
            'Prefer': 'return=representation'
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
        // Note: We use upsert logic (on_conflict)
        // Supabase REST treats POST with Prefer: resolution=merge-duplicates as upsert if there's a unique constraint
        // or just use PATCH if we know the ID.
        // Recommended table schema: id (uuid/serial), site_key (text), selector (text), profile_key (text), created_at
        // Unique constraint on (site_key, selector)
        const payload = {
            site_key: siteKey,
            selector: selector,
            profile_key: profileKey
        };

        return this._request(AAM.CONSTANTS.SUPABASE_TABLE, 'POST', payload);
    }
};

window.AAM = AAM;
