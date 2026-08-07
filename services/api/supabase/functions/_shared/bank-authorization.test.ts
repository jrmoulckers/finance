// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { ensureCanManageHousehold } from './bank-authorization.ts';

interface QueryResult {
  data: Record<string, string> | null;
  error: Error | null;
}

interface UpsertRecord {
  table: string;
  value: Record<string, string>;
  options: { onConflict: string; ignoreDuplicates: boolean };
}

function clientWithResults(
  results: Record<string, QueryResult | QueryResult[]>,
  upsertError: Error | null = null,
): { client: SupabaseClient; upserts: UpsertRecord[] } {
  const upserts: UpsertRecord[] = [];
  const client = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        in: () => query,
        maybeSingle: () => {
          const result = results[table];
          return Promise.resolve(Array.isArray(result) ? result.shift() : result);
        },
        upsert: (
          value: Record<string, string>,
          options: { onConflict: string; ignoreDuplicates: boolean },
        ) => {
          upserts.push({ table, value, options });
          return Promise.resolve({ error: upsertError });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, upserts };
}

Deno.test('bank management allows an owner/admin membership without writes', async () => {
  const { client, upserts } = clientWithResults({
    household_members: { data: { id: 'member-1' }, error: null },
  });

  assertEquals(await ensureCanManageHousehold(client, 'household-1', 'user-1'), true);
  assertEquals(upserts, []);
});

Deno.test(
  'bank management allows the household creator without synthesizing membership',
  async () => {
    const { client, upserts } = clientWithResults({
      household_members: { data: null, error: null },
      households: { data: { id: 'household-1', created_by: 'user-1' }, error: null },
    });

    assertEquals(await ensureCanManageHousehold(client, 'household-1', 'user-1'), true);
    assertEquals(upserts, []);
  },
);

Deno.test(
  'link-token creation provisions the authenticated user missing server household',
  async () => {
    const { client, upserts } = clientWithResults({
      household_members: { data: null, error: null },
      households: [
        { data: null, error: null },
        { data: { id: 'household-1', created_by: 'user-1' }, error: null },
      ],
    });

    assertEquals(
      await ensureCanManageHousehold(client, 'household-1', 'user-1', {
        provisionIfMissing: true,
      }),
      true,
    );
    assertEquals(upserts, [
      {
        table: 'households',
        value: { id: 'household-1', name: 'My Household', created_by: 'user-1' },
        options: { onConflict: 'id', ignoreDuplicates: true },
      },
    ]);
  },
);

Deno.test('bank management does not provision a missing household by default', async () => {
  const { client, upserts } = clientWithResults({
    household_members: { data: null, error: null },
    households: { data: null, error: null },
  });

  assertEquals(await ensureCanManageHousehold(client, 'household-1', 'user-1'), false);
  assertEquals(upserts, []);
});

Deno.test('bank management denies and does not modify another user household', async () => {
  const { client, upserts } = clientWithResults({
    household_members: { data: null, error: null },
    households: { data: { id: 'household-1', created_by: 'user-1' }, error: null },
  });

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-2', {
      provisionIfMissing: true,
    }),
    false,
  );
  assertEquals(upserts, []);
});

Deno.test('bank management denies when another user wins the provisioning race', async () => {
  const { client, upserts } = clientWithResults({
    household_members: { data: null, error: null },
    households: [
      { data: null, error: null },
      { data: { id: 'household-1', created_by: 'user-2' }, error: null },
    ],
  });

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-1', {
      provisionIfMissing: true,
    }),
    false,
  );
  assertEquals(upserts.length, 1);
});

Deno.test(
  'bank management propagates database errors instead of mislabeling them 403',
  async () => {
    const { client } = clientWithResults({
      household_members: { data: null, error: new Error('database unavailable') },
    });

    await assertRejects(
      () => ensureCanManageHousehold(client, 'household-1', 'user-1'),
      Error,
      'database unavailable',
    );
  },
);
