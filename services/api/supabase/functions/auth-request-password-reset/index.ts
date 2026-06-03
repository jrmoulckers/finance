// SPDX-License-Identifier: BUSL-1.1

/**
 * POST /api/auth/request-password-reset — request a Supabase recovery email.
 *
 * Always returns the same accepted response for valid email-shaped input so the
 * endpoint does not reveal whether an account exists for the submitted address.
 */

import { validateEnv } from '../_shared/env.ts';
import { requestPasswordRecovery } from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

interface RequestPasswordResetBody {
  email?: unknown;
  redirectTo?: unknown;
}

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-request-password-reset', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
    });
  }

  let body: RequestPasswordResetBody;
  try {
    body = (await req.json()) as RequestPasswordResetBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.email !== 'string') {
    return badRequest('email is required');
  }

  const email = body.email.trim();
  if (email.length === 0 || email.length > 320 || !email.includes('@')) {
    return badRequest('Enter a valid email address.');
  }

  let redirectTo: string;
  try {
    redirectTo = normalizeRedirectTo(req, body.redirectTo);
  } catch {
    return badRequest('redirectTo must be an http(s) URL for this origin');
  }

  const upstreamStatus = await requestPasswordRecovery(email, redirectTo).catch(() => 503);
  if (upstreamStatus >= 500) {
    return new Response(JSON.stringify({ error: 'Could not send reset email.' }), {
      status: 502,
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: NO_STORE_HEADERS,
  });
};

if (import.meta.main) Deno.serve(handler);

function normalizeRedirectTo(req: Request, value: unknown): string {
  const origin = req.headers.get('Origin') ?? new URL(req.url).origin;
  const fallback = new URL('/reset-password', origin).toString();

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Error('invalid redirectTo');
  }

  const redirectUrl = new URL(value);
  if (!['http:', 'https:'].includes(redirectUrl.protocol) || redirectUrl.origin !== origin) {
    throw new Error('invalid redirectTo');
  }

  return redirectUrl.toString();
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: NO_STORE_HEADERS,
  });
}
