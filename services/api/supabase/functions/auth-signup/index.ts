// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/auth/signup — create a new email/password account (#1886).
 *
 * When Supabase issues a session immediately (email confirmation
 * disabled), returns `{ access_token, expires_in }` and sets the
 * `finance_refresh` cookie. When email confirmation is required,
 * returns 202 with `{ confirmation_required: true }` and sets no cookie.
 */

import { validateEnv } from '../_shared/env.ts';
import { COOKIE_REFRESH, buildSetCookie } from '../_shared/cookie.ts';
import { signupUser } from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

interface SignupBody {
  email?: unknown;
  password?: unknown;
}

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-signup', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
    });
  }

  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return badRequest('email and password are required');
  }
  if (body.email.length > 320 || body.password.length > 4096) {
    return badRequest('email or password too long');
  }
  if (body.password.length < 12) {
    return badRequest('password must be at least 12 characters');
  }

  const tokens = await signupUser(body.email, body.password);
  if (!tokens) {
    return new Response(JSON.stringify({ confirmation_required: true }), {
      status: 202,
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
    { status: 201, headers },
  );
};

if (import.meta.main) Deno.serve(handler);

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: NO_STORE_HEADERS,
  });
}
