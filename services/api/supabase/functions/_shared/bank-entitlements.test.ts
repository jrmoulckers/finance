// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the bank connection entitlement RPC wrappers (#4404).
 *
 * These validate the mapping between the SECURITY DEFINER RPC rows and the
 * discriminated outcomes the Edge Function branches on, including the
 * fail-closed behavior on RPC errors and the PostgREST `BIGINT`-as-string
 * normalization. The database rule itself is covered by the SQL integration
 * suite (`supabase/tests/bank-connection-cap.test.sql`).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  claimOrphanedItemsForErasure,
  completeOrphanedItem,
  confirmConnectionFinalization,
  connectionCapMessage,
  finalizeConnectionReservation,
  premiumRequiredMessage,
  readConnectionCapacity,
  recordOrphanedItem,
  recordOrphanedItemAttempt,
  releaseConnectionReservation,
  reserveConnectionSlot,
  RESERVATION_TTL_SECONDS,
} from './bank-entitlements.ts';

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface CapturedRpc {
  fn: string;
  params: Record<string, unknown>;
}

/**
 * Minimal Supabase stub whose `.rpc()` returns a fixed result and records the
 * call. Sequential results support multi-call tests.
 */
function clientReturning(results: RpcResult | RpcResult[]): {
  client: SupabaseClient;
  captured: CapturedRpc[];
} {
  const queue = Array.isArray(results) ? [...results] : [results];
  const captured: CapturedRpc[] = [];
  const client = {
    rpc(fn: string, params: Record<string, unknown>) {
      captured.push({ fn, params });
      const result = queue.length > 1 ? queue.shift()! : queue[0];
      return Promise.resolve(result);
    },
  } as unknown as SupabaseClient;
  return { client, captured };
}

// ---------------------------------------------------------------------------
// reserveConnectionSlot
// ---------------------------------------------------------------------------

Deno.test('reserveConnectionSlot maps a reserved row and normalizes bigints', async () => {
  const { client, captured } = clientReturning({
    data: [
      {
        status: 'reserved',
        reservation_id: 'res-1',
        cap: '2',
        used: '1',
        expires_at: '2026-09-06T00:15:00Z',
      },
    ],
    error: null,
  });

  const result = await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
  });

  assertEquals(result, {
    status: 'reserved',
    reservationId: 'res-1',
    cap: 2,
    used: 1,
    expiresAt: '2026-09-06T00:15:00Z',
  });
  assertEquals(captured[0].fn, 'reserve_bank_connection_slot');
  assertEquals(captured[0].params, {
    p_household_id: 'hh-1',
    p_owner_id: 'user-1',
    p_provider: 'plaid',
    p_ttl_seconds: RESERVATION_TTL_SECONDS,
  });
});

Deno.test('reserveConnectionSlot maps premium_required for a zero allowance', async () => {
  const { client } = clientReturning({
    data: [
      { status: 'premium_required', reservation_id: null, cap: '0', used: '0', expires_at: null },
    ],
    error: null,
  });
  const result = await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'mx',
  });
  assertEquals(result, { status: 'premium_required', cap: 0 });
});

Deno.test('reserveConnectionSlot maps at_cap when the allowance is exhausted', async () => {
  const { client } = clientReturning({
    data: [{ status: 'at_cap', reservation_id: null, cap: '2', used: '2', expires_at: null }],
    error: null,
  });
  const result = await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
  });
  assertEquals(result, { status: 'at_cap', cap: 2, used: 2 });
});

Deno.test('reserveConnectionSlot maps forbidden for a non-member', async () => {
  const { client } = clientReturning({
    data: [{ status: 'forbidden', reservation_id: null, cap: null, used: null, expires_at: null }],
    error: null,
  });
  const result = await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'stranger',
    provider: 'plaid',
  });
  assertEquals(result, { status: 'forbidden' });
});

Deno.test('reserveConnectionSlot fails closed on an RPC error', async () => {
  const { client } = clientReturning({ data: null, error: { message: 'projection unavailable' } });
  const result = await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
  });
  assertEquals(result, { status: 'error', message: 'projection unavailable' });
});

Deno.test('reserveConnectionSlot fails closed on an empty response', async () => {
  const { client } = clientReturning({ data: [], error: null });
  const result = await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
  });
  assertEquals(result.status, 'error');
});

Deno.test('reserveConnectionSlot honours a custom TTL', async () => {
  const { client, captured } = clientReturning({
    data: [{ status: 'at_cap', reservation_id: null, cap: '0', used: '0', expires_at: null }],
    error: null,
  });
  await reserveConnectionSlot(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    ttlSeconds: 60,
  });
  assertEquals(captured[0].params.p_ttl_seconds, 60);
});

// ---------------------------------------------------------------------------
// finalizeConnectionReservation
// ---------------------------------------------------------------------------

Deno.test('finalizeConnectionReservation maps a finalized row', async () => {
  const { client, captured } = clientReturning({
    data: [{ status: 'finalized', connection_id: 'conn-1', created_at: '2026-09-06T00:01:00Z' }],
    error: null,
  });

  const result = await finalizeConnectionReservation(client, {
    reservationId: 'res-1',
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    institutionId: 'ins_1',
    institutionName: 'Chase',
    encryptedAccessToken: 'enc',
    connectionId: 'conn-1',
    metadata: { item_id: 'item-1' },
  });

  assertEquals(result, {
    status: 'finalized',
    connectionId: 'conn-1',
    createdAt: '2026-09-06T00:01:00Z',
  });
  assertEquals(captured[0].fn, 'finalize_bank_connection_reservation');
  assertEquals(captured[0].params.p_encrypted_access_token, 'enc');
  assertEquals(captured[0].params.p_metadata, { item_id: 'item-1' });
  // The caller-generated id is what makes a replay idempotent.
  assertEquals(captured[0].params.p_connection_id, 'conn-1');
});

Deno.test('finalizeConnectionReservation maps a reclaimed slot to at_cap', async () => {
  const { client } = clientReturning({
    data: [{ status: 'at_cap', connection_id: null, created_at: null }],
    error: null,
  });
  const result = await finalizeConnectionReservation(client, {
    reservationId: 'res-1',
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    institutionId: 'ins_1',
    institutionName: 'Chase',
    encryptedAccessToken: 'enc',
    connectionId: 'conn-1',
  });
  assertEquals(result, { status: 'at_cap' });
});

Deno.test('finalizeConnectionReservation maps a missing reservation', async () => {
  const { client } = clientReturning({
    data: [{ status: 'reservation_not_found', connection_id: null, created_at: null }],
    error: null,
  });
  const result = await finalizeConnectionReservation(client, {
    reservationId: 'res-x',
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'mx',
    institutionId: 'ins_1',
    institutionName: 'Chase',
    encryptedAccessToken: 'enc',
    connectionId: 'conn-1',
  });
  assertEquals(result, { status: 'reservation_not_found' });
});

Deno.test(
  'finalizeConnectionReservation maps a soft-deleted replay to already_disconnected',
  async () => {
    const { client } = clientReturning({
      data: [{ status: 'already_disconnected', connection_id: 'conn-1', created_at: null }],
      error: null,
    });
    const result = await finalizeConnectionReservation(client, {
      reservationId: 'res-1',
      householdId: 'hh-1',
      ownerId: 'user-1',
      provider: 'plaid',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      encryptedAccessToken: 'enc',
      connectionId: 'conn-1',
    });
    assertEquals(result, { status: 'already_disconnected' });
  },
);

// An RPC error is the commit-then-lost-response case. It must NEVER be reported
// as a rejection, because a rejection authorises the caller to revoke the Item.
Deno.test(
  'finalizeConnectionReservation reports an RPC error as unknown, not a rejection',
  async () => {
    const { client } = clientReturning({ data: null, error: { message: 'deadlock' } });
    const result = await finalizeConnectionReservation(client, {
      reservationId: 'res-1',
      householdId: 'hh-1',
      ownerId: 'user-1',
      provider: 'plaid',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      encryptedAccessToken: 'enc',
      connectionId: 'conn-1',
    });
    assertEquals(result, { status: 'unknown', message: 'deadlock' });
  },
);

Deno.test(
  'finalizeConnectionReservation reports an empty or unrecognized response as unknown',
  async () => {
    const empty = clientReturning({ data: [], error: null });
    const emptyResult = await finalizeConnectionReservation(empty.client, {
      reservationId: 'res-1',
      householdId: 'hh-1',
      ownerId: 'user-1',
      provider: 'plaid',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      encryptedAccessToken: 'enc',
      connectionId: 'conn-1',
    });
    assertEquals(emptyResult.status, 'unknown');

    const odd = clientReturning({
      data: [{ status: 'something_new', connection_id: null, created_at: null }],
      error: null,
    });
    const oddResult = await finalizeConnectionReservation(odd.client, {
      reservationId: 'res-1',
      householdId: 'hh-1',
      ownerId: 'user-1',
      provider: 'plaid',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      encryptedAccessToken: 'enc',
      connectionId: 'conn-1',
    });
    assertEquals(oddResult.status, 'unknown');

    // A "finalized" row missing its committed identity is not actionable either.
    const malformed = clientReturning({
      data: [{ status: 'finalized', connection_id: null, created_at: null }],
      error: null,
    });
    const malformedResult = await finalizeConnectionReservation(malformed.client, {
      reservationId: 'res-1',
      householdId: 'hh-1',
      ownerId: 'user-1',
      provider: 'plaid',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      encryptedAccessToken: 'enc',
      connectionId: 'conn-1',
    });
    assertEquals(malformedResult.status, 'unknown');
  },
);

// ---------------------------------------------------------------------------
// confirmConnectionFinalization
// ---------------------------------------------------------------------------

Deno.test('confirmConnectionFinalization resolves a committed row', async () => {
  const { client, captured } = clientReturning({
    data: [{ state: 'finalized', created_at: '2026-09-06T00:01:00Z' }],
    error: null,
  });
  const result = await confirmConnectionFinalization(client, {
    connectionId: 'conn-1',
    householdId: 'hh-1',
  });
  assertEquals(result, { state: 'finalized', createdAt: '2026-09-06T00:01:00Z' });
  assertEquals(captured[0].fn, 'bank_connection_finalization_state');
  assertEquals(captured[0].params, { p_connection_id: 'conn-1', p_household_id: 'hh-1' });
});

Deno.test('confirmConnectionFinalization distinguishes disconnected from absent', async () => {
  const disconnected = clientReturning({
    data: [{ state: 'disconnected', created_at: null }],
    error: null,
  });
  assertEquals(
    await confirmConnectionFinalization(disconnected.client, {
      connectionId: 'conn-1',
      householdId: 'hh-1',
    }),
    { state: 'disconnected' },
  );

  const absent = clientReturning({ data: [{ state: 'absent', created_at: null }], error: null });
  assertEquals(
    await confirmConnectionFinalization(absent.client, {
      connectionId: 'conn-1',
      householdId: 'hh-1',
    }),
    { state: 'absent' },
  );
});

// The confirming read is the ONLY thing standing between an ambiguous
// finalization and a destructive revoke, so it must fail closed too.
Deno.test('confirmConnectionFinalization fails closed to unknown', async () => {
  for (const result of [
    { data: null, error: { message: 'timeout' } },
    { data: [], error: null },
    { data: [{ state: 'weird', created_at: null }], error: null },
    { data: [{ state: 'finalized', created_at: null }], error: null },
  ]) {
    const { client } = clientReturning(result);
    assertEquals(
      await confirmConnectionFinalization(client, { connectionId: 'c', householdId: 'h' }),
      { state: 'unknown' },
    );
  }
});

// ---------------------------------------------------------------------------
// releaseConnectionReservation / recordOrphanedItem / readConnectionCapacity
// ---------------------------------------------------------------------------

Deno.test('releaseConnectionReservation calls the release RPC and never throws', async () => {
  const { client, captured } = clientReturning({ data: true, error: null });
  await releaseConnectionReservation(client, { reservationId: 'res-1', householdId: 'hh-1' });
  assertEquals(captured[0].fn, 'release_bank_connection_reservation');
  assertEquals(captured[0].params, { p_reservation_id: 'res-1', p_household_id: 'hh-1' });
});

Deno.test('recordOrphanedItem returns the handoff id from a scalar response', async () => {
  const { client, captured } = clientReturning({ data: 'handoff-1', error: null });
  const id = await recordOrphanedItem(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    encryptedAccessToken: 'enc',
    lastErrorCode: 'ITEM_ERROR',
  });
  assertEquals(id, 'handoff-1');
  assertEquals(captured[0].params.p_last_error_code, 'ITEM_ERROR');
  // The encrypted credential must be retained so revocation can be retried.
  assertEquals(captured[0].params.p_encrypted_access_token, 'enc');
});

Deno.test('recordOrphanedItem defaults to the definite pending_revocation handoff', async () => {
  const { client, captured } = clientReturning({ data: 'handoff-1', error: null });
  await recordOrphanedItem(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    encryptedAccessToken: 'enc',
  });
  assertEquals(captured[0].params.p_status, 'pending_revocation');
  assertEquals(captured[0].params.p_connection_id, null);
});

// The unknown-outcome handoff must carry the connection id, or Stage 7 has no
// way to resolve whether the Item is already backing a live row.
Deno.test('recordOrphanedItem forwards a reconciliation status and connection id', async () => {
  const { client, captured } = clientReturning({ data: 'handoff-2', error: null });
  const id = await recordOrphanedItem(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'mx',
    encryptedAccessToken: 'enc',
    lastErrorCode: 'FINALIZE_OUTCOME_UNKNOWN',
    status: 'pending_reconciliation',
    connectionId: 'conn-1',
  });
  assertEquals(id, 'handoff-2');
  assertEquals(captured[0].params.p_status, 'pending_reconciliation');
  assertEquals(captured[0].params.p_connection_id, 'conn-1');
});

Deno.test('recordOrphanedItem returns null when the handoff cannot be written', async () => {
  const { client } = clientReturning({ data: null, error: { message: 'insert failed' } });
  const id = await recordOrphanedItem(client, {
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    encryptedAccessToken: 'enc',
  });
  assertEquals(id, null);
});

// ---------------------------------------------------------------------------
// Orphan terminal disposition and erasure claim
// ---------------------------------------------------------------------------

Deno.test('completeOrphanedItem reports the terminal transition and never throws', async () => {
  const ok = clientReturning({ data: true, error: null });
  assertEquals(await completeOrphanedItem(ok.client, { id: 'handoff-1', status: 'revoked' }), true);
  assertEquals(ok.captured[0].fn, 'complete_orphaned_bank_item');
  assertEquals(ok.captured[0].params, {
    p_id: 'handoff-1',
    p_status: 'revoked',
    p_last_error_code: null,
  });

  const alreadyTerminal = clientReturning({ data: false, error: null });
  assertEquals(
    await completeOrphanedItem(alreadyTerminal.client, { id: 'handoff-1', status: 'abandoned' }),
    false,
  );

  const failed = clientReturning({ data: null, error: { message: 'boom' } });
  assertEquals(
    await completeOrphanedItem(failed.client, { id: 'handoff-1', status: 'revoked' }),
    false,
  );

  const throwing = {
    rpc() {
      throw new Error('transport');
    },
  } as unknown as SupabaseClient;
  assertEquals(await completeOrphanedItem(throwing, { id: 'x', status: 'revoked' }), false);
});

Deno.test('recordOrphanedItemAttempt records the failure without discarding anything', async () => {
  const { client, captured } = clientReturning({ data: true, error: null });
  await recordOrphanedItemAttempt(client, { id: 'handoff-1', lastErrorCode: 'PROVIDER_DOWN' });
  assertEquals(captured[0].fn, 'record_orphaned_bank_item_attempt');
  assertEquals(captured[0].params, { p_id: 'handoff-1', p_last_error_code: 'PROVIDER_DOWN' });

  const throwing = {
    rpc() {
      throw new Error('transport');
    },
  } as unknown as SupabaseClient;
  await recordOrphanedItemAttempt(throwing, { id: 'x' });
});

Deno.test('claimOrphanedItemsForErasure maps claimed handoffs for revocation', async () => {
  const { client, captured } = clientReturning({
    data: [
      {
        id: 'handoff-1',
        provider: 'plaid',
        encrypted_access_token: 'enc-1',
        status: 'pending_revocation',
        connection_id: null,
      },
      {
        id: 'handoff-2',
        provider: 'mx',
        encrypted_access_token: 'enc-2',
        status: 'pending_reconciliation',
        connection_id: 'conn-2',
      },
      // Defensive: a malformed row must not become an un-revocable entry.
      { id: null, provider: null, encrypted_access_token: null, status: null, connection_id: null },
    ],
    error: null,
  });

  const claimed = await claimOrphanedItemsForErasure(client, {
    ownerId: 'user-1',
    householdIds: ['hh-1', 'hh-2'],
  });

  assertEquals(claimed.length, 2);
  assertEquals(claimed[0], {
    id: 'handoff-1',
    provider: 'plaid',
    encryptedAccessToken: 'enc-1',
    status: 'pending_revocation',
    connectionId: null,
  });
  assertEquals(claimed[1].status, 'pending_reconciliation');
  assertEquals(claimed[1].connectionId, 'conn-2');
  assertEquals(captured[0].fn, 'claim_orphaned_bank_items_for_erasure');
  assertEquals(captured[0].params, {
    p_owner_id: 'user-1',
    p_household_ids: ['hh-1', 'hh-2'],
  });
});

Deno.test('claimOrphanedItemsForErasure never blocks account deletion', async () => {
  const failed = clientReturning({ data: null, error: { message: 'unavailable' } });
  assertEquals(await claimOrphanedItemsForErasure(failed.client, { ownerId: 'user-1' }), []);

  const throwing = {
    rpc() {
      throw new Error('transport');
    },
  } as unknown as SupabaseClient;
  assertEquals(await claimOrphanedItemsForErasure(throwing, { ownerId: 'user-1' }), []);

  // No households means "match on owner only", not "match every household".
  const empty = clientReturning({ data: [], error: null });
  await claimOrphanedItemsForErasure(empty.client, { ownerId: 'user-1', householdIds: [] });
  assertEquals(empty.captured[0].params.p_household_ids, null);
});

Deno.test('readConnectionCapacity normalizes bigints and fails closed', async () => {
  const ok = clientReturning({ data: [{ cap: '4', used: '1' }], error: null });
  assertEquals(await readConnectionCapacity(ok.client, 'hh-1'), { cap: 4, used: 1 });

  const bad = clientReturning({ data: null, error: { message: 'boom' } });
  assertEquals(await readConnectionCapacity(bad.client, 'hh-1'), null);
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

Deno.test('connectionCapMessage states the limit and remedy without a price', () => {
  const message = connectionCapMessage(2);
  assertStringIncludes(message, '2 connected banks');
  assertStringIncludes(message, 'Disconnect a bank');
  assertEquals(message.includes('$'), false);
});

Deno.test('connectionCapMessage singularises a cap of one', () => {
  assertStringIncludes(connectionCapMessage(1), '1 connected bank.');
});

Deno.test('premiumRequiredMessage names no price', () => {
  const message = premiumRequiredMessage();
  assertStringIncludes(message, 'eligible plan');
  assertEquals(message.includes('$'), false);
});
