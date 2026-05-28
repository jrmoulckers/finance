// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/auth/login — email + password sign-in (#1886).
 *
 * Returns `{ access_token, expires_in }` and writes the rotated Supabase
 * refresh token into an HttpOnly `finance_refresh` cookie. On invalid
 * credentials returns 401 with a generic message — never reveals whether
 * the email exists.
 */

import { validateEnv } from '../_shared/env.ts';
import { COOKIE_REFRESH, buildSetCookie } from '../_shared/cookie.ts';
import { passwordGrant } from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-login', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
    });
  }

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return badRequest('email and password are required');
  }
  if (body.email.length > 320 || body.password.length > 4096) {
    return badRequest('email or password too long');
  }

  const tokens = await passwordGrant(body.email, body.password);
  if (!tokens) {
    return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }

  const headers = new Headers(NO_STORE_HEADERS);
  headers.append(
    'Set-Cookie',
    buildSetCookie(req, COOKIE_REFRESH, tokens.refresh_token, {
      maxAgeSeconds: 60 * 60 * 24 * 60,
    }),
  );
  return new Response(
    JSON.stringify({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    }),
    { status: 200, headers },
  );
};

if (import.meta.main) Deno.serve(handler);

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: NO_STORE_HEADERS,
  });
}
