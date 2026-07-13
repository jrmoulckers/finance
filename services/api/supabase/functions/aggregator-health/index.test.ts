// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Aggregator Health & Failover Edge Function.
 *
 * Focus: the household-authorization contract for the `health_history` (read)
 * and `resolve` (mutation) actions (#3857). These actions run on the
 * service-role admin client, which BYPASSES RLS, so household scoping must be
 * enforced in code by an explicit `household_members` lookup. A regression that
 * removes that lookup would reintroduce a cross-tenant IDOR.
 *
 * NOTE: Supabase Edge Functions register their handler via `serve()` and do not
 * export it, and this repo's Deno function tests are not wired into CI. These
 * tests therefore replicate the handler's authorization predicate (the same
 * convention used by `bank-connection/index.test.ts`) to lock the intended
 * security semantics, rather than spinning up the handler with a mocked client.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

// ---------------------------------------------------------------------------
// Authorization-contract model
//
// Mirrors the in-code checks the handler performs after resolving a resource's
// household_id: membership is required for reads; owner/admin membership is
// required for the `resolve` mutation.
// ---------------------------------------------------------------------------

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface MembershipRow {
  household_id: string;
  user_id: string;
  role: Role;
  deleted_at: string | null;
}

/** Read access: any non-deleted membership in the resource's household. */
function canReadHousehold(
  memberships: MembershipRow[],
  householdId: string,
  userId: string,
): boolean {
  return memberships.some(
    (m) => m.household_id === householdId && m.user_id === userId && m.deleted_at === null,
  );
}

/** Mutation access (e.g. resolve): non-deleted owner/admin membership. */
function canMutateHousehold(
  memberships: MembershipRow[],
  householdId: string,
  userId: string,
): boolean {
  return memberships.some(
    (m) =>
      m.household_id === householdId &&
      m.user_id === userId &&
      m.deleted_at === null &&
      (m.role === 'owner' || m.role === 'admin'),
  );
}

const MEMBERSHIPS: MembershipRow[] = [
  { household_id: 'hh-A', user_id: 'user-owner-A', role: 'owner', deleted_at: null },
  { household_id: 'hh-A', user_id: 'user-member-A', role: 'member', deleted_at: null },
  { household_id: 'hh-A', user_id: 'user-viewer-A', role: 'viewer', deleted_at: null },
  {
    household_id: 'hh-A',
    user_id: 'user-exmember-A',
    role: 'admin',
    deleted_at: '2026-01-01T00:00:00Z',
  },
  { household_id: 'hh-B', user_id: 'user-owner-B', role: 'owner', deleted_at: null },
];

// ---------------------------------------------------------------------------
// health_history (read) — cross-tenant read must be denied (#3857 finding 1)
// ---------------------------------------------------------------------------

Deno.test('health_history: a member of the connection household can read', () => {
  // Connection conn-A belongs to household hh-A.
  assertEquals(canReadHousehold(MEMBERSHIPS, 'hh-A', 'user-member-A'), true);
  assertEquals(canReadHousehold(MEMBERSHIPS, 'hh-A', 'user-viewer-A'), true);
});

Deno.test('health_history: a user from another household is denied (IDOR guard)', () => {
  // hh-B owner must NOT be able to read hh-A's connection health history by
  // supplying hh-A's connection_id.
  assertEquals(canReadHousehold(MEMBERSHIPS, 'hh-A', 'user-owner-B'), false);
});

Deno.test('health_history: an unrelated authenticated user is denied', () => {
  assertEquals(canReadHousehold(MEMBERSHIPS, 'hh-A', 'stranger'), false);
});

Deno.test('health_history: a removed (soft-deleted) member is denied', () => {
  assertEquals(canReadHousehold(MEMBERSHIPS, 'hh-A', 'user-exmember-A'), false);
});

// ---------------------------------------------------------------------------
// resolve (mutation) — owner/admin only (#3857 finding 2)
// ---------------------------------------------------------------------------

Deno.test('resolve: an owner of the event household may resolve', () => {
  assertEquals(canMutateHousehold(MEMBERSHIPS, 'hh-A', 'user-owner-A'), true);
});

Deno.test('resolve: a plain member/viewer may NOT resolve', () => {
  assertEquals(canMutateHousehold(MEMBERSHIPS, 'hh-A', 'user-member-A'), false);
  assertEquals(canMutateHousehold(MEMBERSHIPS, 'hh-A', 'user-viewer-A'), false);
});

Deno.test('resolve: a user from another household may NOT resolve (IDOR guard)', () => {
  // hh-B owner must not resolve (and thereby suppress) hh-A's health signals.
  assertEquals(canMutateHousehold(MEMBERSHIPS, 'hh-A', 'user-owner-B'), false);
});

Deno.test('resolve: a removed owner/admin is denied', () => {
  assertEquals(canMutateHousehold(MEMBERSHIPS, 'hh-A', 'user-exmember-A'), false);
});
