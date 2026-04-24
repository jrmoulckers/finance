// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `consent-management` Edge Function (#1100).
 *
 * Validates consent recording, querying, validation, and error handling.
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
import { TEST_USER } from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing (mirrors index.ts patterns)
// ---------------------------------------------------------------------------

const VALID_CONSENT_TYPES = new Set([
  'terms_of_service',
  'privacy_policy',
  'data_processing',
  'marketing_email',
  'analytics',
  'third_party_sharing',
  'biometric_data',
]);

const VALID_STATUSES = new Set(['granted', 'withdrawn']);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface MockConsentDeps {
  userId?: string;
  existingConsents?: Array<{
    id: string;
    consent_type: string;
    status: string;
    policy_version: string;
    created_at: string;
  }>;
  insertResult?: { id: string } | null;
  insertError?: boolean;
}

function jsonRes(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
  });
}

function errRes(message: string, status = 400): Response {
  return jsonRes({ error: message }, status);
}

async function handleConsent(req: Request, deps: MockConsentDeps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errRes('Method not allowed', 405);
  }

  // Simulated auth check
  const userId = deps.userId ?? TEST_USER.id;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const consentType = url.searchParams.get('type');

    if (consentType && !VALID_CONSENT_TYPES.has(consentType)) {
      return errRes(`Invalid consent type: ${consentType}`);
    }

    const consents = (deps.existingConsents ?? []).filter(
      (c) => !consentType || c.consent_type === consentType,
    );

    return jsonRes({ consents });
  }

  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errRes('Invalid JSON body');
    }

    const { consent_type, status, policy_version, metadata } = body;

    // Validate consent_type
    if (!consent_type || typeof consent_type !== 'string') {
      return errRes('consent_type is required');
    }
    if (!VALID_CONSENT_TYPES.has(consent_type)) {
      return errRes(
        `Invalid consent_type. Must be one of: ${Array.from(VALID_CONSENT_TYPES).join(', ')}`,
      );
    }

    // Validate status
    if (!status || typeof status !== 'string') {
      return errRes('status is required (granted or withdrawn)');
    }
    if (!VALID_STATUSES.has(status)) {
      return errRes('status must be "granted" or "withdrawn"');
    }

    // Validate policy_version
    if (!policy_version || typeof policy_version !== 'string') {
      return errRes('policy_version is required (semver format, e.g. "1.0.0")');
    }
    if (!SEMVER_PATTERN.test(policy_version as string)) {
      return errRes('policy_version must be in semver format (e.g. "1.0.0")');
    }

    // Validate metadata
    if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null)) {
      return errRes('metadata must be a JSON object if provided');
    }

    if (deps.insertError) {
      return errRes('Internal server error', 500);
    }

    const insertResult = deps.insertResult ?? {
      id: 'new-consent-id',
    };

    return jsonRes(
      {
        consent: {
          id: insertResult.id,
          consent_type,
          status,
          policy_version,
          created_at: new Date().toISOString(),
        },
        message: `Consent ${status === 'granted' ? 'granted' : 'withdrawn'} successfully`,
      },
      201,
    );
  }

  return errRes('Method not allowed', 405);
}

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('consent-management — returns 405 for PUT', async () => {
  const req = createMockRequest({ method: 'PUT', body: {} });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('consent-management — returns 405 for DELETE', async () => {
  const req = createMockRequest({ method: 'DELETE' });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: CORS preflight
// ---------------------------------------------------------------------------

Deno.test('consent-management — OPTIONS returns 204', async () => {
  const req = createMockRequest({ method: 'OPTIONS' });
  const res = await handleConsent(req);
  assertStatus(res, 204);
});

// ---------------------------------------------------------------------------
// Tests: GET consent status
// ---------------------------------------------------------------------------

Deno.test('consent-management — GET returns current consents', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/consent-management',
  });
  const res = await handleConsent(req, {
    existingConsents: [
      {
        id: 'consent-1',
        consent_type: 'privacy_policy',
        status: 'granted',
        policy_version: '1.0.0',
        created_at: '2024-01-15T10:00:00.000Z',
      },
    ],
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  const consents = body.consents as unknown[];
  assertEquals(consents.length, 1);
});

Deno.test('consent-management — GET with type filter', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/consent-management?type=marketing_email',
  });
  const res = await handleConsent(req, {
    existingConsents: [
      {
        id: 'consent-1',
        consent_type: 'privacy_policy',
        status: 'granted',
        policy_version: '1.0.0',
        created_at: '2024-01-15T10:00:00.000Z',
      },
      {
        id: 'consent-2',
        consent_type: 'marketing_email',
        status: 'granted',
        policy_version: '1.0.0',
        created_at: '2024-01-15T10:00:00.000Z',
      },
    ],
  });

  assertStatus(res, 200);
  const body = await assertJsonBody(res);
  const consents = body.consents as unknown[];
  assertEquals(consents.length, 1);
});

Deno.test('consent-management — GET with invalid type returns 400', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/consent-management?type=invalid_type',
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'Invalid consent type');
});

// ---------------------------------------------------------------------------
// Tests: POST consent recording
// ---------------------------------------------------------------------------

Deno.test('consent-management — POST records consent grant', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: {
      consent_type: 'privacy_policy',
      status: 'granted',
      policy_version: '1.0.0',
    },
  });
  const res = await handleConsent(req);

  assertStatus(res, 201);
  const body = await assertJsonBody(res);
  assertEquals(typeof body.consent, 'object');
  assertEquals((body.consent as Record<string, unknown>).consent_type, 'privacy_policy');
  assertEquals((body.consent as Record<string, unknown>).status, 'granted');
});

Deno.test('consent-management — POST records consent withdrawal', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: {
      consent_type: 'marketing_email',
      status: 'withdrawn',
      policy_version: '1.0.0',
    },
  });
  const res = await handleConsent(req);

  assertStatus(res, 201);
  const body = await assertJsonBody(res);
  assertEquals((body.consent as Record<string, unknown>).status, 'withdrawn');
  assertEquals(typeof body.message, 'string');
});

Deno.test('consent-management — POST rejects missing consent_type', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { status: 'granted', policy_version: '1.0.0' },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'consent_type is required');
});

Deno.test('consent-management — POST rejects invalid consent_type', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { consent_type: 'invalid', status: 'granted', policy_version: '1.0.0' },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'Invalid consent_type');
});

Deno.test('consent-management — POST rejects missing status', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { consent_type: 'privacy_policy', policy_version: '1.0.0' },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'status is required');
});

Deno.test('consent-management — POST rejects invalid status', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { consent_type: 'privacy_policy', status: 'maybe', policy_version: '1.0.0' },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'status must be');
});

Deno.test('consent-management — POST rejects missing policy_version', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { consent_type: 'privacy_policy', status: 'granted' },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'policy_version is required');
});

Deno.test('consent-management — POST rejects invalid policy_version format', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: { consent_type: 'privacy_policy', status: 'granted', policy_version: 'v1' },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'semver format');
});

Deno.test('consent-management — POST rejects invalid metadata', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: {
      consent_type: 'privacy_policy',
      status: 'granted',
      policy_version: '1.0.0',
      metadata: 'not-an-object',
    },
  });
  const res = await handleConsent(req);
  await assertErrorResponse(res, 400, 'metadata must be a JSON object');
});

Deno.test('consent-management — POST returns 500 on insert error', async () => {
  const req = createMockRequest({
    method: 'POST',
    body: {
      consent_type: 'privacy_policy',
      status: 'granted',
      policy_version: '1.0.0',
    },
  });
  const res = await handleConsent(req, { insertError: true });
  assertStatus(res, 500);
  await assertNoSensitiveDataLeakage(res);
});

// ---------------------------------------------------------------------------
// Tests: CORS headers present on all responses
// ---------------------------------------------------------------------------

Deno.test('consent-management — all responses include CORS headers', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/consent-management',
  });
  const res = await handleConsent(req);
  assertCorsHeaders(res);
});
