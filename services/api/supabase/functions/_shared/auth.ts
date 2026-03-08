// SPDX-License-Identifier: BUSL-1.1

/**
 * Auth helper for Supabase Edge Functions (#98).
 *
 * Validates the JWT from the Authorization header and extracts
 * the authenticated user. Uses the Supabase Admin client with
 * the service role key to verify tokens.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/** Minimal user info extracted from a verified JWT. */
export interface AuthenticatedUser {
  /** The user's UUID (from the `sub` claim). */
  id: string;
  /** The user's email address. */
  email: string;
}

/**
 * Create a Supabase Admin client using the service role key.
 *
 * This client bypasses RLS and should ONLY be used for
 * server-side operations that need elevated privileges.
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Extract and verify the authenticated user from a request's JWT.
 *
 * @param req The incoming request with an Authorization header.
 * @returns The authenticated user, or `null` if the token is missing/invalid.
 */
export async function getAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7); // Remove "Bearer "

  try {
    const supabase = createAdminClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication — returns user or throws a Response.
 *
 * Use in Edge Functions where auth is mandatory:
 * ```ts
 * const user = await requireAuth(req);
 * // If we get here, user is authenticated
 * ```
 *
 * @param req The incoming request.
 * @returns The authenticated user.
 * @throws A 401 Response if authentication fails.
 */
export async function requireAuth(req: Request): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    throw new Response(
      JSON.stringify({ error: "Authentication required" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return user;
}
