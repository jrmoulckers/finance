// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/abuse-detection.ts` (#272).
 *
 * Validates:
 *   - recordAbuseSignal delegates to the RPC and returns correct results
 *   - recordAbuseSignal fails open on RPC errors
 *   - checkAbuseStatus reads current count without altering thresholds
 *   - checkAbuseStatus fails open on errors
 *   - abuseBlockedResponse returns a well-formed 403 response
 *   - ABUSE_THRESHOLDS has configurations for all expected functions
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  recordAbuseSignal,
  checkAbuseStatus,
  abuseBlockedResponse,
  ABUSE_THRESHOLDS,
  type AbuseThreshold,
} from './abuse-detection.ts';
import type { RpcClient } from './rate-limit.ts';

// ---------------------------------------------------------------------------
// Helper: build mock RPC clients
// ---------------------------------------------------------------------------

function createMockRpcClient(result: {
  data: unknown;
  error: { message: string } | null;
}): RpcClient {
  return {
    rpc: (_fn: string, _params?: Record<string, unknown>) => Promise.resolve(result),
  };
}

function createThrowingRpcClient(): RpcClient {
  return {
    rpc: () => {
      throw new Error('DB connection failed');
    },
  };
}

function createCapturingRpcClient(result: { data: unknown; error: { message: string } | null }): {
  client: RpcClient;
  calls: { fn: string; params: Record<string, unknown> | undefined }[];
} {
  const calls: { fn: string; params: Record<string, unknown> | undefined }[] = [];
  return {
    calls,
    client: {
      rpc: (fn: string, params?: Record<string, unknown>) => {
        calls.push({ fn, params });
        return Promise.resolve(result);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const testThreshold: AbuseThreshold = {
  maxErrors: 5,
  windowSeconds: 60,
  keyPrefix: 'abuse-errors:test-function',
};

// ---------------------------------------------------------------------------
// recordAbuseSignal tests
// ---------------------------------------------------------------------------

Deno.test('recordAbuseSignal — returns not blocked when under threshold', async () => {
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: true, remaining: 3, reset_at: resetAt, current_count: 2 },
    error: null,
  });

  const result = await recordAbuseSignal(client, 'user-123', testThreshold);

  assertEquals(result.blocked, false);
  assertEquals(result.errorsRemaining, 3);
  assertEquals(result.retryAfterSeconds, undefined);
});

Deno.test('recordAbuseSignal — returns blocked when over threshold', async () => {
  const resetAt = new Date(Date.now() + 30_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: false, remaining: 0, reset_at: resetAt, current_count: 6 },
    error: null,
  });

  const result = await recordAbuseSignal(client, 'user-456', testThreshold);

  assertEquals(result.blocked, true);
  assertEquals(result.errorsRemaining, 0);
  assertEquals(typeof result.retryAfterSeconds, 'number');
  assertEquals(result.retryAfterSeconds! > 0, true);
});

Deno.test('recordAbuseSignal — fails open on RPC error', async () => {
  const client = createMockRpcClient({
    data: null,
    error: { message: 'function check_rate_limit does not exist' },
  });

  const result = await recordAbuseSignal(client, 'user-789', testThreshold);

  assertEquals(result.blocked, false);
});

Deno.test('recordAbuseSignal — fails open on null data', async () => {
  const client = createMockRpcClient({ data: null, error: null });

  const result = await recordAbuseSignal(client, 'user-abc', testThreshold);

  assertEquals(result.blocked, false);
});

Deno.test('recordAbuseSignal — fails open on RPC throw', async () => {
  const client = createThrowingRpcClient();

  const result = await recordAbuseSignal(client, 'user-def', testThreshold);

  assertEquals(result.blocked, false);
});

Deno.test('recordAbuseSignal — constructs correct composite key', async () => {
  const { client, calls } = createCapturingRpcClient({
    data: { allowed: true, remaining: 4, reset_at: new Date().toISOString(), current_count: 1 },
    error: null,
  });

  await recordAbuseSignal(client, 'my-user-id', testThreshold);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, 'check_rate_limit');
  assertEquals(calls[0].params?.p_key, 'abuse-errors:test-function:my-user-id');
  assertEquals(calls[0].params?.p_max_requests, 5);
  assertEquals(calls[0].params?.p_window_seconds, 60);
});

Deno.test('recordAbuseSignal — retryAfterSeconds is 0 when reset_at is in the past', async () => {
  const resetAt = new Date(Date.now() - 5000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: false, remaining: 0, reset_at: resetAt, current_count: 6 },
    error: null,
  });

  const result = await recordAbuseSignal(client, 'user-past', testThreshold);

  assertEquals(result.blocked, true);
  assertEquals(result.retryAfterSeconds, 0);
});

// ---------------------------------------------------------------------------
// checkAbuseStatus tests
// ---------------------------------------------------------------------------

Deno.test('checkAbuseStatus — returns not blocked when under threshold', async () => {
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: true, remaining: 999996, reset_at: resetAt, current_count: 3 },
    error: null,
  });

  const result = await checkAbuseStatus(client, 'user-123', testThreshold);

  assertEquals(result.blocked, false);
  assertEquals(result.errorsRemaining, 2); // maxErrors(5) - current_count(3)
});

Deno.test('checkAbuseStatus — returns blocked when current_count exceeds maxErrors', async () => {
  const resetAt = new Date(Date.now() + 30_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: true, remaining: 999993, reset_at: resetAt, current_count: 6 },
    error: null,
  });

  const result = await checkAbuseStatus(client, 'user-456', testThreshold);

  assertEquals(result.blocked, true);
  assertEquals(result.errorsRemaining, 0);
  assertEquals(typeof result.retryAfterSeconds, 'number');
  assertEquals(result.retryAfterSeconds! > 0, true);
});

Deno.test('checkAbuseStatus — uses high maxRequests to avoid RPC blocking', async () => {
  const { client, calls } = createCapturingRpcClient({
    data: {
      allowed: true,
      remaining: 999997,
      reset_at: new Date().toISOString(),
      current_count: 2,
    },
    error: null,
  });

  await checkAbuseStatus(client, 'test-id', testThreshold);

  assertEquals(calls[0].params?.p_max_requests, 999999);
});

Deno.test('checkAbuseStatus — fails open on RPC error', async () => {
  const client = createMockRpcClient({
    data: null,
    error: { message: 'connection timeout' },
  });

  const result = await checkAbuseStatus(client, 'user-err', testThreshold);

  assertEquals(result.blocked, false);
});

Deno.test('checkAbuseStatus — fails open on RPC throw', async () => {
  const client = createThrowingRpcClient();

  const result = await checkAbuseStatus(client, 'user-throw', testThreshold);

  assertEquals(result.blocked, false);
});

Deno.test('checkAbuseStatus — exactly at maxErrors is not blocked', async () => {
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: true, remaining: 999994, reset_at: resetAt, current_count: 5 },
    error: null,
  });

  const result = await checkAbuseStatus(client, 'user-exact', testThreshold);

  assertEquals(result.blocked, false);
  assertEquals(result.errorsRemaining, 0);
});

Deno.test('checkAbuseStatus — one over maxErrors is blocked', async () => {
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: true, remaining: 999993, reset_at: resetAt, current_count: 6 },
    error: null,
  });

  const result = await checkAbuseStatus(client, 'user-over', testThreshold);

  assertEquals(result.blocked, true);
});

// ---------------------------------------------------------------------------
// abuseBlockedResponse tests
// ---------------------------------------------------------------------------

Deno.test('abuseBlockedResponse — returns 403 status', () => {
  const response = abuseBlockedResponse(30);
  assertEquals(response.status, 403);
});

Deno.test('abuseBlockedResponse — includes Retry-After header when provided', () => {
  const response = abuseBlockedResponse(42);
  assertEquals(response.headers.get('Retry-After'), '42');
});

Deno.test('abuseBlockedResponse — omits Retry-After when undefined', () => {
  const response = abuseBlockedResponse();
  assertEquals(response.headers.get('Retry-After'), null);
});

Deno.test('abuseBlockedResponse — body contains generic error message', async () => {
  const response = abuseBlockedResponse(10);
  const body = await response.json();
  assertEquals(body.error, 'Request blocked');
});

Deno.test('abuseBlockedResponse — has JSON content type', () => {
  const response = abuseBlockedResponse(10);
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

Deno.test('abuseBlockedResponse — error message does not reveal abuse detection', async () => {
  const response = abuseBlockedResponse(10);
  const text = await response.clone().text();
  // Must not reveal detection mechanism
  assertEquals(text.includes('abuse'), false);
  assertEquals(text.includes('detection'), false);
  assertEquals(text.includes('threshold'), false);
});

// ---------------------------------------------------------------------------
// ABUSE_THRESHOLDS configuration validation
// ---------------------------------------------------------------------------

Deno.test('ABUSE_THRESHOLDS — has entries for all expected functions', () => {
  const expectedFunctions = [
    'health-check',
    'auth-webhook',
    'passkey-register',
    'passkey-authenticate',
    'household-invite',
    'data-export',
    'account-deletion',
    'sync-health-report',
    'process-recurring',
    'manage-webhooks',
    'admin-dashboard',
    'send-notification',
  ];

  for (const fn of expectedFunctions) {
    assertEquals(fn in ABUSE_THRESHOLDS, true, `ABUSE_THRESHOLDS should have entry for '${fn}'`);
  }
});

Deno.test('ABUSE_THRESHOLDS — all configs have positive maxErrors', () => {
  for (const [name, config] of Object.entries(ABUSE_THRESHOLDS)) {
    assertEquals(config.maxErrors > 0, true, `${name}: maxErrors should be positive`);
  }
});

Deno.test('ABUSE_THRESHOLDS — all configs have positive windowSeconds', () => {
  for (const [name, config] of Object.entries(ABUSE_THRESHOLDS)) {
    assertEquals(config.windowSeconds > 0, true, `${name}: windowSeconds should be positive`);
  }
});

Deno.test('ABUSE_THRESHOLDS — all keyPrefixes start with abuse-errors:', () => {
  for (const [name, config] of Object.entries(ABUSE_THRESHOLDS)) {
    assertEquals(
      config.keyPrefix.startsWith('abuse-errors:'),
      true,
      `${name}: keyPrefix should start with 'abuse-errors:'`,
    );
  }
});

Deno.test('ABUSE_THRESHOLDS — auth endpoints have strict limits', () => {
  assertEquals(ABUSE_THRESHOLDS['passkey-register'].maxErrors, 5);
  assertEquals(ABUSE_THRESHOLDS['passkey-authenticate'].maxErrors, 5);
  assertEquals(ABUSE_THRESHOLDS['passkey-register'].windowSeconds, 60);
  assertEquals(ABUSE_THRESHOLDS['passkey-authenticate'].windowSeconds, 60);
});

Deno.test('ABUSE_THRESHOLDS — destructive endpoints have strict limits', () => {
  assertEquals(ABUSE_THRESHOLDS['account-deletion'].maxErrors, 3);
  assertEquals(ABUSE_THRESHOLDS['account-deletion'].windowSeconds, 600);
});
