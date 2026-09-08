// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { queueProviderPermissionRevocation } from './bank-revocation-outbox.ts';

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
