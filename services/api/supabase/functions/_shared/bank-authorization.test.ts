// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { canManageHousehold } from './bank-authorization.ts';

interface QueryResult {
  data: { id: string } | null;
  error: Error | null;
}

function clientWithResults(results: Record<string, QueryResult>): SupabaseClient {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        in: () => query,
        maybeSingle: () => Promise.resolve(results[table]),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

Deno.test('bank management allows an owner/admin membership', async () => {
  const client = clientWithResults({
    household_members: { data: { id: 'member-1' }, error: null },
  });

  assertEquals(await canManageHousehold(client, 'household-1', 'user-1'), true);
});

Deno.test(
  'bank management allows the household creator while membership upload is pending',
  async () => {
    const client = clientWithResults({
      household_members: { data: null, error: null },
      households: { data: { id: 'household-1' }, error: null },
    });

    assertEquals(await canManageHousehold(client, 'household-1', 'user-1'), true);
  },
);

Deno.test('bank management denies a user with neither membership nor ownership', async () => {
  const client = clientWithResults({
    household_members: { data: null, error: null },
    households: { data: null, error: null },
  });

  assertEquals(await canManageHousehold(client, 'household-1', 'user-2'), false);
});

Deno.test(
  'bank management propagates database errors instead of mislabeling them 403',
  async () => {
    const client = clientWithResults({
      household_members: { data: null, error: new Error('database unavailable') },
    });

    await assertRejects(
      () => canManageHousehold(client, 'household-1', 'user-1'),
      Error,
      'database unavailable',
    );
  },
);
