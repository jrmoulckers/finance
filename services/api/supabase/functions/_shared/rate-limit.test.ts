// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/rate-limit.ts` (#614).
 *
 * Validates:
 *   - getClientIp extracts IPs from standard proxy headers
 *   - checkRateLimit delegates to the RPC and parses results
 *   - checkRateLimit fails open on RPC errors
 *   - rateLimitResponse returns a well-formed 429 response
 *   - RATE_LIMITS has correct configurations for all functions
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
  type RateLimitConfig,
  type RateLimitResult,
  type RpcClient,
} from './rate-limit.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// Helper: set/clear env vars for CORS in rateLimitResponse tests
// ---------------------------------------------------------------------------

function setEnvVars(vars: Record<string, string>): () => void {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    originals[key] = Deno.env.get(key);
    Deno.env.set(key, value);
  }
  return () => {
    for (const [key] of Object.entries(vars)) {
      const orig = originals[key];
      if (orig === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, orig);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Helper: build a mock RPC client
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

// ---------------------------------------------------------------------------
// getClientIp tests
// ---------------------------------------------------------------------------

Deno.test('getClientIp — extracts IP from X-Forwarded-For header', () => {
  const req = createMockRequest({
    headers: { 'X-Forwarded-For': '203.0.113.50, 70.41.3.18, 150.172.238.178' },
  });
  assertEquals(getClientIp(req), '203.0.113.50');
});

Deno.test('getClientIp — extracts single IP from X-Forwarded-For', () => {
  const req = createMockRequest({
    headers: { 'X-Forwarded-For': '192.168.1.1' },
  });
  assertEquals(getClientIp(req), '192.168.1.1');
});

Deno.test('getClientIp — falls back to X-Real-IP when X-Forwarded-For is absent', () => {
  const req = createMockRequest({
    headers: { 'X-Real-IP': '10.0.0.1' },
  });
  assertEquals(getClientIp(req), '10.0.0.1');
});

Deno.test('getClientIp — returns null when no proxy headers are present', () => {
  const req = createMockRequest({});
  assertEquals(getClientIp(req), null);
});

Deno.test('getClientIp — prefers X-Forwarded-For over X-Real-IP', () => {
  const req = createMockRequest({
    headers: {
      'X-Forwarded-For': '172.16.0.1',
      'X-Real-IP': '10.0.0.1',
    },
  });
  assertEquals(getClientIp(req), '172.16.0.1');
});

Deno.test('getClientIp — returns null for empty X-Forwarded-For', () => {
  const req = createMockRequest({
    headers: { 'X-Forwarded-For': '' },
  });
  assertEquals(getClientIp(req), null);
});

// ---------------------------------------------------------------------------
// checkRateLimit tests
// ---------------------------------------------------------------------------

const testConfig: RateLimitConfig = {
  maxRequests: 10,
  windowSeconds: 60,
  keyPrefix: 'test-function',
};

Deno.test('checkRateLimit — returns allowed when under the limit', async () => {
  const resetAt = new Date(Date.now() + 60_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: true, remaining: 7, reset_at: resetAt, current_count: 3 },
    error: null,
  });

  const result = await checkRateLimit(client, 'user-123', testConfig);

  assertEquals(result.allowed, true);
  assertEquals(result.remaining, 7);
  assertEquals(result.retryAfterSeconds, undefined);
});

Deno.test('checkRateLimit — returns denied when over the limit', async () => {
  const resetAt = new Date(Date.now() + 30_000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: false, remaining: 0, reset_at: resetAt, current_count: 11 },
    error: null,
  });

  const result = await checkRateLimit(client, 'user-456', testConfig);

  assertEquals(result.allowed, false);
  assertEquals(result.remaining, 0);
  assertEquals(typeof result.retryAfterSeconds, 'number');
  assertEquals(result.retryAfterSeconds! > 0, true);
});

Deno.test('checkRateLimit — fails open on RPC error', async () => {
  const client = createMockRpcClient({
    data: null,
    error: { message: 'function check_rate_limit does not exist' },
  });

  const result = await checkRateLimit(client, 'user-789', testConfig);

  assertEquals(result.allowed, true);
});

Deno.test('checkRateLimit — fails open when RPC returns null data', async () => {
  const client = createMockRpcClient({
    data: null,
    error: null,
  });

  const result = await checkRateLimit(client, 'user-abc', testConfig);

  assertEquals(result.allowed, true);
});

Deno.test('checkRateLimit — fails open when RPC throws', async () => {
  const client = createThrowingRpcClient();

  const result = await checkRateLimit(client, 'user-def', testConfig);

  assertEquals(result.allowed, true);
});

Deno.test('checkRateLimit — constructs correct composite key', async () => {
  let capturedParams: Record<string, unknown> | undefined;

  const client: RpcClient = {
    rpc: (_fn: string, params?: Record<string, unknown>) => {
      capturedParams = params;
      return Promise.resolve({
        data: { allowed: true, remaining: 9, reset_at: new Date().toISOString(), current_count: 1 },
        error: null,
      });
    },
  };

  await checkRateLimit(client, 'my-user-id', {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'household-invite',
  });

  assertEquals(capturedParams?.p_key, 'household-invite:my-user-id');
  assertEquals(capturedParams?.p_max_requests, 10);
  assertEquals(capturedParams?.p_window_seconds, 60);
});

Deno.test('checkRateLimit — calls correct RPC function name', async () => {
  let capturedFn: string | undefined;

  const client: RpcClient = {
    rpc: (fn: string, _params?: Record<string, unknown>) => {
      capturedFn = fn;
      return Promise.resolve({
        data: { allowed: true, remaining: 9, reset_at: new Date().toISOString(), current_count: 1 },
        error: null,
      });
    },
  };

  await checkRateLimit(client, 'test-id', testConfig);

  assertEquals(capturedFn, 'check_rate_limit');
});

Deno.test('checkRateLimit — retryAfterSeconds is 0 when reset_at is in the past', async () => {
  const resetAt = new Date(Date.now() - 5000).toISOString();
  const client = createMockRpcClient({
    data: { allowed: false, remaining: 0, reset_at: resetAt, current_count: 11 },
    error: null,
  });

  const result = await checkRateLimit(client, 'user-past', testConfig);

  assertEquals(result.allowed, false);
  assertEquals(result.retryAfterSeconds, 0);
});

// ---------------------------------------------------------------------------
// rateLimitResponse tests
// ---------------------------------------------------------------------------

Deno.test('rateLimitResponse — returns 429 status', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: 'https://app.finance.example.com' });
  try {
    const req = createMockRequest({
      headers: { Origin: 'https://app.finance.example.com' },
    });
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-03-23T12:00:00Z'),
      retryAfterSeconds: 42,
    };

    const response = rateLimitResponse(req, result, testConfig);

    assertEquals(response.status, 429);
  } finally {
    cleanup();
  }
});

Deno.test('rateLimitResponse — includes Retry-After header', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: 'https://app.finance.example.com' });
  try {
    const req = createMockRequest({
      headers: { Origin: 'https://app.finance.example.com' },
    });
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-03-23T12:00:00Z'),
      retryAfterSeconds: 42,
    };

    const response = rateLimitResponse(req, result, testConfig);

    assertEquals(response.headers.get('Retry-After'), '42');
  } finally {
    cleanup();
  }
});

Deno.test('rateLimitResponse — includes X-RateLimit headers', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: 'https://app.finance.example.com' });
  try {
    const req = createMockRequest({
      headers: { Origin: 'https://app.finance.example.com' },
    });
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-03-23T12:00:00Z'),
      retryAfterSeconds: 42,
    };
    const config: RateLimitConfig = { maxRequests: 30, windowSeconds: 60, keyPrefix: 'test' };

    const response = rateLimitResponse(req, result, config);

    assertEquals(response.headers.get('X-RateLimit-Limit'), '30');
    assertEquals(response.headers.get('X-RateLimit-Remaining'), '0');
    assertEquals(response.headers.get('X-RateLimit-Reset'), '2026-03-23T12:00:00.000Z');
  } finally {
    cleanup();
  }
});

Deno.test('rateLimitResponse — body contains error message', async () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: '' });
  try {
    const req = createMockRequest({});
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfterSeconds: 10,
    };

    const response = rateLimitResponse(req, result, testConfig);
    const body = await response.json();

    assertEquals(body.error, 'Too many requests');
  } finally {
    cleanup();
  }
});

Deno.test('rateLimitResponse — has JSON content type', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: '' });
  try {
    const req = createMockRequest({});
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfterSeconds: 10,
    };

    const response = rateLimitResponse(req, result, testConfig);

    assertEquals(response.headers.get('Content-Type'), 'application/json');
  } finally {
    cleanup();
  }
});

Deno.test('rateLimitResponse — CORS origin is validated', () => {
  const cleanup = setEnvVars({ ALLOWED_ORIGINS: 'https://app.finance.example.com' });
  try {
    const req = createMockRequest({
      headers: { Origin: 'https://evil.example.com' },
    });
    const result: RateLimitResult = {
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfterSeconds: 5,
    };

    const response = rateLimitResponse(req, result, testConfig);

    // Disallowed origins get an empty string, not a wildcard
    assertEquals(response.headers.get('Access-Control-Allow-Origin'), '');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// RATE_LIMITS configuration validation
// ---------------------------------------------------------------------------

Deno.test('RATE_LIMITS — has entries for all expected functions', () => {
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
  ];

  for (const fn of expectedFunctions) {
    assertEquals(fn in RATE_LIMITS, true, `RATE_LIMITS should have entry for '${fn}'`);
  }
});

Deno.test('RATE_LIMITS — all configs have positive maxRequests', () => {
  for (const [name, config] of Object.entries(RATE_LIMITS)) {
    assertEquals(config.maxRequests > 0, true, `${name}: maxRequests should be positive`);
  }
});

Deno.test('RATE_LIMITS — all configs have positive windowSeconds', () => {
  for (const [name, config] of Object.entries(RATE_LIMITS)) {
    assertEquals(config.windowSeconds > 0, true, `${name}: windowSeconds should be positive`);
  }
});

Deno.test('RATE_LIMITS — all configs have non-empty keyPrefix', () => {
  for (const [name, config] of Object.entries(RATE_LIMITS)) {
    assertEquals(config.keyPrefix.length > 0, true, `${name}: keyPrefix should be non-empty`);
  }
});

Deno.test('RATE_LIMITS — data-export has hourly window', () => {
  assertEquals(RATE_LIMITS['data-export'].windowSeconds, 3600);
  assertEquals(RATE_LIMITS['data-export'].maxRequests, 10);
});

Deno.test('RATE_LIMITS — account-deletion has strict limit', () => {
  assertEquals(RATE_LIMITS['account-deletion'].windowSeconds, 3600);
  assertEquals(RATE_LIMITS['account-deletion'].maxRequests, 3);
});

Deno.test('RATE_LIMITS — health-check has per-minute limit', () => {
  assertEquals(RATE_LIMITS['health-check'].windowSeconds, 60);
  assertEquals(RATE_LIMITS['health-check'].maxRequests, 60);
});

Deno.test('RATE_LIMITS — passkey-authenticate is per-minute (pre-auth)', () => {
  assertEquals(RATE_LIMITS['passkey-authenticate'].windowSeconds, 60);
  assertEquals(RATE_LIMITS['passkey-authenticate'].maxRequests, 20);
});
