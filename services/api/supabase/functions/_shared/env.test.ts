// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/env.ts` (#616).
 *
 * Validates that validateEnv() returns 503 when required env vars are
 * missing and null when all are present, and that requireEnv() throws
 * for missing vars and returns the value for present ones.
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { validateEnv, requireEnv } from './env.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// Helper: set/clear env vars for isolated tests
// ---------------------------------------------------------------------------

/** Set multiple env vars and return a cleanup function. */
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

/** Delete multiple env vars and return a cleanup function. */
function deleteEnvVars(vars: string[]): () => void {
  const originals: Record<string, string | undefined> = {};
  for (const key of vars) {
    originals[key] = Deno.env.get(key);
    Deno.env.delete(key);
  }
  return () => {
    for (const key of vars) {
      const orig = originals[key];
      if (orig !== undefined) {
        Deno.env.set(key, orig);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Tests: validateEnv
// ---------------------------------------------------------------------------

Deno.test('validateEnv — returns null when all base env vars are set', () => {
  const cleanup = setEnvVars({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    assertEquals(result, null);
  } finally {
    cleanup();
  }
});

Deno.test('validateEnv — returns 503 when SUPABASE_URL is missing', () => {
  const cleanupDelete = deleteEnvVars(['SUPABASE_URL']);
  const cleanupSet = setEnvVars({
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    assertEquals(result instanceof Response, true);
    assertEquals(result!.status, 503);
  } finally {
    cleanupSet();
    cleanupDelete();
  }
});

Deno.test('validateEnv — returns 503 when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
  const cleanupDelete = deleteEnvVars(['SUPABASE_SERVICE_ROLE_KEY']);
  const cleanupSet = setEnvVars({
    SUPABASE_URL: 'https://test.supabase.co',
  });
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    assertEquals(result instanceof Response, true);
    assertEquals(result!.status, 503);
  } finally {
    cleanupSet();
    cleanupDelete();
  }
});

Deno.test('validateEnv — returns 503 when both base env vars are missing', () => {
  const cleanup = deleteEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    assertEquals(result instanceof Response, true);
    assertEquals(result!.status, 503);
  } finally {
    cleanup();
  }
});

Deno.test('validateEnv — 503 response includes Retry-After header', () => {
  const cleanup = deleteEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    assertEquals(result!.headers.get('Retry-After'), '60');
  } finally {
    cleanup();
  }
});

Deno.test('validateEnv — 503 response body does not reveal missing var names', async () => {
  const cleanup = deleteEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    const body = await result!.json();
    assertEquals(body.error, 'Service temporarily unavailable');
    // Ensure no env var names leak in response body
    const bodyStr = JSON.stringify(body);
    assertEquals(bodyStr.includes('SUPABASE_URL'), false);
    assertEquals(bodyStr.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
  } finally {
    cleanup();
  }
});

Deno.test('validateEnv — returns 503 when function-specific env var is missing', () => {
  const cleanupSet = setEnvVars({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });
  const cleanupDelete = deleteEnvVars(['WEBAUTHN_RP_NAME', 'WEBAUTHN_RP_ID', 'WEBAUTHN_ORIGIN']);
  try {
    const req = createMockRequest({});
    const result = validateEnv('passkey-register', req);
    assertEquals(result instanceof Response, true);
    assertEquals(result!.status, 503);
  } finally {
    cleanupDelete();
    cleanupSet();
  }
});

Deno.test('validateEnv — returns null when all function-specific env vars are set', () => {
  const cleanup = setEnvVars({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    WEBAUTHN_RP_NAME: 'Finance App',
    WEBAUTHN_RP_ID: 'finance.example.com',
    WEBAUTHN_ORIGIN: 'https://app.finance.example.com',
  });
  try {
    const req = createMockRequest({});
    const result = validateEnv('passkey-register', req);
    assertEquals(result, null);
  } finally {
    cleanup();
  }
});

Deno.test('validateEnv — handles unknown function name gracefully (base vars only)', () => {
  const cleanup = setEnvVars({
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  });
  try {
    const req = createMockRequest({});
    const result = validateEnv('unknown-function', req);
    assertEquals(result, null);
  } finally {
    cleanup();
  }
});

Deno.test('validateEnv — 503 response has Content-Type application/json', () => {
  const cleanup = deleteEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  try {
    const req = createMockRequest({});
    const result = validateEnv('health-check', req);
    assertEquals(result!.headers.get('Content-Type'), 'application/json');
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// Tests: requireEnv
// ---------------------------------------------------------------------------

Deno.test('requireEnv — returns value when env var is set', () => {
  const cleanup = setEnvVars({ TEST_ENV_VAR_FOR_REQUIRE: 'test-value' });
  try {
    const result = requireEnv('TEST_ENV_VAR_FOR_REQUIRE');
    assertEquals(result, 'test-value');
  } finally {
    cleanup();
  }
});

Deno.test('requireEnv — throws when env var is missing', () => {
  const cleanup = deleteEnvVars(['TEST_ENV_VAR_MISSING']);
  try {
    assertThrows(
      () => requireEnv('TEST_ENV_VAR_MISSING'),
      Error,
      'Missing required env var: TEST_ENV_VAR_MISSING',
    );
  } finally {
    cleanup();
  }
});
