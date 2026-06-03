// SPDX-License-Identifier: BUSL-1.1

/** POST /api/auth/reset-password — update the password for a recovery token. */

import { validateEnv } from '../_shared/env.ts';
import { updatePasswordWithAccessToken } from '../_shared/supabase-auth.ts';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

interface ResetPasswordBody {
  accessToken?: unknown;
  password?: unknown;
}

export const handler = async (req: Request): Promise<Response> => {
  const envError = validateEnv('auth-reset-password', req);
  if (envError) return envError;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
    });
  }

  let body: ResetPasswordBody;
  try {
    body = (await req.json()) as ResetPasswordBody;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    return badRequest('Reset link is invalid or expired.');
  }

  if (typeof body.password !== 'string') {
    return badRequest('password is required');
  }

  if (body.password.length < 12 || body.password.length > 128) {
    return badRequest('Password must be between 12 and 128 characters.');
  }

  const updated = await updatePasswordWithAccessToken(body.accessToken, body.password).catch(
    () => false,
  );
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Reset link is invalid or expired.' }), {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
};

if (import.meta.main) Deno.serve(handler);

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: NO_STORE_HEADERS,
  });
}
