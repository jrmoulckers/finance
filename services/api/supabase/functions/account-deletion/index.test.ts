// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `account-deletion` Edge Function (#533).
 *
 * Validates method restrictions, authentication, confirmation parameter,
 * soft-deletion cascading, sole-member vs shared household handling,
 * audit logging, deletion certificate structure, and auth.admin.deleteUser.
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
  assertNoSensitiveDataLeakage,
  assertIsoTimestamp,
} from '../_test_helpers/assertions.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';
import {
  TEST_USER,
  TEST_HOUSEHOLD,
  TEST_HOUSEHOLD_2,
  TEST_MEMBERSHIP,
  TEST_MEMBERSHIP_2,
  TEST_MEMBERSHIP_SHARED,
} from '../_test_helpers/test-fixtures.ts';

// ---------------------------------------------------------------------------
// Inline handler logic for isolated testing.
// ---------------------------------------------------------------------------

interface MockDeletionDeps {
  authenticatedUser?: { id: string; email: string } | null;
  memberships?: { id: string; household_id: string; role: string }[];
  otherMembersMap?: Record<string, { id: string }[]>;
  userDeleteError?: { message: string } | null;
  authDeleteError?: boolean;
}

const testCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://app.finance.example.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Tracks which operations were performed during a test. */
interface DeletionActions {
  auditLogs: { action: string; record_id: string }[];
  softDeletedTables: { table: string; household_id: string }[];
  softDeletedMemberships: string[];
  softDeletedPasskeys: boolean;
  softDeletedUser: boolean;
  authUserDeleted: boolean;
  softDeletedHouseholds: string[];
}

function generateCertificateId(): string {
  const timestamp = Date.now().toString(36);
  return `cert-${timestamp}-testrand`;
}

async function handleAccountDeletion(
  req: Request,
  deps: MockDeletionDeps = {},
): Promise<{ response: Response; actions: DeletionActions }> {
  const actions: DeletionActions = {
    auditLogs: [],
    softDeletedTables: [],
    softDeletedMemberships: [],
    softDeletedPasskeys: false,
    softDeletedUser: false,
    authUserDeleted: false,
    softDeletedHouseholds: [],
  };

  if (req.method === 'OPTIONS') {
    return {
      response: new Response(null, { status: 204, headers: testCorsHeaders }),
      actions,
    };
  }

  if (req.method !== 'DELETE') {
    return {
      response: new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      }),
      actions,
    };
  }

  const user = deps.authenticatedUser ?? null;
  if (!user) {
    return {
      response: new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      }),
      actions,
    };
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty
    }

    if (body.confirm !== true && body.confirm !== 'DELETE_MY_ACCOUNT') {
      return {
        response: new Response(
          JSON.stringify({
            error:
              'Account deletion requires confirmation. Send { "confirm": "DELETE_MY_ACCOUNT" } in the request body.',
          }),
          {
            status: 400,
            headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
          },
        ),
        actions,
      };
    }

    const deletionTimestamp = new Date().toISOString();
    const certificateId = generateCertificateId();
    const shreddedKeys: string[] = [];

    // Step 1: Audit log BEFORE deletion
    actions.auditLogs.push({ action: 'ACCOUNT_DELETION_REQUESTED', record_id: user.id });

    // Step 2: Get memberships
    const memberships = deps.memberships ?? [];
    const householdIds = memberships.map((m) => m.household_id);

    // Step 3: Crypto-shredding per household
    for (const householdId of householdIds) {
      const otherMembers = deps.otherMembersMap?.[householdId] ?? [];
      const isSoleMember = otherMembers.length === 0;

      if (isSoleMember) {
        const keyFingerprint = `shredded:household:${householdId}:test`;
        shreddedKeys.push(keyFingerprint);

        const tables = [
          'transactions',
          'budgets',
          'goals',
          'accounts',
          'categories',
          'household_invitations',
        ];
        for (const table of tables) {
          actions.softDeletedTables.push({ table, household_id: householdId });
        }

        actions.softDeletedHouseholds.push(householdId);
      } else {
        const keyFingerprint = `revoked:user-key:${householdId}:${user.id}:test`;
        shreddedKeys.push(keyFingerprint);
      }
    }

    // User personal key
    shreddedKeys.push(`shredded:user:${user.id}:test`);

    // Step 4: Soft-delete memberships
    for (const membership of memberships) {
      actions.softDeletedMemberships.push(membership.id);
    }

    // Step 5: Soft-delete passkey credentials
    actions.softDeletedPasskeys = true;

    // Step 6: Soft-delete user record
    if (deps.userDeleteError) {
      return {
        response: new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        }),
        actions,
      };
    }
    actions.softDeletedUser = true;

    // Step 7: Audit log AFTER deletion
    actions.auditLogs.push({ action: 'ACCOUNT_DELETED', record_id: user.id });

    // Step 8: Delete auth user
    if (!deps.authDeleteError) {
      actions.authUserDeleted = true;
    }

    // Step 9: Return deletion certificate
    return {
      response: new Response(
        JSON.stringify({
          deletion_certificate: {
            certificate_id: certificateId,
            subject_type: 'USER',
            subject_id: user.id,
            deleted_at: deletionTimestamp,
            households_affected: householdIds.length,
            keys_shredded: shreddedKeys.length,
            key_fingerprints: shreddedKeys,
            verified: true,
            message:
              'Your account and associated data have been permanently deleted. ' +
              'Encrypted data has been rendered unrecoverable via crypto-shredding. ' +
              'This certificate serves as proof of deletion per GDPR Article 17.',
          },
        }),
        {
          status: 200,
          headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
        },
      ),
      actions,
    };
  } catch {
    return {
      response: new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...testCorsHeaders, 'Content-Type': 'application/json' },
      }),
      actions,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests: method restrictions
// ---------------------------------------------------------------------------

Deno.test('account-deletion — returns 405 for GET method', async () => {
  const { response } = await handleAccountDeletion(createMockRequest({ method: 'GET' }));
  await assertErrorResponse(response, 405, 'Method not allowed');
});

Deno.test('account-deletion — returns 405 for POST method', async () => {
  const { response } = await handleAccountDeletion(createMockRequest({ method: 'POST', body: {} }));
  await assertErrorResponse(response, 405, 'Method not allowed');
});

Deno.test('account-deletion — returns 405 for PUT method', async () => {
  const { response } = await handleAccountDeletion(createMockRequest({ method: 'PUT', body: {} }));
  await assertErrorResponse(response, 405, 'Method not allowed');
});

// ---------------------------------------------------------------------------
// Tests: authentication
// ---------------------------------------------------------------------------

Deno.test('account-deletion — returns 401 without authentication', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: 'DELETE_MY_ACCOUNT' } }),
    { authenticatedUser: null },
  );
  await assertErrorResponse(response, 401, 'Authentication required');
});

// ---------------------------------------------------------------------------
// Tests: confirmation parameter
// ---------------------------------------------------------------------------

Deno.test('account-deletion — returns 400 without confirmation', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: {} }),
    { authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email } },
  );
  await assertErrorResponse(response, 400, 'requires confirmation');
});

Deno.test('account-deletion — returns 400 with wrong confirmation value', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: 'yes' } }),
    { authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email } },
  );
  await assertErrorResponse(response, 400, 'requires confirmation');
});

Deno.test('account-deletion — accepts boolean true confirmation', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );
  assertStatus(response, 200);
});

Deno.test('account-deletion — accepts "DELETE_MY_ACCOUNT" confirmation', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: 'DELETE_MY_ACCOUNT' } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );
  assertStatus(response, 200);
});

// ---------------------------------------------------------------------------
// Tests: soft-deletion cascading
// ---------------------------------------------------------------------------

Deno.test('account-deletion — soft-deletes user record', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );
  assertEquals(actions.softDeletedUser, true);
});

Deno.test('account-deletion — soft-deletes memberships', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [
        { id: TEST_MEMBERSHIP.id, household_id: TEST_HOUSEHOLD.id, role: 'owner' },
        { id: TEST_MEMBERSHIP_2.id, household_id: TEST_HOUSEHOLD_2.id, role: 'owner' },
      ],
      otherMembersMap: {
        [TEST_HOUSEHOLD.id]: [],
        [TEST_HOUSEHOLD_2.id]: [{ id: TEST_MEMBERSHIP_SHARED.id }],
      },
    },
  );
  assertEquals(actions.softDeletedMemberships.length, 2);
  assertEquals(actions.softDeletedMemberships.includes(TEST_MEMBERSHIP.id), true);
  assertEquals(actions.softDeletedMemberships.includes(TEST_MEMBERSHIP_2.id), true);
});

Deno.test('account-deletion — soft-deletes passkey credentials', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );
  assertEquals(actions.softDeletedPasskeys, true);
});

// ---------------------------------------------------------------------------
// Tests: sole-member vs shared household
// ---------------------------------------------------------------------------

Deno.test('account-deletion — soft-deletes sole-member household data', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [{ id: TEST_MEMBERSHIP.id, household_id: TEST_HOUSEHOLD.id, role: 'owner' }],
      otherMembersMap: {
        [TEST_HOUSEHOLD.id]: [], // Sole member
      },
    },
  );

  // Should soft-delete all financial data tables for the household
  const deletedTables = actions.softDeletedTables.map((t) => t.table);
  assertEquals(deletedTables.includes('transactions'), true);
  assertEquals(deletedTables.includes('budgets'), true);
  assertEquals(deletedTables.includes('goals'), true);
  assertEquals(deletedTables.includes('accounts'), true);
  assertEquals(deletedTables.includes('categories'), true);
  assertEquals(deletedTables.includes('household_invitations'), true);

  // Should soft-delete the household itself
  assertEquals(actions.softDeletedHouseholds.includes(TEST_HOUSEHOLD.id), true);
});

Deno.test('account-deletion — preserves shared household data', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [{ id: TEST_MEMBERSHIP_2.id, household_id: TEST_HOUSEHOLD_2.id, role: 'owner' }],
      otherMembersMap: {
        [TEST_HOUSEHOLD_2.id]: [{ id: TEST_MEMBERSHIP_SHARED.id }], // Has other members
      },
    },
  );

  // Should NOT soft-delete household data or the household
  const sharedTableDeletes = actions.softDeletedTables.filter(
    (t) => t.household_id === TEST_HOUSEHOLD_2.id,
  );
  assertEquals(sharedTableDeletes.length, 0);
  assertEquals(actions.softDeletedHouseholds.includes(TEST_HOUSEHOLD_2.id), false);
});

Deno.test('account-deletion — handles mixed sole and shared households', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [
        { id: TEST_MEMBERSHIP.id, household_id: TEST_HOUSEHOLD.id, role: 'owner' },
        { id: TEST_MEMBERSHIP_2.id, household_id: TEST_HOUSEHOLD_2.id, role: 'owner' },
      ],
      otherMembersMap: {
        [TEST_HOUSEHOLD.id]: [], // Sole member → delete
        [TEST_HOUSEHOLD_2.id]: [{ id: TEST_MEMBERSHIP_SHARED.id }], // Shared → preserve
      },
    },
  );

  // Sole-member household data should be deleted
  const soleTableDeletes = actions.softDeletedTables.filter(
    (t) => t.household_id === TEST_HOUSEHOLD.id,
  );
  assertEquals(soleTableDeletes.length > 0, true);

  // Shared household data should be preserved
  const sharedTableDeletes = actions.softDeletedTables.filter(
    (t) => t.household_id === TEST_HOUSEHOLD_2.id,
  );
  assertEquals(sharedTableDeletes.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: audit logging
// ---------------------------------------------------------------------------

Deno.test('account-deletion — creates audit log before deletion', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );

  const requestedLog = actions.auditLogs.find((l) => l.action === 'ACCOUNT_DELETION_REQUESTED');
  assertEquals(requestedLog !== undefined, true);
  assertEquals(requestedLog!.record_id, TEST_USER.id);
});

Deno.test('account-deletion — creates audit log after deletion', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );

  const completedLog = actions.auditLogs.find((l) => l.action === 'ACCOUNT_DELETED');
  assertEquals(completedLog !== undefined, true);
  assertEquals(completedLog!.record_id, TEST_USER.id);
});

Deno.test('account-deletion — audit log before is created before after', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );

  const requestedIdx = actions.auditLogs.findIndex(
    (l) => l.action === 'ACCOUNT_DELETION_REQUESTED',
  );
  const completedIdx = actions.auditLogs.findIndex((l) => l.action === 'ACCOUNT_DELETED');

  assertEquals(requestedIdx < completedIdx, true, 'REQUESTED should come before DELETED');
});

// ---------------------------------------------------------------------------
// Tests: deletion certificate
// ---------------------------------------------------------------------------

Deno.test('account-deletion — returns deletion certificate with correct structure', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [{ id: TEST_MEMBERSHIP.id, household_id: TEST_HOUSEHOLD.id, role: 'owner' }],
      otherMembersMap: { [TEST_HOUSEHOLD.id]: [] },
    },
  );

  assertStatus(response, 200);
  const body = await assertJsonBody(response);
  const cert = body.deletion_certificate as Record<string, unknown>;

  // Verify all required fields
  assertEquals(typeof cert.certificate_id, 'string');
  assertStringIncludes(cert.certificate_id as string, 'cert-');
  assertEquals(cert.subject_type, 'USER');
  assertEquals(cert.subject_id, TEST_USER.id);
  assertEquals(typeof cert.deleted_at, 'string');
  assertIsoTimestamp(cert.deleted_at as string);
  assertEquals(typeof cert.households_affected, 'number');
  assertEquals(typeof cert.keys_shredded, 'number');
  assertEquals(Array.isArray(cert.key_fingerprints), true);
  assertEquals(cert.verified, true);
  assertStringIncludes(cert.message as string, 'GDPR Article 17');
});

Deno.test('account-deletion — certificate includes correct household count', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [
        { id: TEST_MEMBERSHIP.id, household_id: TEST_HOUSEHOLD.id, role: 'owner' },
        { id: TEST_MEMBERSHIP_2.id, household_id: TEST_HOUSEHOLD_2.id, role: 'owner' },
      ],
      otherMembersMap: {
        [TEST_HOUSEHOLD.id]: [],
        [TEST_HOUSEHOLD_2.id]: [{ id: TEST_MEMBERSHIP_SHARED.id }],
      },
    },
  );

  const body = await assertJsonBody(response);
  const cert = body.deletion_certificate as Record<string, unknown>;
  assertEquals(cert.households_affected, 2);
});

Deno.test('account-deletion — certificate for user with no households', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );

  const body = await assertJsonBody(response);
  const cert = body.deletion_certificate as Record<string, unknown>;
  assertEquals(cert.households_affected, 0);
  assertEquals(cert.keys_shredded, 1); // Only user personal key
});

// ---------------------------------------------------------------------------
// Tests: auth.admin.deleteUser
// ---------------------------------------------------------------------------

Deno.test('account-deletion — calls auth.admin.deleteUser', async () => {
  const { actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );

  assertEquals(actions.authUserDeleted, true);
});

Deno.test('account-deletion — succeeds even if auth delete fails (non-fatal)', async () => {
  const { response, actions } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
      authDeleteError: true,
    },
  );

  // Should still return 200 with certificate
  assertStatus(response, 200);
  assertEquals(actions.authUserDeleted, false);
  assertEquals(actions.softDeletedUser, true);
});

// ---------------------------------------------------------------------------
// Tests: user record soft-delete failure
// ---------------------------------------------------------------------------

Deno.test('account-deletion — returns 500 on user soft-delete failure', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
      userDeleteError: { message: 'Database error' },
    },
  );

  assertStatus(response, 500);
  await assertNoSensitiveDataLeakage(response);
});

// ---------------------------------------------------------------------------
// Tests: CORS headers
// ---------------------------------------------------------------------------

Deno.test('account-deletion — includes CORS headers on success', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
    },
  );

  assertCorsHeaders(response);
});

Deno.test('account-deletion — includes CORS headers on error', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: {} }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
    },
  );

  assertCorsHeaders(response);
});

// ---------------------------------------------------------------------------
// Tests: OPTIONS preflight
// ---------------------------------------------------------------------------

Deno.test('account-deletion — OPTIONS returns 204', async () => {
  const { response } = await handleAccountDeletion(createMockRequest({ method: 'OPTIONS' }));
  assertStatus(response, 204);
});

// ---------------------------------------------------------------------------
// Tests: no sensitive data leakage
// ---------------------------------------------------------------------------

Deno.test('account-deletion — does not leak internal details on error', async () => {
  const { response } = await handleAccountDeletion(
    createMockRequest({ method: 'DELETE', body: { confirm: true } }),
    {
      authenticatedUser: { id: TEST_USER.id, email: TEST_USER.email },
      memberships: [],
      userDeleteError: { message: 'relation "users" does not exist' },
    },
  );

  await assertNoSensitiveDataLeakage(response);
});
