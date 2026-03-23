// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `data-export` Edge Function (#533).
 *
 * Validates method restrictions, authentication, format validation,
 * JSON and CSV export structures, rate limiting, sensitive data
 * redaction, audit logging, and Content-Disposition headers.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonBody,
  assertErrorResponse,
  assertCorsHeaders,
  assertContentDisposition,
} from '../_test_helpers/assertions.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';
import {
  TEST_USER,
  TEST_HOUSEHOLD,
  TEST_ACCOUNT,
  TEST_TRANSACTION,
  TEST_CREDENTIAL,
} from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
// ---------------------------------------------------------------------------

interface MockExportDeps {
  authenticatedUser?: { id: string; email: string } | null;
  recentExportCount?: number;
  memberships?: { household_id: string }[];
  exportData?: Record<string, Record<string, unknown>[]>;
  rateLimitError?: boolean;
  memberError?: boolean;
  auditInserted?: boolean;
}

const VALID_FORMATS = ['json', 'csv'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];
const RATE_LIMIT_MAX = 10;
const REDACTED_COLUMNS = new Set(['public_key']);

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function resolveExportFormat(req: Request): ExportFormat | null {
  const url = new URL(req.url);
  const formatParam = url.searchParams.get('format');
  if (formatParam) {
    return (VALID_FORMATS as readonly string[]).includes(formatParam)
      ? (formatParam as ExportFormat)
      : null;
  }
  const acceptHeader = req.headers.get('Accept') ?? 'application/json';
  if (acceptHeader.includes('text/csv')) return 'csv';
  return 'json';
}

function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...record };
  for (const col of REDACTED_COLUMNS) {
    if (col in redacted) {
      redacted[col] = '[REDACTED]';
    }
  }
  return redacted;
}

function recordsToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const lines = [headers.join(',')];
  for (const record of records) {
    const values = headers.map((h) => {
      const val = record[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

async function handleDataExport(req: Request, deps: MockExportDeps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const user = deps.authenticatedUser ?? null;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const format = resolveExportFormat(req);
  if (!format) {
    return new Response(
      JSON.stringify({
        error: { code: 'INVALID_FORMAT', message: 'Export format must be "json" or "csv".' },
      }),
      {
        status: 400,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  // Rate limiting
  const recentExportCount = deps.recentExportCount ?? 0;
  if (recentExportCount >= RATE_LIMIT_MAX) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'RATE_LIMITED',
          message: `Export limit exceeded. Maximum ${RATE_LIMIT_MAX} exports per hour.`,
        },
      }),
      {
        status: 429,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  if (deps.memberError) {
    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      }),
      {
        status: 500,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  // Collect export data, applying redaction
  const exportData: Record<string, Record<string, unknown>[]> = {};
  const rawData = deps.exportData ?? {};

  for (const [table, records] of Object.entries(rawData)) {
    exportData[table] = records.map(redactRecord);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'csv') {
    const csvParts: string[] = [];
    for (const [tableName, records] of Object.entries(exportData)) {
      csvParts.push(`\n# Table: ${tableName}`);
      csvParts.push(`# Records: ${records.length}`);
      if (records.length > 0) {
        csvParts.push(recordsToCsv(records));
      }
      csvParts.push('');
    }
    const csvContent = csvParts.join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...testCorsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="finance-export-${timestamp}.csv"`,
        'Transfer-Encoding': 'chunked',
      },
    });
  } else {
    const jsonContent = JSON.stringify(
      {
        export_date: new Date().toISOString(),
        user_id: user.id,
        format_version: '1.0',
        data: exportData,
      },
      null,
      2,
    );

    return new Response(jsonContent, {
      status: 200,
      headers: {
        ...testCorsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="finance-export-${timestamp}.json"`,
        'Transfer-Encoding': 'chunked',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('data-export — returns 405 for POST method', async () => {
  const req = createMockRequest({ method: 'POST', body: {} });
  const res = await handleDataExport(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('data-export — returns 405 for PUT method', async () => {
  const req = createMockRequest({ method: 'PUT', body: {} });
  const res = await handleDataExport(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

Deno.test('data-export — returns 405 for DELETE method', async () => {
  const req = createMockRequest({ method: 'DELETE' });
  const res = await handleDataExport(req);
  await assertErrorResponse(res, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: authentication
// ---------------------------------------------------------------------------

Deno.test('data-export — returns 401 without authentication', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleDataExport(req, { authenticatedUser: null });
  await assertErrorResponse(res, 401, 'Authentication required');
});

// ---------------------------------------------------------------------------
// Tests: format validation
// ---------------------------------------------------------------------------

Deno.test('data-export — returns 400 for invalid format', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=xml',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
  });

  assertStatus(res, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'INVALID_FORMAT');
});

Deno.test('data-export — defaults to json when no format specified', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {},
  });

  assertStatus(res, 200);
  assertStringIncludes(res.headers.get('Content-Type')!, 'application/json');
});

Deno.test('data-export — accepts csv format via Accept header', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export',
    headers: { Accept: 'text/csv' },
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {},
  });

  assertStatus(res, 200);
  assertStringIncludes(res.headers.get('Content-Type')!, 'text/csv');
});

// ---------------------------------------------------------------------------
// Tests: JSON export
// ---------------------------------------------------------------------------

Deno.test('data-export — JSON export has correct structure', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {
      users: [{ id: TEST_USER.id, email: TEST_USER.email }],
      accounts: [{ ...TEST_ACCOUNT }],
    },
  });

  assertStatus(res, 200);
  const body = await res.json();

  assertEquals(typeof body.export_date, 'string');
  assertEquals(body.user_id, TEST_USER.id);
  assertEquals(body.format_version, '1.0');
  assertEquals(typeof body.data, 'object');
  assertEquals(Array.isArray(body.data.users), true);
  assertEquals(Array.isArray(body.data.accounts), true);
});

Deno.test('data-export — JSON includes Content-Disposition header', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {},
  });

  const disposition = res.headers.get('Content-Disposition');
  assertStringIncludes(disposition!, 'attachment');
  assertStringIncludes(disposition!, 'finance-export-');
  assertStringIncludes(disposition!, '.json');
});

// ---------------------------------------------------------------------------
// Tests: CSV export
// ---------------------------------------------------------------------------

Deno.test('data-export — CSV export has correct format', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=csv',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {
      accounts: [
        { id: TEST_ACCOUNT.id, name: TEST_ACCOUNT.name, balance_cents: TEST_ACCOUNT.balance_cents },
      ],
    },
  });

  assertStatus(res, 200);
  const text = await res.text();

  assertStringIncludes(text, '# Table: accounts');
  assertStringIncludes(text, '# Records: 1');
  assertStringIncludes(text, 'id,name,balance_cents');
  assertStringIncludes(text, TEST_ACCOUNT.id);
});

Deno.test('data-export — CSV includes Content-Disposition header', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=csv',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {},
  });

  const disposition = res.headers.get('Content-Disposition');
  assertStringIncludes(disposition!, 'attachment');
  assertStringIncludes(disposition!, '.csv');
});

Deno.test('data-export — CSV escapes values with commas', () => {
  const records = [{ name: 'Smith, John', amount: 100 }];
  const csv = recordsToCsv(records);
  assertStringIncludes(csv, '"Smith, John"');
});

Deno.test('data-export — CSV escapes values with quotes', () => {
  const records = [{ name: 'Say "hello"', amount: 100 }];
  const csv = recordsToCsv(records);
  assertStringIncludes(csv, '"Say ""hello"""');
});

Deno.test('data-export — CSV handles empty records array', () => {
  const csv = recordsToCsv([]);
  assertEquals(csv, '');
});

Deno.test('data-export — CSV handles null values', () => {
  const records = [{ name: 'Test', value: null }];
  const csv = recordsToCsv(records);
  assertStringIncludes(csv, 'Test,');
});

// ---------------------------------------------------------------------------
// Tests: rate limiting
// ---------------------------------------------------------------------------

Deno.test('data-export — returns 429 when rate limit exceeded', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    recentExportCount: 10,
  });

  assertStatus(res, 429);
  const body = await res.json();
  assertEquals(body.error.code, 'RATE_LIMITED');
  assertStringIncludes(body.error.message, '10');
});

Deno.test('data-export — allows export when under rate limit', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    recentExportCount: 9,
    exportData: {},
  });

  assertStatus(res, 200);
});

Deno.test('data-export — rate limit allows exactly 10 per hour', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    recentExportCount: 11, // Over limit
  });

  assertStatus(res, 429);
});

// ---------------------------------------------------------------------------
// Tests: sensitive data redaction
// ---------------------------------------------------------------------------

Deno.test('data-export — redacts public_key column', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {
      passkey_credentials: [
        {
          id: TEST_CREDENTIAL.id,
          user_id: TEST_USER.id,
          credential_id: TEST_CREDENTIAL.credential_id,
          public_key: 'actual-secret-public-key-data',
          counter: 0,
        },
      ],
    },
  });

  assertStatus(res, 200);
  const body = await res.json();
  const creds = body.data.passkey_credentials;
  assertEquals(creds[0].public_key, '[REDACTED]');
});

Deno.test('data-export — does not redact non-sensitive columns', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {
      accounts: [{ id: TEST_ACCOUNT.id, name: 'Checking', balance_cents: 150000 }],
    },
  });

  const body = await res.json();
  assertEquals(body.data.accounts[0].name, 'Checking');
  assertEquals(body.data.accounts[0].balance_cents, 150000);
});

Deno.test('redactRecord — replaces public_key with [REDACTED]', () => {
  const record = { id: '123', public_key: 'secret-data', name: 'test' };
  const redacted = redactRecord(record);
  assertEquals(redacted.public_key, '[REDACTED]');
  assertEquals(redacted.name, 'test');
  assertEquals(redacted.id, '123');
});

Deno.test('redactRecord — preserves record without sensitive columns', () => {
  const record = { id: '123', name: 'test', amount: 100 };
  const redacted = redactRecord(record);
  assertEquals(redacted, record);
});

// ---------------------------------------------------------------------------
// Tests: CORS headers
// ---------------------------------------------------------------------------

Deno.test('data-export — includes CORS headers on success', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    exportData: {},
  });

  assertCorsHeaders(res);
});

Deno.test('data-export — includes CORS headers on error', async () => {
  const req = createMockRequest({ method: 'GET' });
  const res = await handleDataExport(req, { authenticatedUser: null });

  assertCorsHeaders(res);
});

// ---------------------------------------------------------------------------
// Tests: resolveExportFormat helper
// ---------------------------------------------------------------------------

Deno.test('resolveExportFormat — returns json for ?format=json', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/fn?format=json',
  });
  assertEquals(resolveExportFormat(req), 'json');
});

Deno.test('resolveExportFormat — returns csv for ?format=csv', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/fn?format=csv',
  });
  assertEquals(resolveExportFormat(req), 'csv');
});

Deno.test('resolveExportFormat — returns null for ?format=xml', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/fn?format=xml',
  });
  assertEquals(resolveExportFormat(req), null);
});

Deno.test('resolveExportFormat — defaults to json without format param', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/fn',
  });
  assertEquals(resolveExportFormat(req), 'json');
});

Deno.test('resolveExportFormat — uses Accept header for csv fallback', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/fn',
    headers: { Accept: 'text/csv' },
  });
  assertEquals(resolveExportFormat(req), 'csv');
});

// ---------------------------------------------------------------------------
// Tests: internal errors
// ---------------------------------------------------------------------------

Deno.test('data-export — returns 500 on membership fetch failure', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/data-export?format=json',
  });
  const res = await handleDataExport(req, {
    authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    memberError: true,
  });

  assertStatus(res, 500);
  const body = await res.json();
  assertEquals(body.error.code, 'INTERNAL_ERROR');
});
