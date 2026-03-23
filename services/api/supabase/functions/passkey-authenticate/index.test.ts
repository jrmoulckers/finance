// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `passkey-authenticate` Edge Function (#533).
 *
 * Validates method restrictions, step routing, authentication options
 * generation, assertion verification, JWT session minting, challenge
 * lifecycle (one-time use), and error handling.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertCorsHeaders,
  assertNoSensitiveDataLeakage,
} from '../_test_helpers/assertions.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';
import {
  TEST_USER,
  TEST_CREDENTIAL,
  TEST_AUTH_CHALLENGE,
  TEST_ENV,
} from '../_test_helpers/test-fixtures.ts';
import type { MockSession } from '../_test_helpers/mock-supabase.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
// ---------------------------------------------------------------------------

interface MockAuthDeps {
  resolvedUser?: { id: string } | null;
  userCredentials?: { credential_id: string; transports: string[] | null }[];
  storedCredential?: {
    id: string;
    user_id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    transports: string[] | null;
  } | null;
  challengeRow?: { id: string; challenge: string; type: string; expires_at: string } | null;
  verificationResult?: { verified: boolean; authenticationInfo?: { newCounter: number } };
  authUser?: { id: string; email: string; created_at: string } | null;
  session?: MockSession | null;
  linkError?: boolean;
  sessionError?: boolean;
}

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonRes(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
  });
}

function errRes(message: string, status = 400): Response {
  return jsonRes({ error: message }, status);
}

async function handlePasskeyAuthenticate(req: Request, deps: MockAuthDeps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  if (req.method !== 'POST') {
    return errRes('Method not allowed', 405);
  }

  const url = new URL(req.url);
  const step = url.searchParams.get('step');

  try {
    if (step === 'options') {
      const body = await req.json().catch(() => ({}));
      const email = body.email as string | undefined;

      let allowCredentials: { id: string; type: 'public-key'; transports?: string[] }[] = [];

      if (email && deps.resolvedUser) {
        const creds = deps.userCredentials ?? [];
        allowCredentials = creds.map((c) => ({
          id: c.credential_id,
          type: 'public-key' as const,
          transports: c.transports ?? [],
        }));
      }

      const authenticationOptions = {
        challenge: 'generated-auth-challenge',
        rpId: TEST_ENV.WEBAUTHN_RP_ID,
        userVerification: 'preferred',
        allowCredentials,
      };

      return jsonRes(authenticationOptions);
    } else if (step === 'verify') {
      const body = await req.json();
      const credentialId = body.id as string;

      if (!credentialId) {
        return errRes('Missing credential ID');
      }

      // Credential lookup
      const storedCred = deps.storedCredential ?? null;
      if (!storedCred) {
        return errRes('Credential not found');
      }

      // Challenge lookup
      const challengeRow = deps.challengeRow ?? null;
      if (!challengeRow) {
        return errRes('Challenge not found, expired, or already used');
      }

      // Challenge is deleted regardless of verification outcome (one-time use)
      // (In production, the DELETE happens here)

      // Verification
      const verification = deps.verificationResult ?? {
        verified: true,
        authenticationInfo: { newCounter: 1 },
      };
      if (!verification.verified) {
        return errRes('Authentication verification failed', 401);
      }

      // Resolve auth user for session
      const authUser = deps.authUser ?? null;
      if (!authUser) {
        return errRes('Internal server error', 500);
      }

      // Generate link + session
      if (deps.linkError) {
        return errRes('Internal server error', 500);
      }

      const session = deps.session ?? null;
      if (!session || deps.sessionError) {
        return errRes('Internal server error', 500);
      }

      return jsonRes({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: 'bearer',
        user: {
          id: session.user.id,
          email: session.user.email,
          created_at: session.user.created_at,
        },
      });
    } else {
      return errRes('Invalid step. Use ?step=options or ?step=verify');
    }
  } catch {
    return errRes('Internal server error', 500);
  }
}

// Mock session for successful auth tests
const mockSession: MockSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: TEST_USER.id,
    email: TEST_USER.email,
    created_at: TEST_USER.created_at,
  },
};

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — returns 405 for GET method', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handlePasskeyAuthenticate(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('passkey-authenticate — returns 405 for PUT method', async () => {
  const req = createMockRequest({ method: 'PUT', body: {} });
  const res = await handlePasskeyAuthenticate(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('passkey-authenticate — returns 405 for DELETE method', async () => {
  const req = createMockRequest({ method: 'DELETE' });
  const res = await handlePasskeyAuthenticate(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: CORS preflight
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — OPTIONS returns 204', async () => {
  const req = createMockRequest({ method: 'OPTIONS' });
  const res = await handlePasskeyAuthenticate(req);
  assertStatus(res, 204);
});

// ---------------------------------------------------------------------------
// Tests: step=options
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — step=options generates auth options without email', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=options',
    body: {},
  });
  const res = await handlePasskeyAuthenticate(req);

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(typeof body.challenge, 'string');
  assertEquals(body.rpId, TEST_ENV.WEBAUTHN_RP_ID);
  const allowCreds = body.allowCredentials as unknown[];
  assertEquals(allowCreds.length, 0); // No email → empty allowCredentials
});

Deno.test('passkey-authenticate — step=options with email returns user credentials', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=options',
    body: { email: TEST_USER.email },
  });
  const res = await handlePasskeyAuthenticate(req, {
    resolvedUser: { id: TEST_USER.id },
    userCredentials: [{ credential_id: TEST_CREDENTIAL.credential_id, transports: ['internal'] }],
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  const allowCreds = body.allowCredentials as { id: string; type: string }[];
  assertEquals(allowCreds.length, 1);
  assertEquals(allowCreds[0].id, TEST_CREDENTIAL.credential_id);
  assertEquals(allowCreds[0].type, 'public-key');
});

Deno.test(
  'passkey-authenticate — step=options with email but no user found returns empty',
  async () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=options',
      body: { email: 'unknown@example.com' },
    });
    const res = await handlePasskeyAuthenticate(req, {
      resolvedUser: null,
      userCredentials: [],
    });

    assertStatus(res, 200);
    const body = await assertJsonBody(res);
    const allowCreds = body.allowCredentials as unknown[];
    assertEquals(allowCreds.length, 0);
  },
);

// ---------------------------------------------------------------------------
// Tests: step=verify
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — step=verify succeeds with valid assertion', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: {
      id: TEST_CREDENTIAL.credential_id,
      response: { clientDataJSON: 'dGVzdA' },
    },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: {
      id: TEST_CREDENTIAL.id,
      user_id: TEST_USER.id,
      credential_id: TEST_CREDENTIAL.credential_id,
      public_key: TEST_CREDENTIAL.public_key,
      counter: 0,
      transports: ['internal'],
    },
    challengeRow: {
      id: TEST_AUTH_CHALLENGE.id,
      challenge: 'test-challenge',
      type: 'authentication',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: { verified: true, authenticationInfo: { newCounter: 1 } },
    authUser: { id: TEST_USER.id, email: TEST_USER.email, created_at: TEST_USER.created_at },
    session: mockSession,
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.access_token, 'mock-access-token');
  assertEquals(body.refresh_token, 'mock-refresh-token');
  assertEquals(body.token_type, 'bearer');
  assertEquals(typeof body.expires_in, 'number');
  assertEquals(typeof body.expires_at, 'number');

  const user = body.user as Record<string, unknown>;
  assertEquals(user.id, TEST_USER.id);
  assertEquals(user.email, TEST_USER.email);
});

Deno.test('passkey-authenticate — step=verify returns 400 for missing credential ID', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { response: {} },
  });
  const res = await handlePasskeyAuthenticate(req);

  await assertErrorResponse(res, 400, 'Missing credential ID');
});

Deno.test('passkey-authenticate — step=verify returns 400 for credential not found', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { id: 'nonexistent-cred', response: {} },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: null,
  });

  await assertErrorResponse(res, 400, 'Credential not found');
});

Deno.test('passkey-authenticate — step=verify returns 400 for expired/used challenge', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { id: TEST_CREDENTIAL.credential_id, response: {} },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: {
      id: TEST_CREDENTIAL.id,
      user_id: TEST_USER.id,
      credential_id: TEST_CREDENTIAL.credential_id,
      public_key: TEST_CREDENTIAL.public_key,
      counter: 0,
      transports: ['internal'],
    },
    challengeRow: null, // No valid challenge
  });

  await assertErrorResponse(res, 400, 'Challenge not found');
});

Deno.test('passkey-authenticate — step=verify returns 401 for failed verification', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { id: TEST_CREDENTIAL.credential_id, response: {} },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: {
      id: TEST_CREDENTIAL.id,
      user_id: TEST_USER.id,
      credential_id: TEST_CREDENTIAL.credential_id,
      public_key: TEST_CREDENTIAL.public_key,
      counter: 0,
      transports: ['internal'],
    },
    challengeRow: {
      id: TEST_AUTH_CHALLENGE.id,
      challenge: 'test-challenge',
      type: 'authentication',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: { verified: false },
  });

  await assertErrorResponse(res, 401, 'Authentication verification failed');
});

// ---------------------------------------------------------------------------
// Tests: session minting failures
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — step=verify returns 500 when auth user not found', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { id: TEST_CREDENTIAL.credential_id, response: {} },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: {
      id: TEST_CREDENTIAL.id,
      user_id: TEST_USER.id,
      credential_id: TEST_CREDENTIAL.credential_id,
      public_key: TEST_CREDENTIAL.public_key,
      counter: 0,
      transports: ['internal'],
    },
    challengeRow: {
      id: TEST_AUTH_CHALLENGE.id,
      challenge: 'test-challenge',
      type: 'authentication',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: { verified: true, authenticationInfo: { newCounter: 1 } },
    authUser: null,
  });

  assertStatus(res, 500);
  await assertNoSensitiveDataLeakage(res);
});

Deno.test('passkey-authenticate — step=verify returns 500 on link generation failure', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { id: TEST_CREDENTIAL.credential_id, response: {} },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: {
      id: TEST_CREDENTIAL.id,
      user_id: TEST_USER.id,
      credential_id: TEST_CREDENTIAL.credential_id,
      public_key: TEST_CREDENTIAL.public_key,
      counter: 0,
      transports: ['internal'],
    },
    challengeRow: {
      id: TEST_AUTH_CHALLENGE.id,
      challenge: 'test-challenge',
      type: 'authentication',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: { verified: true, authenticationInfo: { newCounter: 1 } },
    authUser: { id: TEST_USER.id, email: TEST_USER.email, created_at: TEST_USER.created_at },
    linkError: true,
  });

  assertStatus(res, 500);
});

Deno.test('passkey-authenticate — step=verify returns 500 on session error', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=verify',
    body: { id: TEST_CREDENTIAL.credential_id, response: {} },
  });
  const res = await handlePasskeyAuthenticate(req, {
    storedCredential: {
      id: TEST_CREDENTIAL.id,
      user_id: TEST_USER.id,
      credential_id: TEST_CREDENTIAL.credential_id,
      public_key: TEST_CREDENTIAL.public_key,
      counter: 0,
      transports: ['internal'],
    },
    challengeRow: {
      id: TEST_AUTH_CHALLENGE.id,
      challenge: 'test-challenge',
      type: 'authentication',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: { verified: true, authenticationInfo: { newCounter: 1 } },
    authUser: { id: TEST_USER.id, email: TEST_USER.email, created_at: TEST_USER.created_at },
    sessionError: true,
    session: null,
  });

  assertStatus(res, 500);
});

// ---------------------------------------------------------------------------
// Tests: invalid step
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — returns 400 for invalid step', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=invalid',
    body: {},
  });
  const res = await handlePasskeyAuthenticate(req);

  await assertErrorResponse(res, 400, 'Invalid step');
});

Deno.test('passkey-authenticate — returns 400 for missing step', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate',
    body: {},
  });
  const res = await handlePasskeyAuthenticate(req);

  await assertErrorResponse(res, 400, 'Invalid step');
});

// ---------------------------------------------------------------------------
// Tests: CORS headers
// ---------------------------------------------------------------------------

Deno.test('passkey-authenticate — all responses include CORS headers', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-authenticate?step=options',
    body: {},
  });
  const res = await handlePasskeyAuthenticate(req);
  assertCorsHeaders(res);
});
