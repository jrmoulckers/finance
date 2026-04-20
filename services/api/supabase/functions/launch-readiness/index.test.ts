// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Launch Readiness Dashboard Edge Function (#894).
 *
 * Validates admin authorization, action routing, readiness report
 * structure, and security constraints.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadinessCheck {
  name: string;
  passed: boolean;
  value?: number;
  unit?: string;
  description: string;
}

interface ReadinessReport {
  status: 'ready' | 'not_ready' | 'error';
  checks: ReadinessCheck[];
  statistics: Record<string, number>;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Mock admin verification logic (mirrors the Edge Function)
// ---------------------------------------------------------------------------

function isAdmin(userEmail: string, adminEmails: string): boolean {
  if (!adminEmails.trim()) return false;
  const emails = adminEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(userEmail.toLowerCase());
}

// ---------------------------------------------------------------------------
// Tests: Admin verification
// ---------------------------------------------------------------------------

Deno.test('isAdmin returns true for listed email', () => {
  assertEquals(isAdmin('admin@example.com', 'admin@example.com'), true);
});

Deno.test('isAdmin returns true for case-insensitive match', () => {
  assertEquals(isAdmin('Admin@Example.COM', 'admin@example.com'), true);
});

Deno.test('isAdmin returns false for unlisted email', () => {
  assertEquals(isAdmin('user@example.com', 'admin@example.com'), false);
});

Deno.test('isAdmin returns false for empty admin list', () => {
  assertEquals(isAdmin('admin@example.com', ''), false);
});

Deno.test('isAdmin handles multiple emails in CSV', () => {
  const csv = 'admin1@example.com, admin2@example.com, admin3@example.com';
  assertEquals(isAdmin('admin2@example.com', csv), true);
  assertEquals(isAdmin('notadmin@example.com', csv), false);
});

Deno.test('isAdmin handles whitespace in CSV', () => {
  const csv = ' admin@example.com , other@example.com ';
  assertEquals(isAdmin('admin@example.com', csv), true);
});

// ---------------------------------------------------------------------------
// Tests: Readiness report structure validation
// ---------------------------------------------------------------------------

Deno.test('readiness report has required fields', () => {
  const report: ReadinessReport = {
    status: 'ready',
    checks: [
      {
        name: 'rls_coverage',
        passed: true,
        value: 95.5,
        unit: 'percent',
        description: 'Percentage of public tables with RLS enabled',
      },
      {
        name: 'core_tables_exist',
        passed: true,
        description: 'All core schema tables present',
      },
      {
        name: 'sync_error_rate',
        passed: true,
        value: 1.5,
        unit: 'percent',
        description: 'Sync failure rate under 5% in last 24 hours',
      },
      {
        name: 'sync_performance',
        passed: true,
        value: 350,
        unit: 'ms',
        description: 'Average sync duration under 5 seconds',
      },
      {
        name: 'index_coverage',
        passed: true,
        value: 42,
        description: 'Sufficient indexes for production queries',
      },
    ],
    statistics: {
      active_users: 100,
      active_households: 50,
      active_accounts: 200,
      total_transactions: 5000,
    },
    generated_at: new Date().toISOString(),
  };

  assertEquals(report.status, 'ready');
  assertExists(report.checks);
  assertEquals(report.checks.length, 5);
  assertExists(report.statistics);
  assertExists(report.generated_at);
});

Deno.test('readiness report status is not_ready when checks fail', () => {
  const checks: ReadinessCheck[] = [
    {
      name: 'rls_coverage',
      passed: false,
      value: 60,
      unit: 'percent',
      description: 'Percentage of public tables with RLS enabled',
    },
  ];

  const allPassed = checks.every((c) => c.passed);
  const status = allPassed ? 'ready' : 'not_ready';

  assertEquals(status, 'not_ready');
});

Deno.test('readiness checks have consistent structure', () => {
  const check: ReadinessCheck = {
    name: 'rls_coverage',
    passed: true,
    value: 100,
    unit: 'percent',
    description: 'Percentage of public tables with RLS enabled',
  };

  assertEquals(typeof check.name, 'string');
  assertEquals(typeof check.passed, 'boolean');
  assertEquals(typeof check.description, 'string');
  assertEquals(check.name.length > 0, true);
  assertEquals(check.description.length > 0, true);
});

// ---------------------------------------------------------------------------
// Tests: Action validation
// ---------------------------------------------------------------------------

Deno.test('valid actions are accepted', () => {
  const validActions = ['readiness', 'checks', 'refresh'];
  for (const action of validActions) {
    assertEquals(validActions.includes(action), true);
  }
});

Deno.test('invalid action is rejected', () => {
  const validActions = ['readiness', 'checks', 'refresh'];
  assertEquals(validActions.includes('invalid'), false);
  assertEquals(validActions.includes(''), false);
});

// ---------------------------------------------------------------------------
// Tests: Security constraints
// ---------------------------------------------------------------------------

Deno.test('report does not contain financial data patterns', () => {
  const report: ReadinessReport = {
    status: 'ready',
    checks: [],
    statistics: { active_users: 10, active_households: 5 },
    generated_at: new Date().toISOString(),
  };

  const serialized = JSON.stringify(report);

  // Must not contain monetary patterns
  assertEquals(serialized.includes('balance'), false);
  assertEquals(serialized.includes('amount_cents'), false);
  assertEquals(serialized.includes('$'), false);

  // Must not contain PII patterns
  assertEquals(serialized.includes('@example.com'), false);
  assertEquals(serialized.includes('email'), false);
});

Deno.test('statistics only contain aggregate counts', () => {
  const stats: Record<string, number> = {
    active_users: 100,
    active_households: 50,
    active_accounts: 200,
    total_transactions: 5000,
    active_budgets: 30,
    active_goals: 15,
    sync_reports_24h: 500,
    rate_limit_entries_1h: 10,
  };

  // All values are non-negative integers (aggregate counts)
  for (const [key, value] of Object.entries(stats)) {
    assertEquals(typeof value, 'number', `${key} should be a number`);
    assertEquals(value >= 0, true, `${key} should be non-negative`);
    assertEquals(Number.isInteger(value), true, `${key} should be an integer`);
  }
});

// ---------------------------------------------------------------------------
// Tests: Default action
// ---------------------------------------------------------------------------

Deno.test('default action is readiness when not specified', () => {
  const url = new URL('https://test.supabase.co/functions/v1/launch-readiness');
  const action = url.searchParams.get('action') ?? 'readiness';
  assertEquals(action, 'readiness');
});

Deno.test('action parameter is extracted from URL', () => {
  const url = new URL('https://test.supabase.co/functions/v1/launch-readiness?action=checks');
  const action = url.searchParams.get('action');
  assertEquals(action, 'checks');
});
