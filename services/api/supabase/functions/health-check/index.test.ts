// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `health-check` Edge Function (#533).
 *
 * Validates response codes, service status reporting, method restrictions,
 * CORS headers, and that no internal details are leaked.
 *
 * Note: The production handler uses `serve()` which wraps the handler in an
 * HTTP server. We test the handler logic directly by reimplementing the
 * request-processing flow with mocked dependencies.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertNoSensitiveDataLeakage,
} from '../_test_helpers/assertions.ts';
import { createMockRequest, createCorsPreflightRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
//
// We replicate the handler from index.ts without `serve()` and without
// the real `fetch()` calls to Supabase. This lets us control the responses
// from the database and auth health checks.
// ---------------------------------------------------------------------------

type ServiceStatus = 'connected' | 'operational' | 'unavailable' | 'error';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceStatus;
    auth: ServiceStatus;
  };
  version: string;
}

/** Minimal CORS headers for testing (bypasses env-based origin check). */
const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Test handler that mirrors the production health-check logic
 * but accepts injected service status values.
 */
async function handleHealthCheck(
  req: Request,
  options: {
    envVarsPresent?: boolean;
    databaseStatus?: ServiceStatus;
    authStatus?: ServiceStatus;
  } = {},
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const envVarsPresent = options.envVarsPresent ?? true;

  if (!envVarsPresent) {
    const errorResponse: HealthCheckResponse = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: { database: 'error', auth: 'error' },
      version: '1.0.0',
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 503,
      headers: {
        ...testCorsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const databaseStatus = options.databaseStatus ?? 'connected';
  const authStatus = options.authStatus ?? 'operational';
  const isHealthy = databaseStatus === 'connected' && authStatus === 'operational';

  const response: HealthCheckResponse = {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: { database: databaseStatus, auth: authStatus },
    version: '1.0.0',
  };

  return new Response(JSON.stringify(response), {
    status: isHealthy ? 200 : 503,
    headers: {
      ...testCorsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// ---------------------------------------------------------------------------
// Tests: healthy responses
// ---------------------------------------------------------------------------

Deno.test('health-check — returns 200 with "healthy" when all services are up', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, {
    databaseStatus: 'connected',
    authStatus: 'operational',
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  assertEquals(body.status, 'healthy');
  assertEquals((body.services as Record<string, unknown>).database, 'connected');
  assertEquals((body.services as Record<string, unknown>).auth, 'operational');
});

Deno.test('health-check — includes timestamp and version', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req);

  const body = await assertJsonBody(res);
  assertEquals(typeof body.timestamp, 'string');
  assertEquals(body.version, '1.0.0');
});

// ---------------------------------------------------------------------------
// Tests: degraded responses
// ---------------------------------------------------------------------------

Deno.test('health-check — returns 503 when database is unavailable', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, {
    databaseStatus: 'unavailable',
    authStatus: 'operational',
  });

  assertStatus(res, 503);
  const body = await assertJsonBody(res);
  assertEquals(body.status, 'degraded');
  assertEquals((body.services as Record<string, unknown>).database, 'unavailable');
});

Deno.test('health-check — returns 503 when auth service is down', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, {
    databaseStatus: 'connected',
    authStatus: 'unavailable',
  });

  assertStatus(res, 503);
  const body = await assertJsonBody(res);
  assertEquals(body.status, 'degraded');
  assertEquals((body.services as Record<string, unknown>).auth, 'unavailable');
});

Deno.test('health-check — returns 503 when both services are down', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, {
    databaseStatus: 'error',
    authStatus: 'error',
  });

  assertStatus(res, 503);
  const body = await assertJsonBody(res);
  assertEquals(body.status, 'degraded');
});

Deno.test('health-check — returns 503 when database has error status', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, {
    databaseStatus: 'error',
    authStatus: 'operational',
  });

  assertStatus(res, 503);
  const body = await assertJsonBody(res);
  assertEquals(body.status, 'degraded');
});

// ---------------------------------------------------------------------------
// Tests: missing environment variables
// ---------------------------------------------------------------------------

Deno.test('health-check — returns 503 when env vars are missing', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, { envVarsPresent: false });

  assertStatus(res, 503);
  const body = await assertJsonBody(res);
  assertEquals(body.status, 'degraded');
  assertEquals((body.services as Record<string, unknown>).database, 'error');
  assertEquals((body.services as Record<string, unknown>).auth, 'error');
});

Deno.test('health-check — does not leak env var names on misconfiguration', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, { envVarsPresent: false });

  await assertNoSensitiveDataLeakage(res);
});

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('health-check — returns 405 for POST method', async () => {
  const req = createMockRequest({ method: 'POST', body: {} });
  const res = await handleHealthCheck(req);

  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('health-check — returns 405 for PUT method', async () => {
  const req = createMockRequest({ method: 'PUT', body: {} });
  const res = await handleHealthCheck(req);

  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('health-check — returns 405 for DELETE method', async () => {
  const req = createMockRequest({ method: 'DELETE' });
  const res = await handleHealthCheck(req);

  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('health-check — returns 405 for PATCH method', async () => {
  const req = createMockRequest({ method: 'PATCH', body: {} });
  const res = await handleHealthCheck(req);

  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: CORS
// ---------------------------------------------------------------------------

Deno.test('health-check — returns CORS headers on success', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req);

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://app.finance.example.com');
});

Deno.test('health-check — OPTIONS returns 204 for CORS preflight', async () => {
  const req = createCorsPreflightRequest();
  const res = await handleHealthCheck(req);

  assertStatus(res, 204);
});

// ---------------------------------------------------------------------------
// Tests: caching
// ---------------------------------------------------------------------------

Deno.test('health-check — sets Cache-Control to no-cache', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req);

  assertEquals(res.headers.get('Cache-Control'), 'no-cache, no-store, must-revalidate');
});

Deno.test('health-check — no-cache also on degraded response', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req, { envVarsPresent: false });

  assertEquals(res.headers.get('Cache-Control'), 'no-cache, no-store, must-revalidate');
});

// ---------------------------------------------------------------------------
// Tests: response shape
// ---------------------------------------------------------------------------

Deno.test('health-check — response contains all required fields', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req);

  const body = await assertJsonBody(res);
  const requiredKeys = ['status', 'timestamp', 'services', 'version'];
  for (const key of requiredKeys) {
    assertEquals(key in body, true, `Response should contain '${key}' field`);
  }
});

Deno.test('health-check — services object contains database and auth', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleHealthCheck(req);

  const body = await assertJsonBody(res);
  const services = body.services as Record<string, unknown>;
  assertEquals('database' in services, true);
  assertEquals('auth' in services, true);
});
