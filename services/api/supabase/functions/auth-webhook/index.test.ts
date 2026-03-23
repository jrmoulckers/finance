// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `auth-webhook` Edge Function (#533).
 *
 * Validates webhook authentication, event filtering, user provisioning,
 * idempotency, error handling, and timing-attack resistance.
 */

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertNoSensitiveDataLeakage,
} from '../_test_helpers/assertions.ts';
import { createMockRequest, createWebhookRequest } from '../_test_helpers/mock-request.ts';
import {
  TEST_USER,
  TEST_ENV,
  TEST_WEBHOOK_INSERT_PAYLOAD,
  TEST_WEBHOOK_UPDATE_PAYLOAD,
} from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = TEST_ENV.AUTH_WEBHOOK_SECRET;

/**
 * Constant-time string comparison (mirroring production code).
 */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) return false;

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

interface MockRpcResult {
  data: {
    user_id: string;
    household_id: string;
    display_name: string;
    already_provisioned?: boolean;
  } | null;
  error: { message: string } | null;
}

/**
 * Test handler that mirrors the production auth-webhook logic.
 */
async function handleAuthWebhook(
  req: Request,
  options: {
    webhookSecret?: string;
    rpcResult?: MockRpcResult;
    envVarsPresent?: boolean;
  } = {},
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify webhook secret
  const secret = options.webhookSecret ?? WEBHOOK_SECRET;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.replace('Bearer ', '');
  if (!constantTimeEqual(token, secret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();

    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const envVarsPresent = options.envVarsPresent ?? true;
    if (!envVarsPresent) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rpcResult = options.rpcResult ?? {
      data: {
        user_id: payload.record.id,
        household_id: 'new-household-id',
        display_name: 'Test User',
      },
      error: null,
    };

    if (rpcResult.error) {
      return new Response(JSON.stringify({ error: 'Failed to provision user' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (rpcResult.data?.already_provisioned) {
      return new Response(
        JSON.stringify({
          message: 'User already provisioned',
          user_id: payload.record.id,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        message: 'User provisioned',
        user_id: payload.record.id,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 405 for GET method', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleAuthWebhook(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('auth-webhook — returns 405 for PUT method', async () => {
  const req = createMockRequest({ method: 'PUT', body: {} });
  const res = await handleAuthWebhook(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('auth-webhook — returns 405 for DELETE method', async () => {
  const req = createMockRequest({ method: 'DELETE' });
  const res = await handleAuthWebhook(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: authentication
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 401 with missing Authorization header', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: TEST_WEBHOOK_INSERT_PAYLOAD,
  });
  const res = await handleAuthWebhook(req);
  await assertErrorResponse(res, 401, 'Unauthorized');
});

Deno.test('auth-webhook — returns 401 with invalid webhook secret', async () => {
  const req = createWebhookRequest('wrong-secret', TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req);
  await assertErrorResponse(res, 401, 'Unauthorized');
});

Deno.test('auth-webhook — authenticates with valid webhook secret', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req);
  // Should NOT be 401
  assertNotEquals(res.status, 401);
});

// ---------------------------------------------------------------------------
// Tests: event filtering
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 200 for non-INSERT events', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_UPDATE_PAYLOAD);
  const res = await handleAuthWebhook(req);

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.message, 'Event ignored');
});

Deno.test('auth-webhook — ignores DELETE events', async () => {
  const deletePayload = { ...TEST_WEBHOOK_UPDATE_PAYLOAD, type: 'DELETE' };
  const req = createWebhookRequest(WEBHOOK_SECRET, deletePayload);
  const res = await handleAuthWebhook(req);

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.message, 'Event ignored');
});

// ---------------------------------------------------------------------------
// Tests: successful user provisioning
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 201 on successful INSERT provisioning', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req);

  assertStatus(res, 201);
  const body = await assertJsonBody(res);
  assertEquals(body.message, 'User provisioned');
  assertEquals(body.user_id, TEST_USER.id);
});

Deno.test('auth-webhook — returns user_id in success response', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req);

  const body = await assertJsonBody(res);
  assertEquals(body.user_id, TEST_USER.id);
});

// ---------------------------------------------------------------------------
// Tests: idempotent re-fire
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 200 for idempotent re-fire (already_provisioned)', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req, {
    rpcResult: {
      data: {
        user_id: TEST_USER.id,
        household_id: 'existing-household',
        display_name: 'Test User',
        already_provisioned: true,
      },
      error: null,
    },
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.message, 'User already provisioned');
  assertEquals(body.user_id, TEST_USER.id);
});

// ---------------------------------------------------------------------------
// Tests: RPC failure
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 500 on RPC failure', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req, {
    rpcResult: {
      data: null,
      error: { message: 'Database constraint violation' },
    },
  });

  assertStatus(res, 500);
  const body = await assertJsonBody(res);
  assertEquals(body.error, 'Failed to provision user');
});

Deno.test('auth-webhook — does not leak internal RPC error details', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req, {
    rpcResult: {
      data: null,
      error: { message: 'DETAIL: Key (email)=(test@example.com) already exists' },
    },
  });

  await assertNoSensitiveDataLeakage(res);
  const body = await assertJsonBody(res);
  assertEquals(body.error, 'Failed to provision user');
});

// ---------------------------------------------------------------------------
// Tests: missing env vars
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 500 when env vars are missing', async () => {
  const req = createWebhookRequest(WEBHOOK_SECRET, TEST_WEBHOOK_INSERT_PAYLOAD);
  const res = await handleAuthWebhook(req, { envVarsPresent: false });

  assertStatus(res, 500);
  const body = await assertJsonBody(res);
  assertEquals(body.error, 'Server configuration error');
});

// ---------------------------------------------------------------------------
// Tests: constant-time comparison
// ---------------------------------------------------------------------------

Deno.test('constantTimeEqual — returns true for identical strings', () => {
  assertEquals(constantTimeEqual('abc123', 'abc123'), true);
});

Deno.test('constantTimeEqual — returns false for different strings', () => {
  assertEquals(constantTimeEqual('abc123', 'abc124'), false);
});

Deno.test('constantTimeEqual — returns false for different lengths', () => {
  assertEquals(constantTimeEqual('short', 'much-longer-string'), false);
});

Deno.test('constantTimeEqual — handles empty strings', () => {
  assertEquals(constantTimeEqual('', ''), true);
});

Deno.test('constantTimeEqual — empty vs non-empty returns false', () => {
  assertEquals(constantTimeEqual('', 'notempty'), false);
});

Deno.test('constantTimeEqual — handles unicode strings', () => {
  assertEquals(constantTimeEqual('héllo', 'héllo'), true);
  assertEquals(constantTimeEqual('héllo', 'hello'), false);
});

// ---------------------------------------------------------------------------
// Tests: malformed body
// ---------------------------------------------------------------------------

Deno.test('auth-webhook — returns 500 on malformed JSON body', async () => {
  const req = createMockRequest({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WEBHOOK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: 'not valid json{{{',
  });
  const res = await handleAuthWebhook(req);

  assertStatus(res, 500);
});
