import {
  requireUser,
  supabaseRestHeaders,
} from "../_shared/auth.ts";
import {
  corsHeaders,
  jsonResponse,
  methodNotAllowed,
} from "../_shared/http.ts";
import { validateSiteKey } from "../_shared/validation.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return methodNotAllowed("GET, OPTIONS");
  }

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const requestUrl = new URL(request.url);
  const rawSiteKey = requestUrl.searchParams.get("siteKey");
  const siteKey = validateSiteKey(rawSiteKey);
  if (!siteKey) {
    return jsonResponse(
      { error: "validation_failed", message: "A valid siteKey is required" },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL");
    return jsonResponse({ error: "server_configuration_error" }, 500);
  }

  const query = new URLSearchParams({
    select: "site_key,field_signature,profile_key,approved_at",
    site_key: `eq.${siteKey}`,
    order: "field_signature.asc",
    limit: "500",
  });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/approved_field_mappings?${query}`,
    {
      headers: supabaseRestHeaders(auth.authorization),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    console.error("approved mapping read failed", response.status, details);
    return jsonResponse({ error: "read_failed" }, 502);
  }

  const rows = await response.json() as Array<{
    site_key: string;
    field_signature: string;
    profile_key: string;
    approved_at: string;
  }>;

  return jsonResponse({
    mappings: rows.map((row) => ({
      siteKey: row.site_key,
      fieldSignature: row.field_signature,
      profileKey: row.profile_key,
      approvedAt: row.approved_at,
    })),
  });
});
