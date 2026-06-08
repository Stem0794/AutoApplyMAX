/**
 * Suggest adapter selector fixes from community-approved mappings.
 *
 * Reads `approved_field_mappings` from Supabase (these are the field
 * signatures the community has agreed map to a given profile key) and turns
 * each into a concrete CSS selector suggestion you can paste into the matching
 * adapter's `getKnownMappings()`. This is how accumulated user corrections
 * feed back into the shipped adapters.
 *
 * Usage:
 *   node scripts/suggest-adapter-fixes.mjs [siteKeyPrefix]
 *
 * Env (optional — falls back to the public project):
 *   AAM_COMMUNITY_API_URL, AAM_COMMUNITY_PUBLISHABLE_KEY
 */

const API_URL = process.env.AAM_COMMUNITY_API_URL ?? 'https://arsfogdvglyiwqiujnof.supabase.co';
const PUBLISHABLE_KEY =
  process.env.AAM_COMMUNITY_PUBLISHABLE_KEY ?? 'sb_publishable_gzQYp8xDiox-yyusd67EEQ_MN5D8y3M';

const siteFilter = process.argv[2] ?? '';

/** Anonymous sign-in so we can read approved mappings under RLS. */
async function getAnonToken() {
  const res = await fetch(new URL('/auth/v1/signup', API_URL), {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Anonymous sign-in failed (${res.status}). Is the project reachable?`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error('No access token returned');
  return body.access_token;
}

async function fetchApprovedMappings(token) {
  const query = new URLSearchParams({
    select: 'site_key,field_signature,profile_key,approval_method,community_submitter_count',
    order: 'site_key.asc',
    limit: '2000',
  });
  const res = await fetch(new URL(`/rest/v1/approved_field_mappings?${query}`, API_URL), {
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Read failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** Turn a stored field signature into the most specific selector we can. */
function signatureToSelector(signatureJson) {
  let sig;
  try {
    sig = JSON.parse(signatureJson);
  } catch {
    return null;
  }
  const tag = ['input', 'select', 'textarea'].includes(sig.tag) ? sig.tag : 'input';
  if (sig.name) return `${tag}[name="${sig.name}"]`;
  if (sig.autocomplete) return `${tag}[autocomplete="${sig.autocomplete}"]`;
  if (sig.type && tag === 'input') return `input[type="${sig.type}"]`;
  return null; // only a label — needs a human to pick a selector
}

function main(rows) {
  const filtered = siteFilter ? rows.filter(r => r.site_key.startsWith(siteFilter)) : rows;

  if (filtered.length === 0) {
    console.log(
      siteFilter ? `No approved mappings for "${siteFilter}".` : 'No approved mappings yet.'
    );
    return;
  }

  const bySite = new Map();
  for (const row of filtered) {
    if (!bySite.has(row.site_key)) bySite.set(row.site_key, []);
    bySite.get(row.site_key).push(row);
  }

  console.log(`\nAdapter fix suggestions from ${filtered.length} approved mapping(s):\n`);

  for (const [siteKey, mappings] of [...bySite.entries()].sort()) {
    console.log(`# ${siteKey}`);
    console.log('  getKnownMappings() {');
    console.log('    return [');
    for (const m of mappings) {
      const selector = signatureToSelector(m.field_signature);
      const tag =
        m.approval_method === 'community'
          ? ` // community ×${m.community_submitter_count ?? '?'}`
          : ' // manual';
      if (selector) {
        console.log(`      { selector: '${selector}', profileKey: '${m.profile_key}' },${tag}`);
      } else {
        let label = '';
        try {
          label = JSON.parse(m.field_signature).label ?? '';
        } catch {
          /* ignore */
        }
        console.log(
          `      // TODO label-only signature → ${m.profile_key} (label: "${label}")${tag}`
        );
      }
    }
    console.log('    ];');
    console.log('  }\n');
  }

  console.log('Review each suggestion before pasting into src/content/adapters/<platform>.js.');
}

try {
  const token = await getAnonToken();
  const rows = await fetchApprovedMappings(token);
  main(rows);
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
}
