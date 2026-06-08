import { jsonResponse } from "./http.ts";

export interface AuthenticatedUser {
  id: string;
}

export interface AuthContext {
  authorization: string;
  user: AuthenticatedUser;
}

export async function requireUser(
  request: Request,
): Promise<AuthContext | Response> {
  const authorization = request.headers.get("Authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return jsonResponse({ error: "server_configuration_error" }, 500);
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  });

  if (!response.ok) {
    return jsonResponse({ error: "invalid_access_token" }, 401);
  }

  const user = await response.json() as Partial<AuthenticatedUser>;
  if (!user.id) {
    return jsonResponse({ error: "invalid_access_token" }, 401);
  }

  return {
    authorization,
    user: { id: user.id },
  };
}

export function supabaseRestHeaders(authorization: string): HeadersInit {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    throw new Error("SUPABASE_ANON_KEY is not configured");
  }

  return {
    Authorization: authorization,
    apikey: anonKey,
    "Content-Type": "application/json",
  };
}
