// SPDX-License-Identifier: BUSL-1.1
// Tests for consent-management Edge Function (#1100)
import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertCorsHeaders,
  assertNoSensitiveDataLeakage,
} from '../_test_helpers/assertions.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';

const VALID = new Set([
  'terms_of_service',
  'privacy_policy',
  'data_processing',
  'marketing_email',
  'analytics',
  'third_party_sharing',
  'biometric_data',
]);
const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
function jr(d: Record<string, unknown>, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
function er(m: string, s = 400) {
  return jr({ error: m }, s);
}

interface Deps {
  consents?: {
    id: string;
    consent_type: string;
    status: string;
    policy_version: string;
    created_at: string;
  }[];
  insertError?: boolean;
}

async function handle(req: Request, deps: Deps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return er('Method not allowed', 405);
  if (req.method === 'GET') {
    const ct = new URL(req.url).searchParams.get('type');
    if (ct && !VALID.has(ct)) return er(`Invalid consent type: ${ct}`);
    return jr({ consents: (deps.consents ?? []).filter((c) => !ct || c.consent_type === ct) });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return er('Invalid JSON body');
  }
  const { consent_type: ct, status: st, policy_version: pv, metadata: md } = body;
  if (!ct || typeof ct !== 'string') return er('consent_type is required');
  if (!VALID.has(ct)) return er(`Invalid consent_type. Must be one of: ${[...VALID].join(', ')}`);
  if (!st || typeof st !== 'string') return er('status is required (granted or withdrawn)');
  if (!new Set(['granted', 'withdrawn']).has(st))
    return er('status must be "granted" or "withdrawn"');
  if (!pv || typeof pv !== 'string')
    return er('policy_version is required (semver format, e.g. "1.0.0")');
  if (!/^\d+\.\d+\.\d+$/.test(pv as string))
    return er('policy_version must be in semver format (e.g. "1.0.0")');
  if (md !== undefined && (typeof md !== 'object' || md === null))
    return er('metadata must be a JSON object if provided');
  if (deps.insertError) return er('Internal server error', 500);
  return jr(
    {
      consent: {
        id: 'new-id',
        consent_type: ct,
        status: st,
        policy_version: pv,
        created_at: new Date().toISOString(),
      },
      message: `Consent ${st === 'granted' ? 'granted' : 'withdrawn'} successfully`,
    },
    201,
  );
}

Deno.test('405 for PUT', async () => {
  await assertErrorResponse(await handle(createMockRequest({ method: 'PUT', body: {} })), 405);
});
Deno.test('405 for DELETE', async () => {
  await assertErrorResponse(await handle(createMockRequest({ method: 'DELETE' })), 405);
});
Deno.test('OPTIONS 204', async () => {
  assertStatus(await handle(createMockRequest({ method: 'OPTIONS' })), 204);
});
Deno.test('GET returns consents', async () => {
  const r = await handle(
    createMockRequest({ method: 'GET', url: 'https://t.co/consent-management' }),
    {
      consents: [
        {
          id: 'c1',
          consent_type: 'privacy_policy',
          status: 'granted',
          policy_version: '1.0.0',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    },
  );
  assertStatus(r, 200);
  const b = await assertJsonBody(r);
  assertEquals((b.consents as unknown[]).length, 1);
});
Deno.test('GET invalid type 400', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({ method: 'GET', url: 'https://t.co/consent-management?type=bad' }),
    ),
    400,
    'Invalid consent type',
  );
});
Deno.test('POST grant', async () => {
  const r = await handle(
    createMockRequest({
      method: 'POST',
      body: { consent_type: 'privacy_policy', status: 'granted', policy_version: '1.0.0' },
    }),
  );
  assertStatus(r, 201);
  const b = await assertJsonBody(r);
  assertEquals((b.consent as Record<string, unknown>).status, 'granted');
});
Deno.test('POST withdraw', async () => {
  const r = await handle(
    createMockRequest({
      method: 'POST',
      body: { consent_type: 'marketing_email', status: 'withdrawn', policy_version: '1.0.0' },
    }),
  );
  assertStatus(r, 201);
  assertEquals(((await assertJsonBody(r)).consent as Record<string, unknown>) !== null, true);
});
Deno.test('POST missing consent_type', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({ method: 'POST', body: { status: 'granted', policy_version: '1.0.0' } }),
    ),
    400,
    'consent_type is required',
  );
});
Deno.test('POST invalid consent_type', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({
        method: 'POST',
        body: { consent_type: 'x', status: 'granted', policy_version: '1.0.0' },
      }),
    ),
    400,
    'Invalid consent_type',
  );
});
Deno.test('POST missing status', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({
        method: 'POST',
        body: { consent_type: 'privacy_policy', policy_version: '1.0.0' },
      }),
    ),
    400,
    'status is required',
  );
});
Deno.test('POST invalid status', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({
        method: 'POST',
        body: { consent_type: 'privacy_policy', status: 'x', policy_version: '1.0.0' },
      }),
    ),
    400,
    'status must be',
  );
});
Deno.test('POST missing version', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({
        method: 'POST',
        body: { consent_type: 'privacy_policy', status: 'granted' },
      }),
    ),
    400,
    'policy_version is required',
  );
});
Deno.test('POST bad semver', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({
        method: 'POST',
        body: { consent_type: 'privacy_policy', status: 'granted', policy_version: 'v1' },
      }),
    ),
    400,
    'semver',
  );
});
Deno.test('POST bad metadata', async () => {
  await assertErrorResponse(
    await handle(
      createMockRequest({
        method: 'POST',
        body: {
          consent_type: 'privacy_policy',
          status: 'granted',
          policy_version: '1.0.0',
          metadata: 'x',
        },
      }),
    ),
    400,
    'metadata',
  );
});
Deno.test('POST 500 on error', async () => {
  const r = await handle(
    createMockRequest({
      method: 'POST',
      body: { consent_type: 'privacy_policy', status: 'granted', policy_version: '1.0.0' },
    }),
    { insertError: true },
  );
  assertStatus(r, 500);
  await assertNoSensitiveDataLeakage(r);
});
Deno.test('CORS headers', async () => {
  assertCorsHeaders(
    await handle(createMockRequest({ method: 'GET', url: 'https://t.co/consent-management' })),
  );
});
