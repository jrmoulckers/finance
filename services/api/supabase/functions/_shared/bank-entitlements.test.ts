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
  connectionCapMessage,
  finalizeConnectionReservation,
  premiumRequiredMessage,
  readConnectionCapacity,
  recordOrphanedItem,
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
  });
  assertEquals(result, { status: 'reservation_not_found' });
});

Deno.test('finalizeConnectionReservation fails closed on an RPC error', async () => {
  const { client } = clientReturning({ data: null, error: { message: 'deadlock' } });
  const result = await finalizeConnectionReservation(client, {
    reservationId: 'res-1',
    householdId: 'hh-1',
    ownerId: 'user-1',
    provider: 'plaid',
    institutionId: 'ins_1',
    institutionName: 'Chase',
    encryptedAccessToken: 'enc',
  });
  assertEquals(result, { status: 'error', message: 'deadlock' });
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
