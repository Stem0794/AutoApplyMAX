import {
  requireUser,
  supabaseRestHeaders,
} from "../_shared/auth.ts";
import {
  corsHeaders,
  jsonResponse,
  methodNotAllowed,
} from "../_shared/http.ts";
import { validateSubmitBody } from "../_shared/validation.ts";

const MAX_BODY_BYTES = 128 * 1024;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return methodNotAllowed("POST, OPTIONS");
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const validation = validateSubmitBody(parsedBody);
  if (!validation.value) {
    return jsonResponse(
      { error: "validation_failed", message: validation.error },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL");
    return jsonResponse({ error: "server_configuration_error" }, 500);
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/submit_mapping_submissions`,
    {
      method: "POST",
      headers: supabaseRestHeaders(auth.authorization),
      body: JSON.stringify({
        p_installation_id: validation.value.installationId,
        p_mappings: validation.value.mappings,
      }),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    console.error("submit_mapping_submissions failed", response.status, details);
    const status = response.status >= 400 && response.status < 500 ? 400 : 502;
    return jsonResponse({ error: "submission_failed" }, status);
  }

  return jsonResponse(await response.json(), 202);
});
