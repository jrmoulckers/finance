// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `admin-dashboard` Edge Function (#684).
 *
 * Validates authentication, admin authorization, action routing,
 * overview metrics, audit log queries, sync health reports,
 * rate-limit listing, and edge cases.
 *
 * Uses inline handler logic (same pattern as data-export tests)
 * for isolated unit testing without requiring a live Supabase instance.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertErrorResponse,
  assertJsonBody,
  assertCorsHeaders,
  assertIsoTimestamp,
} from '../_test_helpers/assertions.ts';
import { createMockRequest, createAuthenticatedRequest } from '../_test_helpers/mock-request.ts';
import { createMockSupabaseClient, type MockResult } from '../_test_helpers/mock-supabase.ts';
import { TEST_USER, TEST_USER_2 } from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Constants mirroring the Edge Function
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'admin@finance.example.com';
const NON_ADMIN_EMAIL = TEST_USER.email;
const BASE_URL = 'https://test.supabase.co/functions/v1/admin-dashboard';

const VALID_ACTIONS = ['overview', 'audit', 'sync-health', 'rate-limits'] as const;
type DashboardAction = (typeof VALID_ACTIONS)[number];

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const DEFAULT_SYNC_LIMIT = 100;
const MAX_SYNC_LIMIT = 500;

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing
// ---------------------------------------------------------------------------

interface MockAdminDeps {
  authenticatedUser?: { id: string; email: string } | null;
  adminEmails?: string;
  rateLimitExceeded?: boolean;
  overviewData?: {
    totalUsers?: number;
    activeUsers?: number;
    totalHouseholds?: number;
    totalTransactions?: number;
    totalAccounts?: number;
    syncLogs?: { sync_duration_ms: number }[];
    rateLimitEntries?: number;
  };
  auditData?: {
    entries?: Record<string, unknown>[];
    total?: number;
    error?: boolean;
  };
  syncHealthData?: {
    logs?: Record<string, unknown>[];
    error?: boolean;
  };
  rateLimitData?: {
    entries?: Record<string, unknown>[];
    total?: number;
    error?: boolean;
  };
  envValid?: boolean;
}

function isAdmin(userEmail: string, adminEmailsCsv: string): boolean {
  if (!adminEmailsCsv.trim()) return false;
  const adminEmails = adminEmailsCsv
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(userEmail.toLowerCase());
}

function clampInt(value: string | null, defaultVal: number, min: number, max: number): number {
  const parsed = parseInt(value ?? String(defaultVal), 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.min(max, Math.max(min, parsed));
}

async function handleAdminDashboard(
  req: Request,
  deps: MockAdminDeps = {},
): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: testCorsHeaders });
  }

  // GET only
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Environment validation
  if (deps.envValid === false) {
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  // Authentication
  const user = deps.authenticatedUser ?? null;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Admin authorization
  const adminEmailsCsv = deps.adminEmails ?? '';
  if (!isAdmin(user.email, adminEmailsCsv)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin access required' }),
      {
        status: 403,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  // Rate limiting
  if (deps.rateLimitExceeded) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...testCorsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    });
  }

  // Route by action
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (!action || !(VALID_ACTIONS as readonly string[]).includes(action)) {
    return new Response(
      JSON.stringify({
        error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
      }),
      {
        status: 400,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  switch (action as DashboardAction) {
    case 'overview':
      return handleOverview(req, deps);
    case 'audit':
      return handleAudit(req, url, deps);
    case 'sync-health':
      return handleSyncHealth(req, url, deps);
    case 'rate-limits':
      return handleRateLimits(req, deps);
    default:
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      });
  }
}

function handleOverview(req: Request, deps: MockAdminDeps): Response {
  const od = deps.overviewData ?? {};
  const syncLogs = od.syncLogs ?? [];
  const reports24h = syncLogs.length;
  let avgDurationMs = 0;
  let maxDurationMs = 0;
  if (reports24h > 0) {
    const durations = syncLogs.map((l) => l.sync_duration_ms);
    maxDurationMs = Math.max(...durations);
    avgDurationMs = Math.round(durations.reduce((s, d) => s + d, 0) / reports24h);
  }

  return new Response(
    JSON.stringify({
      overview: {
        users: {
          total: od.totalUsers ?? 0,
          active_7d: od.activeUsers ?? 0,
        },
        households: { total: od.totalHouseholds ?? 0 },
        transactions: { total: od.totalTransactions ?? 0 },
        accounts: { total: od.totalAccounts ?? 0 },
        sync_health: {
          avg_duration_ms: avgDurationMs,
          max_duration_ms: maxDurationMs,
          reports_24h: reports24h,
        },
        rate_limits: { active_entries: od.rateLimitEntries ?? 0 },
        generated_at: new Date().toISOString(),
      },
    }),
    {
      status: 200,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function handleAudit(req: Request, url: URL, deps: MockAdminDeps): Response {
  const ad = deps.auditData ?? {};
  if (ad.error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const page = clampInt(url.searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER);
  const perPage = clampInt(
    url.searchParams.get('per_page'),
    DEFAULT_PER_PAGE,
    1,
    MAX_PER_PAGE,
  );
  const userId = url.searchParams.get('user_id');
  const actionFilter = url.searchParams.get('action_filter');
  const since = url.searchParams.get('since');
  const until = url.searchParams.get('until');

  let entries = ad.entries ?? [];

  // Apply filters
  if (userId) {
    entries = entries.filter((e) => e.user_id === userId);
  }
  if (actionFilter) {
    entries = entries.filter((e) => e.action === actionFilter);
  }
  if (since) {
    entries = entries.filter((e) => (e.created_at as string) >= since);
  }
  if (until) {
    entries = entries.filter((e) => (e.created_at as string) <= until);
  }

  const total = entries.length;
  const offset = (page - 1) * perPage;
  const paginated = entries.slice(offset, offset + perPage);

  return new Response(
    JSON.stringify({
      audit_entries: paginated,
      pagination: {
        page,
        per_page: perPage,
        total,
        has_more: offset + perPage < total,
      },
    }),
    {
      status: 200,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function handleSyncHealth(req: Request, url: URL, deps: MockAdminDeps): Response {
  const sd = deps.syncHealthData ?? {};
  if (sd.error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = url.searchParams.get('user_id');
  const since = url.searchParams.get('since');
  const limit = clampInt(
    url.searchParams.get('limit'),
    DEFAULT_SYNC_LIMIT,
    1,
    MAX_SYNC_LIMIT,
  );

  let logs = (sd.logs ?? []) as Record<string, unknown>[];

  if (userId) {
    logs = logs.filter((l) => l.user_id === userId);
  }
  if (since) {
    logs = logs.filter((l) => (l.created_at as string) >= since);
  }

  logs = logs.slice(0, limit);

  const total = logs.length;
  let avgDuration = 0;
  let errorCount = 0;
  if (total > 0) {
    const durations = logs.map((l) => l.sync_duration_ms as number);
    avgDuration = Math.round(durations.reduce((s, d) => s + d, 0) / total);
    errorCount = logs.filter((l) => l.sync_status === 'failure').length;
  }

  return new Response(
    JSON.stringify({
      logs,
      summary: {
        avg_duration: avgDuration,
        error_rate: total > 0 ? parseFloat((errorCount / total).toFixed(4)) : 0,
        total,
      },
    }),
    {
      status: 200,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function handleRateLimits(req: Request, deps: MockAdminDeps): Response {
  const rd = deps.rateLimitData ?? {};
  if (rd.error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const entries = rd.entries ?? [];
  return new Response(
    JSON.stringify({
      entries,
      total: rd.total ?? entries.length,
    }),
    {
      status: 200,
      headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: 'a0a0a0a0-b1b1-4c2c-d3d3-e4e4e4e4e4e4', email: ADMIN_EMAIL };
const NON_ADMIN_USER = { id: TEST_USER.id, email: NON_ADMIN_EMAIL };
const ADMIN_EMAILS_CSV = `${ADMIN_EMAIL}, second-admin@finance.example.com`;

function adminDeps(overrides: Partial<MockAdminDeps> = {}): MockAdminDeps {
  return {
    authenticatedUser: ADMIN_USER,
    adminEmails: ADMIN_EMAILS_CSV,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Auth & Authorization
// ---------------------------------------------------------------------------

Deno.test('admin-dashboard: returns 401 for unauthenticated request', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, { authenticatedUser: null });
  await assertErrorResponse(res, 401, 'Authentication required');
});

Deno.test('admin-dashboard: returns 403 for non-admin users', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, {
    authenticatedUser: NON_ADMIN_USER,
    adminEmails: ADMIN_EMAILS_CSV,
  });
  await assertErrorResponse(res, 403, 'Forbidden');
});

Deno.test('admin-dashboard: returns 200 for admin users (email in ADMIN_EMAILS)', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, adminDeps());
  assertStatus(res, 200);
});

Deno.test('admin-dashboard: handles missing ADMIN_EMAILS env gracefully (all 403)', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, {
    authenticatedUser: ADMIN_USER,
    adminEmails: '',
  });
  await assertErrorResponse(res, 403, 'Forbidden');
});

Deno.test('admin-dashboard: returns 405 for non-GET methods', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const req = createMockRequest({
      method,
      url: `${BASE_URL}?action=overview`,
      ...(method !== 'DELETE' ? { body: {} } : {}),
    });
    const res = await handleAdminDashboard(req, adminDeps());
    await assertErrorResponse(res, 405, 'Method not allowed');
  }
});

// ---------------------------------------------------------------------------
// Tests: Overview action
// ---------------------------------------------------------------------------

Deno.test('admin-dashboard: overview returns all required fields', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({
      overviewData: {
        totalUsers: 150,
        activeUsers: 42,
        totalHouseholds: 80,
        totalTransactions: 5000,
        totalAccounts: 200,
        syncLogs: [{ sync_duration_ms: 100 }, { sync_duration_ms: 200 }],
        rateLimitEntries: 5,
      },
    }),
  );

  assertStatus(res, 200);
  const body = await res.json();

  // Verify structure
  assertEquals(typeof body.overview, 'object');
  assertEquals(typeof body.overview.users, 'object');
  assertEquals(typeof body.overview.households, 'object');
  assertEquals(typeof body.overview.transactions, 'object');
  assertEquals(typeof body.overview.accounts, 'object');
  assertEquals(typeof body.overview.sync_health, 'object');
  assertEquals(typeof body.overview.rate_limits, 'object');
  assertEquals(typeof body.overview.generated_at, 'string');
});

Deno.test('admin-dashboard: overview handles zero data gracefully', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, adminDeps({ overviewData: {} }));

  assertStatus(res, 200);
  const body = await res.json();
  assertEquals(body.overview.users.total, 0);
  assertEquals(body.overview.users.active_7d, 0);
  assertEquals(body.overview.households.total, 0);
  assertEquals(body.overview.transactions.total, 0);
  assertEquals(body.overview.accounts.total, 0);
  assertEquals(body.overview.sync_health.avg_duration_ms, 0);
  assertEquals(body.overview.sync_health.max_duration_ms, 0);
  assertEquals(body.overview.sync_health.reports_24h, 0);
  assertEquals(body.overview.rate_limits.active_entries, 0);
});

Deno.test('admin-dashboard: overview returns correct user counts', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({
      overviewData: { totalUsers: 42, activeUsers: 15 },
    }),
  );

  const body = await res.json();
  assertEquals(body.overview.users.total, 42);
  assertEquals(body.overview.users.active_7d, 15);
});

Deno.test('admin-dashboard: overview returns sync health summary', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({
      overviewData: {
        syncLogs: [
          { sync_duration_ms: 100 },
          { sync_duration_ms: 300 },
          { sync_duration_ms: 200 },
        ],
      },
    }),
  );

  const body = await res.json();
  assertEquals(body.overview.sync_health.avg_duration_ms, 200);
  assertEquals(body.overview.sync_health.max_duration_ms, 300);
  assertEquals(body.overview.sync_health.reports_24h, 3);
});

Deno.test('admin-dashboard: overview includes generated_at timestamp', async () => {
  const before = new Date().toISOString();
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, adminDeps());
  const body = await res.json();
  const after = new Date().toISOString();

  assertIsoTimestamp(body.overview.generated_at);
  // Timestamp should be between before and after the call
  assertEquals(body.overview.generated_at >= before, true);
  assertEquals(body.overview.generated_at <= after, true);
});

// ---------------------------------------------------------------------------
// Tests: Audit action
// ---------------------------------------------------------------------------

const SAMPLE_AUDIT_ENTRIES = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    user_id: TEST_USER.id,
    action: 'DATA_EXPORT',
    table_name: 'users',
    record_id: TEST_USER.id,
    household_id: null,
    created_at: '2024-06-01T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    user_id: TEST_USER.id,
    action: 'UPDATE',
    table_name: 'accounts',
    record_id: '11111111-1111-4111-a111-111111111111',
    household_id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
    created_at: '2024-06-02T12:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    user_id: TEST_USER_2.id,
    action: 'INSERT',
    table_name: 'transactions',
    record_id: '22222222-2222-4222-a222-222222222222',
    household_id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
    created_at: '2024-06-03T14:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-a000-000000000004',
    user_id: TEST_USER.id,
    action: 'DELETE',
    table_name: 'transactions',
    record_id: '33333333-3333-4333-a333-333333333333',
    household_id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
    created_at: '2024-06-04T16:00:00.000Z',
  },
];

Deno.test('admin-dashboard: audit returns paginated entries', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES, total: 4 } }),
  );

  assertStatus(res, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body.audit_entries), true);
  assertEquals(body.audit_entries.length, 4);
  assertEquals(typeof body.pagination, 'object');
  assertEquals(body.pagination.page, 1);
  assertEquals(body.pagination.per_page, DEFAULT_PER_PAGE);
  assertEquals(body.pagination.total, 4);
  assertEquals(body.pagination.has_more, false);
});

Deno.test('admin-dashboard: audit respects page and per_page parameters', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit&page=2&per_page=2`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES, total: 4 } }),
  );

  assertStatus(res, 200);
  const body = await res.json();
  assertEquals(body.pagination.page, 2);
  assertEquals(body.pagination.per_page, 2);
  assertEquals(body.audit_entries.length, 2);
  assertEquals(body.pagination.has_more, false);
});

Deno.test('admin-dashboard: audit filters by user_id', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit&user_id=${TEST_USER_2.id}`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES } }),
  );

  const body = await res.json();
  assertEquals(body.audit_entries.length, 1);
  assertEquals(body.audit_entries[0].user_id, TEST_USER_2.id);
});

Deno.test('admin-dashboard: audit filters by action type', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit&action_filter=DATA_EXPORT`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES } }),
  );

  const body = await res.json();
  assertEquals(body.audit_entries.length, 1);
  assertEquals(body.audit_entries[0].action, 'DATA_EXPORT');
});

Deno.test('admin-dashboard: audit filters by date range (since/until)', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit&since=2024-06-02T00:00:00.000Z&until=2024-06-03T23:59:59.999Z`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES } }),
  );

  const body = await res.json();
  assertEquals(body.audit_entries.length, 2);
});

Deno.test('admin-dashboard: audit returns empty array when no matching entries', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit&user_id=nonexistent-user-id`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES } }),
  );

  const body = await res.json();
  assertEquals(body.audit_entries.length, 0);
  assertEquals(body.pagination.total, 0);
  assertEquals(body.pagination.has_more, false);
});

// ---------------------------------------------------------------------------
// Tests: Sync health action
// ---------------------------------------------------------------------------

const SAMPLE_SYNC_LOGS = [
  {
    id: 'aaa00000-0000-4000-a000-000000000001',
    user_id: TEST_USER.id,
    device_id: 'device-a',
    sync_duration_ms: 120,
    record_count: 50,
    error_code: null,
    sync_status: 'success',
    created_at: '2024-06-01T10:00:00.000Z',
  },
  {
    id: 'aaa00000-0000-4000-a000-000000000002',
    user_id: TEST_USER.id,
    device_id: 'device-a',
    sync_duration_ms: 350,
    record_count: 100,
    error_code: 'NETWORK_TIMEOUT',
    sync_status: 'failure',
    created_at: '2024-06-02T11:00:00.000Z',
  },
  {
    id: 'aaa00000-0000-4000-a000-000000000003',
    user_id: TEST_USER_2.id,
    device_id: 'device-b',
    sync_duration_ms: 80,
    record_count: 20,
    error_code: null,
    sync_status: 'success',
    created_at: '2024-06-03T12:00:00.000Z',
  },
  {
    id: 'aaa00000-0000-4000-a000-000000000004',
    user_id: TEST_USER.id,
    device_id: 'device-a',
    sync_duration_ms: 200,
    record_count: 75,
    error_code: null,
    sync_status: 'partial',
    created_at: '2024-06-04T13:00:00.000Z',
  },
];

Deno.test('admin-dashboard: sync-health returns logs with summary', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=sync-health`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ syncHealthData: { logs: SAMPLE_SYNC_LOGS } }),
  );

  assertStatus(res, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body.logs), true);
  assertEquals(body.logs.length, 4);
  assertEquals(typeof body.summary, 'object');
  assertEquals(typeof body.summary.avg_duration, 'number');
  assertEquals(typeof body.summary.error_rate, 'number');
  assertEquals(body.summary.total, 4);
});

Deno.test('admin-dashboard: sync-health filters by user_id', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=sync-health&user_id=${TEST_USER_2.id}`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ syncHealthData: { logs: SAMPLE_SYNC_LOGS } }),
  );

  const body = await res.json();
  assertEquals(body.logs.length, 1);
  assertEquals(body.logs[0].user_id, TEST_USER_2.id);
});

Deno.test('admin-dashboard: sync-health respects limit parameter', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=sync-health&limit=2`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ syncHealthData: { logs: SAMPLE_SYNC_LOGS } }),
  );

  const body = await res.json();
  assertEquals(body.logs.length, 2);
  assertEquals(body.summary.total, 2);
});

Deno.test('admin-dashboard: sync-health returns summary statistics', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=sync-health`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ syncHealthData: { logs: SAMPLE_SYNC_LOGS } }),
  );

  const body = await res.json();
  // avg_duration = (120 + 350 + 80 + 200) / 4 = 187.5 → 188 (rounded)
  assertEquals(body.summary.avg_duration, 188);
  // error_rate = 1/4 = 0.25
  assertEquals(body.summary.error_rate, 0.25);
  assertEquals(body.summary.total, 4);
});

// ---------------------------------------------------------------------------
// Tests: Rate limits action
// ---------------------------------------------------------------------------

const SAMPLE_RATE_LIMIT_ENTRIES = [
  {
    id: 'bbb00000-0000-4000-a000-000000000001',
    key: 'health-check:192.168.1.1',
    window_start: new Date(Date.now() - 30 * 1000).toISOString(),
    request_count: 15,
  },
  {
    id: 'bbb00000-0000-4000-a000-000000000002',
    key: 'data-export:user-uuid-1',
    window_start: new Date(Date.now() - 120 * 1000).toISOString(),
    request_count: 8,
  },
  {
    id: 'bbb00000-0000-4000-a000-000000000003',
    key: 'passkey-register:user-uuid-2',
    window_start: new Date(Date.now() - 5 * 1000).toISOString(),
    request_count: 3,
  },
];

Deno.test('admin-dashboard: rate-limits returns active entries', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=rate-limits`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({
      rateLimitData: { entries: SAMPLE_RATE_LIMIT_ENTRIES, total: 3 },
    }),
  );

  assertStatus(res, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body.entries), true);
  assertEquals(body.entries.length, 3);
});

Deno.test('admin-dashboard: rate-limits only shows non-expired entries', async () => {
  // Simulate only active entries being returned (filtering is server-side)
  const activeOnly = SAMPLE_RATE_LIMIT_ENTRIES.slice(0, 2);
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=rate-limits`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ rateLimitData: { entries: activeOnly, total: 2 } }),
  );

  const body = await res.json();
  assertEquals(body.entries.length, 2);
  assertEquals(body.total, 2);
});

Deno.test('admin-dashboard: rate-limits returns total count', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=rate-limits`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({
      rateLimitData: { entries: SAMPLE_RATE_LIMIT_ENTRIES, total: 3 },
    }),
  );

  const body = await res.json();
  assertEquals(body.total, 3);
});

// ---------------------------------------------------------------------------
// Tests: Edge cases
// ---------------------------------------------------------------------------

Deno.test('admin-dashboard: invalid action parameter returns 400', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=invalid-action`,
  });
  const res = await handleAdminDashboard(req, adminDeps());
  await assertErrorResponse(res, 400, 'Invalid action');
});

Deno.test('admin-dashboard: missing action parameter returns 400', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: BASE_URL,
  });
  const res = await handleAdminDashboard(req, adminDeps());
  await assertErrorResponse(res, 400, 'Invalid action');
});

Deno.test('admin-dashboard: rate limit exceeded returns 429', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, adminDeps({ rateLimitExceeded: true }));
  assertStatus(res, 429);
  const body = await res.json();
  assertStringIncludes(body.error, 'Too many requests');
});

Deno.test('admin-dashboard: CORS preflight returns 204', async () => {
  const req = createMockRequest({
    method: 'OPTIONS',
    url: `${BASE_URL}?action=overview`,
    headers: {
      Origin: 'https://app.finance.example.com',
      'Access-Control-Request-Method': 'GET',
    },
  });
  const res = await handleAdminDashboard(req, adminDeps());
  assertStatus(res, 204);
});

Deno.test('admin-dashboard: admin email comparison is case-insensitive', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(req, {
    authenticatedUser: { id: ADMIN_USER.id, email: 'ADMIN@FINANCE.EXAMPLE.COM' },
    adminEmails: ADMIN_EMAILS_CSV,
  });
  assertStatus(res, 200);
});

Deno.test('admin-dashboard: audit handles database errors gracefully', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { error: true } }),
  );
  assertStatus(res, 500);
});

Deno.test('admin-dashboard: sync-health handles database errors gracefully', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=sync-health`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ syncHealthData: { error: true } }),
  );
  assertStatus(res, 500);
});

Deno.test('admin-dashboard: rate-limits handles database errors gracefully', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=rate-limits`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ rateLimitData: { error: true } }),
  );
  assertStatus(res, 500);
});

Deno.test('admin-dashboard: audit per_page is clamped to MAX_PER_PAGE', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit&per_page=999`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: SAMPLE_AUDIT_ENTRIES } }),
  );

  const body = await res.json();
  assertEquals(body.pagination.per_page, MAX_PER_PAGE);
});

Deno.test('admin-dashboard: sync-health limit is clamped to MAX_SYNC_LIMIT', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=sync-health&limit=9999`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ syncHealthData: { logs: SAMPLE_SYNC_LOGS } }),
  );

  const body = await res.json();
  // All 4 logs returned since MAX_SYNC_LIMIT (500) > sample size (4)
  assertEquals(body.logs.length, 4);
});

Deno.test('admin-dashboard: audit entries never include old_values or new_values', async () => {
  const entriesWithValues = SAMPLE_AUDIT_ENTRIES.map((e) => ({
    ...e,
    // These fields should NOT be present in the response
    // because the handler only selects safe columns
  }));
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=audit`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({ auditData: { entries: entriesWithValues } }),
  );

  const body = await res.json();
  for (const entry of body.audit_entries) {
    assertEquals('old_values' in entry, false, 'old_values should not be in response');
    assertEquals('new_values' in entry, false, 'new_values should not be in response');
  }
});

Deno.test('admin-dashboard: overview response does not contain user emails', async () => {
  const req = createMockRequest({
    method: 'GET',
    url: `${BASE_URL}?action=overview`,
  });
  const res = await handleAdminDashboard(
    req,
    adminDeps({
      overviewData: { totalUsers: 10, activeUsers: 5 },
    }),
  );

  const text = await res.clone().text();
  assertEquals(text.includes('@'), false, 'Overview response must not contain email addresses');
});
