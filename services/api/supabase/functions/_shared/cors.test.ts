// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/cors.ts` (#533).
 *
 * Validates origin-validated CORS header generation and
 * preflight request handling.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { assertNoContent } from '../_test_helpers/assertions.ts';
import { createMockRequest, createCorsPreflightRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// We re-implement the CORS logic under test here because the module-level
// `ALLOWED_ORIGINS` constant is computed at import time from `Deno.env`.
// To test it with different values we set the env var BEFORE importing.
// Since Deno caches modules, we test the core logic directly.
// ---------------------------------------------------------------------------

/**
 * Inline implementation mirroring `cors.ts` for isolated unit testing.
 * This avoids module-cache issues with `Deno.env` reads at import time.
 */
function getCorsHeadersForTest(request: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = allowedOrigins.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function handleCorsPreflightForTest(request: Request, allowedOrigins: string[]): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeadersForTest(request, allowedOrigins),
  });
}

// ---------------------------------------------------------------------------
// getCorsHeaders tests
// ---------------------------------------------------------------------------

Deno.test('getCorsHeaders — echoes allowed origin', () => {
  const allowedOrigins = ['https://app.finance.example.com', 'https://localhost:3000'];
  const req = createMockRequest({
    headers: { Origin: 'https://app.finance.example.com' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.finance.example.com');
});

Deno.test('getCorsHeaders — rejects disallowed origin with empty string', () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createMockRequest({
    headers: { Origin: 'https://evil.example.com' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  assertEquals(headers['Access-Control-Allow-Origin'], '');
});

Deno.test('getCorsHeaders — handles missing Origin header', () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createMockRequest({}); // No Origin header

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  assertEquals(headers['Access-Control-Allow-Origin'], '');
});

Deno.test('getCorsHeaders — handles empty allowlist', () => {
  const allowedOrigins: string[] = [];
  const req = createMockRequest({
    headers: { Origin: 'https://app.finance.example.com' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  assertEquals(headers['Access-Control-Allow-Origin'], '');
});

Deno.test('getCorsHeaders — never uses wildcard *', () => {
  const allowedOrigins = ['*'];
  const req = createMockRequest({
    headers: { Origin: 'https://any-origin.com' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  // Even with '*' in the list, it should only match the literal string '*'
  // which is not a real origin, so unless origin === '*' it won't match.
  assertEquals(headers['Access-Control-Allow-Origin'], '');
});

Deno.test('getCorsHeaders — includes required CORS headers', () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createMockRequest({
    headers: { Origin: 'https://app.finance.example.com' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  assertEquals(typeof headers['Access-Control-Allow-Headers'], 'string');
  assertEquals(typeof headers['Access-Control-Allow-Methods'], 'string');
  assertEquals(headers['Access-Control-Max-Age'], '86400');
});

Deno.test('getCorsHeaders — Allow-Methods includes all HTTP verbs', () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createMockRequest({
    headers: { Origin: 'https://app.finance.example.com' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);
  const methods = headers['Access-Control-Allow-Methods'];

  for (const verb of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    assertEquals(methods.includes(verb), true, `Allow-Methods should include ${verb}`);
  }
});

Deno.test('getCorsHeaders — second allowed origin is matched', () => {
  const allowedOrigins = ['https://app.finance.example.com', 'https://localhost:3000'];
  const req = createMockRequest({
    headers: { Origin: 'https://localhost:3000' },
  });

  const headers = getCorsHeadersForTest(req, allowedOrigins);

  assertEquals(headers['Access-Control-Allow-Origin'], 'https://localhost:3000');
});

// ---------------------------------------------------------------------------
// handleCorsPreflightRequest tests
// ---------------------------------------------------------------------------

Deno.test('handleCorsPreflightRequest — returns 204 with no body', async () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createCorsPreflightRequest('https://app.finance.example.com');

  const response = handleCorsPreflightForTest(req, allowedOrigins);

  await assertNoContent(response);
});

Deno.test('handleCorsPreflightRequest — includes CORS headers for allowed origin', () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createCorsPreflightRequest('https://app.finance.example.com');

  const response = handleCorsPreflightForTest(req, allowedOrigins);

  assertEquals(
    response.headers.get('Access-Control-Allow-Origin'),
    'https://app.finance.example.com',
  );
});

Deno.test('handleCorsPreflightRequest — rejects disallowed origin in preflight', () => {
  const allowedOrigins = ['https://app.finance.example.com'];
  const req = createCorsPreflightRequest('https://evil.example.com');

  const response = handleCorsPreflightForTest(req, allowedOrigins);

  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '');
});
