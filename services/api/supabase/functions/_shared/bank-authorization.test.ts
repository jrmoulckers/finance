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

interface InsertRecord {
  table: string;
  value: Record<string, string>;
}

function clientWithResults(
  results: Record<string, QueryResult | QueryResult[]>,
  upsertError: Error | null = null,
  insertError: (Error & { code?: string }) | null = null,
): { client: SupabaseClient; upserts: UpsertRecord[]; inserts: InsertRecord[] } {
  const upserts: UpsertRecord[] = [];
  const inserts: InsertRecord[] = [];
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
        insert: (value: Record<string, string>) => {
          inserts.push({ table, value });
          return Promise.resolve({ error: insertError });
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, upserts, inserts };
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
    const { client, upserts, inserts } = clientWithResults({
      households: [
        { data: null, error: null },
        { data: { id: 'household-1', created_by: 'user-1' }, error: null },
      ],
      users: [
        { data: null, error: null },
        { data: { id: 'user-1' }, error: null },
      ],
      household_members: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    assertEquals(
      await ensureCanManageHousehold(client, 'household-1', 'user-1', {
        provisionIfMissing: true,
        userEmail: 'person@example.com',
      }),
      true,
    );
    assertEquals(upserts, [
      {
        table: 'users',
        value: {
          id: 'user-1',
          email: 'person@example.com',
          display_name: 'person',
        },
        options: { onConflict: 'id', ignoreDuplicates: true },
      },
      {
        table: 'households',
        value: { id: 'household-1', name: 'My Household', created_by: 'user-1' },
        options: { onConflict: 'id', ignoreDuplicates: true },
      },
    ]);
    assertEquals(inserts, [
      {
        table: 'household_members',
        value: { household_id: 'household-1', user_id: 'user-1', role: 'owner' },
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
    users: { data: { id: 'user-1' }, error: null },
  });

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-1', {
      provisionIfMissing: true,
      userEmail: 'person@example.com',
    }),
    false,
  );
  assertEquals(upserts.length, 1);
});

Deno.test('link-token creation repairs a creator missing their server membership', async () => {
  const { client, inserts } = clientWithResults({
    household_members: [
      { data: null, error: null },
      { data: null, error: null },
    ],
    households: { data: { id: 'household-1', created_by: 'user-1' }, error: null },
  });

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-1', {
      provisionIfMissing: true,
      userEmail: 'person@example.com',
    }),
    true,
  );
  assertEquals(inserts, [
    {
      table: 'household_members',
      value: { household_id: 'household-1', user_id: 'user-1', role: 'owner' },
    },
  ]);
});

Deno.test('bank management accepts a concurrent active membership insert', async () => {
  const duplicateError = Object.assign(new Error('duplicate membership'), { code: '23505' });
  const { client } = clientWithResults(
    {
      household_members: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { id: 'member-1', role: 'owner' }, error: null },
      ],
      households: { data: { id: 'household-1', created_by: 'user-1' }, error: null },
    },
    null,
    duplicateError,
  );

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-1', {
      provisionIfMissing: true,
      userEmail: 'person@example.com',
    }),
    true,
  );
});

Deno.test('bank management promotes the verified household creator to owner', async () => {
  const { client, upserts, inserts } = clientWithResults({
    household_members: [
      { data: null, error: null },
      { data: { id: 'member-1', role: 'member' }, error: null },
    ],
    households: { data: { id: 'household-1', created_by: 'user-1' }, error: null },
  });

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-1', {
      provisionIfMissing: true,
      userEmail: 'person@example.com',
    }),
    true,
  );
  assertEquals(upserts, [
    {
      table: 'household_members',
      value: {
        id: 'member-1',
        household_id: 'household-1',
        user_id: 'user-1',
        role: 'owner',
      },
      options: { onConflict: 'id', ignoreDuplicates: false },
    },
  ]);
  assertEquals(inserts, []);
});

Deno.test('bank management preserves an existing application user while provisioning', async () => {
  const { client, upserts, inserts } = clientWithResults({
    household_members: [
      { data: null, error: null },
      { data: null, error: null },
    ],
    households: [
      { data: null, error: null },
      { data: { id: 'household-1', created_by: 'user-1' }, error: null },
    ],
    users: { data: { id: 'user-1' }, error: null },
  });

  assertEquals(
    await ensureCanManageHousehold(client, 'household-1', 'user-1', {
      provisionIfMissing: true,
      userEmail: 'person@example.com',
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
  assertEquals(inserts.length, 1);
});

Deno.test(
  'bank management requires verified email to repair a missing application user',
  async () => {
    const { client, upserts } = clientWithResults({
      household_members: { data: null, error: null },
      households: { data: null, error: null },
      users: { data: null, error: null },
    });

    await assertRejects(
      () =>
        ensureCanManageHousehold(client, 'household-1', 'user-1', {
          provisionIfMissing: true,
        }),
      Error,
      'Authenticated user email is required',
    );
    assertEquals(upserts, []);
  },
);

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
