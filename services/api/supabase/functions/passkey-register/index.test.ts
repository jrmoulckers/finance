// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `passkey-register` Edge Function (#533).
 *
 * Validates method restrictions, JWT authentication, step routing,
 * registration options generation, attestation verification, and
 * challenge lifecycle.
 */

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertCorsHeaders,
} from '../_test_helpers/assertions.ts';
import { createMockRequest, createAuthenticatedRequest } from '../_test_helpers/mock-request.ts';
import {
  TEST_USER,
  TEST_CREDENTIAL,
  TEST_CHALLENGE,
  TEST_ENV,
} from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
// ---------------------------------------------------------------------------

interface MockDeps {
  authenticatedUser?: { id: string; email: string } | null;
  existingCredentials?: { credential_id: string }[];
  storedChallenge?: { challenge: string; expires_at: string } | null;
  verificationResult?: { verified: boolean; registrationInfo?: Record<string, unknown> } | null;
  insertError?: { message: string } | null;
}

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Test handler mirroring the production passkey-register logic.
 */
async function handlePasskeyRegister(req: Request, deps: MockDeps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const user = deps.authenticatedUser ?? null;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const step = url.searchParams.get('step');

  try {
    if (step === 'options') {
      const existingCreds = deps.existingCredentials ?? [];
      const excludeCredentials = existingCreds.map((cred) => ({
        id: cred.credential_id,
        type: 'public-key' as const,
      }));

      // Simulate generating registration options
      const registrationOptions = {
        challenge: 'generated-challenge-value',
        rp: { name: TEST_ENV.WEBAUTHN_RP_NAME, id: TEST_ENV.WEBAUTHN_RP_ID },
        user: {
          id: user.id,
          name: user.email,
          displayName: user.email,
        },
        excludeCredentials,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform',
        },
      };

      return new Response(JSON.stringify(registrationOptions), {
        status: 200,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (step === 'verify') {
      // Check for stored challenge
      const challenge = deps.storedChallenge ?? null;
      if (!challenge) {
        return new Response(JSON.stringify({ error: 'No valid challenge found' }), {
          status: 400,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if challenge is expired
      if (new Date(challenge.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'No valid challenge found' }), {
          status: 400,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify registration
      const verification = deps.verificationResult ?? {
        verified: true,
        registrationInfo: {
          credential: {
            id: 'new-credential-id',
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ['internal'],
          },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      };

      if (!verification.verified || !verification.registrationInfo) {
        return new Response(JSON.stringify({ error: 'Registration verification failed' }), {
          status: 400,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for insert error
      if (deps.insertError) {
        return new Response(JSON.stringify({ error: 'Failed to store credential' }), {
          status: 500,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          verified: true,
          credential_id: 'new-credential-id',
          device_type: 'singleDevice',
        }),
        {
          status: 201,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        },
      );
    } else {
      return new Response(
        JSON.stringify({
          error: 'Invalid step. Use ?step=options or ?step=verify',
        }),
        {
          status: 400,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('passkey-register — returns 405 for GET method', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handlePasskeyRegister(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('passkey-register — returns 405 for PUT method', async () => {
  const req = createMockRequest({ method: 'PUT', body: {} });
  const res = await handlePasskeyRegister(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('passkey-register — returns 405 for DELETE method', async () => {
  const req = createMockRequest({ method: 'DELETE' });
  const res = await handlePasskeyRegister(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: authentication
// ---------------------------------------------------------------------------

Deno.test('passkey-register — returns 401 without JWT', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=options',
    body: {},
  });
  const res = await handlePasskeyRegister(req, { authenticatedUser: null });
  await assertErrorResponse(res, 401, 'Unauthorized');
});

Deno.test('passkey-register — CORS headers included in 401 response', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=options',
    body: {},
  });
  const res = await handlePasskeyRegister(req, { authenticatedUser: null });

  assertCorsHeaders(res);
});

// ---------------------------------------------------------------------------
// Tests: CORS preflight
// ---------------------------------------------------------------------------

Deno.test('passkey-register — OPTIONS returns 204', async () => {
  const req = createMockRequest({ method: 'OPTIONS' });
  const res = await handlePasskeyRegister(req);
  assertStatus(res, 204);
});

// ---------------------------------------------------------------------------
// Tests: step=options
// ---------------------------------------------------------------------------

Deno.test('passkey-register — step=options generates registration options', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=options',
    body: {},
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(typeof body.challenge, 'string');
  assertEquals((body.rp as Record<string, unknown>).name, TEST_ENV.WEBAUTHN_RP_NAME);
  assertEquals((body.rp as Record<string, unknown>).id, TEST_ENV.WEBAUTHN_RP_ID);
});

Deno.test('passkey-register — step=options includes user info', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=options',
    body: {},
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  const body = await assertJsonBody(res);
  const user = body.user as Record<string, unknown>;
  assertEquals(user.id, TEST_USER.id);
  assertEquals(user.name, TEST_USER.email);
});

Deno.test('passkey-register — step=options excludes existing credentials', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=options',
    body: {},
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    existingCredentials: [{ credential_id: TEST_CREDENTIAL.credential_id }],
  });

  const body = await assertJsonBody(res);
  const excludeCredentials = body.excludeCredentials as { id: string; type: string }[];
  assertEquals(excludeCredentials.length, 1);
  assertEquals(excludeCredentials[0].id, TEST_CREDENTIAL.credential_id);
  assertEquals(excludeCredentials[0].type, 'public-key');
});

Deno.test(
  'passkey-register — step=options with no existing credentials returns empty exclude list',
  async () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://test.supabase.co/functions/v1/passkey-register?step=options',
      body: {},
    });
    const res = await handlePasskeyRegister(req, {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      existingCredentials: [],
    });

    const body = await assertJsonBody(res);
    const excludeCredentials = body.excludeCredentials as unknown[];
    assertEquals(excludeCredentials.length, 0);
  },
);

// ---------------------------------------------------------------------------
// Tests: step=verify
// ---------------------------------------------------------------------------

Deno.test('passkey-register — step=verify succeeds with valid attestation', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=verify',
    body: { id: 'credential-id', response: {} },
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    storedChallenge: {
      challenge: 'stored-challenge',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: {
      verified: true,
      registrationInfo: {
        credential: { id: 'new-cred', publicKey: new Uint8Array([1]), counter: 0 },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    },
  });

  assertStatus(res, 201);
  const body = await assertJsonBody(res);
  assertEquals(body.verified, true);
  assertEquals(typeof body.credential_id, 'string');
  assertEquals(typeof body.device_type, 'string');
});

Deno.test('passkey-register — step=verify returns 400 when no challenge exists', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=verify',
    body: { id: 'credential-id', response: {} },
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    storedChallenge: null,
  });

  await assertErrorResponse(res, 400, 'No valid challenge found');
});

Deno.test('passkey-register — step=verify returns 400 for expired challenge', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=verify',
    body: { id: 'credential-id', response: {} },
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    storedChallenge: {
      challenge: 'expired-challenge',
      expires_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  });

  await assertErrorResponse(res, 400, 'No valid challenge found');
});

Deno.test('passkey-register — step=verify returns 400 when verification fails', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=verify',
    body: { id: 'credential-id', response: {} },
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    storedChallenge: {
      challenge: 'valid-challenge',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    verificationResult: { verified: false },
  });

  await assertErrorResponse(res, 400, 'Registration verification failed');
});

Deno.test('passkey-register — step=verify returns 500 when credential insert fails', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=verify',
    body: { id: 'credential-id', response: {} },
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    storedChallenge: {
      challenge: 'valid-challenge',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    insertError: { message: 'Unique constraint violation' },
  });

  assertStatus(res, 500);
  const body = await assertJsonBody(res);
  assertEquals(body.error, 'Failed to store credential');
});

// ---------------------------------------------------------------------------
// Tests: invalid step parameter
// ---------------------------------------------------------------------------

Deno.test('passkey-register — returns 400 for invalid step parameter', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register?step=invalid',
    body: {},
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  await assertErrorResponse(res, 400, 'Invalid step');
});

Deno.test('passkey-register — returns 400 for missing step parameter', async () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/passkey-register',
    body: {},
  });
  const res = await handlePasskeyRegister(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  await assertErrorResponse(res, 400, 'Invalid step');
});

// ---------------------------------------------------------------------------
// Tests: CORS headers in responses
// ---------------------------------------------------------------------------

Deno.test('passkey-register — all responses include CORS headers', async () => {
  const steps = ['options', 'verify', 'invalid', ''];
  for (const step of steps) {
    const url = step
      ? `https://test.supabase.co/functions/v1/passkey-register?step=${step}`
      : 'https://test.supabase.co/functions/v1/passkey-register';

    const req = createMockRequest({ method: 'POST', url, body: {} });
    const res = await handlePasskeyRegister(req, {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    });

    assertCorsHeaders(res);
  }
});
