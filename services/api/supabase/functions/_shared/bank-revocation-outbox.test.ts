// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  queueProviderPermissionRevocation,
  runBankRevocationMaintenance,
} from './bank-revocation-outbox.ts';

function rpcClient(result: { error: { message: string } | null }): {
  client: SupabaseClient;
  calls: Array<{ name: string; params: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return Promise.resolve({ data: null, error: result.error });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

Deno.test(
  'provider permission revocation is durably queued without detaching history',
  async () => {
    const { client, calls } = rpcClient({ error: null });

    await queueProviderPermissionRevocation(client, 'connection-1');

    assertEquals(calls, [
      {
        name: 'enqueue_bank_connection_revocation_internal',
        params: {
          p_connection_id: 'connection-1',
          p_reason: 'user_disconnect',
          p_detach_identity: false,
        },
      },
    ]);
  },
);

Deno.test('provider permission revocation fails closed when durable enqueue fails', async () => {
  const { client } = rpcClient({ error: { message: 'private database detail' } });

  const error = await assertRejects(
    () => queueProviderPermissionRevocation(client, 'connection-1'),
    Error,
    'provider revocation could not be durably queued',
  );
  assertEquals(error.message.includes('private database detail'), false);
});

Deno.test(
  'revocation maintenance invokes recovery, purge, and safe reconciliation summary',
  async () => {
    const calls: string[] = [];
    const client = {
      rpc(name: string) {
        calls.push(name);
        if (name === 'recover_exhausted_bank_revocations') {
          return Promise.resolve({ data: 2, error: null });
        }
        if (name === 'purge_expired_orphaned_bank_items') {
          return Promise.resolve({ data: [{ abandoned: 1, deleted: 2 }], error: null });
        }
        return Promise.resolve({
          data: [
            { status: 'pending_reconciliation', reason: 'finalization_failure', jobs: '4' },
            { status: 'abandoned', reason: 'finalization_failure', jobs: '5' },
          ],
          error: null,
        });
      },
    } as unknown as SupabaseClient;

    assertEquals(await runBankRevocationMaintenance(client), {
      recovered: 2,
      purged: 3,
      pendingReconciliation: 4,
      abandonedReconciliation: 5,
    });
    assertEquals(calls, [
      'recover_exhausted_bank_revocations',
      'purge_expired_orphaned_bank_items',
      'bank_revocation_reconciliation_summary',
    ]);
  },
);

Deno.test('revocation maintenance fails closed without leaking database details', async () => {
  const { client } = rpcClient({ error: { message: 'private database detail' } });

  const error = await assertRejects(
    () => runBankRevocationMaintenance(client),
    Error,
    'bank revocation recovery failed',
  );
  assertEquals(error.message.includes('private database detail'), false);
});
