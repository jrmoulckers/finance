// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  loadLinkedAccounts,
  persistMxSyncMetadata,
  persistPlaidSyncMetadata,
  removePlaidTransaction,
  resolveMxFromDate,
  shiftDate,
  upsertPlaidTransaction,
} from './bank-ingest.ts';
import type { PlaidTransaction } from './plaid.ts';

type LoadClient = Parameters<typeof loadLinkedAccounts>[0];
type UpsertClient = Parameters<typeof upsertPlaidTransaction>[0];

const transaction: PlaidTransaction = {
  transaction_id: 'provider-transaction-id',
  account_id: 'provider-account-id',
  amount: 1,
  iso_currency_code: 'USD',
  unofficial_currency_code: null,
  date: '2026-08-07',
  authorized_date: null,
  name: 'Test transaction',
  merchant_name: null,
  pending: false,
};

const linkedAccount = {
  account_id: 'account-id',
  household_id: 'household-id',
  currency_code: 'USD',
};

Deno.test('loadLinkedAccounts propagates database failures', async () => {
  const result = Promise.resolve({ data: null, error: { message: 'database unavailable' } });
  const query = {
    select: () => query,
    eq: () => query,
    is: () => result,
  };
  const client = { from: () => query } as unknown as LoadClient;

  await assertRejects(
    () => loadLinkedAccounts(client, 'connection-id'),
    Error,
    'Plaid ingestion failed while loading linked accounts',
  );
});

Deno.test('upsertPlaidTransaction propagates existing-transaction lookup failures', async () => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: () => Promise.resolve({ data: null, error: { message: 'database unavailable' } }),
  };
  const client = { from: () => query } as unknown as UpsertClient;

  await assertRejects(
    () => upsertPlaidTransaction(client, transaction, linkedAccount),
    Error,
    'Plaid ingestion failed while checking for an existing transaction',
  );
});

Deno.test(
  'upsertPlaidTransaction increments eligibility only after a successful insert',
  async () => {
    const lookup = {
      select: () => lookup,
      eq: () => lookup,
      is: () => lookup,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    const client = {
      from: () => ({
        ...lookup,
        insert: () => Promise.resolve({ error: null }),
      }),
    } as unknown as UpsertClient;

    assertEquals(await upsertPlaidTransaction(client, transaction, linkedAccount), true);
  },
);

Deno.test('upsertPlaidTransaction propagates insert failures', async () => {
  const lookup = {
    select: () => lookup,
    eq: () => lookup,
    is: () => lookup,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  const client = {
    from: () => ({
      ...lookup,
      insert: () => Promise.resolve({ error: { message: 'insert failed' } }),
    }),
  } as unknown as UpsertClient;

  await assertRejects(
    () => upsertPlaidTransaction(client, transaction, linkedAccount),
    Error,
    'Plaid ingestion failed while inserting a transaction',
  );
});

Deno.test('upsertPlaidTransaction propagates update failures', async () => {
  const lookup = {
    select: () => lookup,
    eq: () => lookup,
    is: () => lookup,
    maybeSingle: () => Promise.resolve({ data: { id: 'transaction-id' }, error: null }),
  };
  const updateQuery = {
    update: () => updateQuery,
    eq: () => Promise.resolve({ error: { message: 'update failed' } }),
  };
  const client = {
    from: () => ({
      ...lookup,
      update: updateQuery.update,
    }),
  } as unknown as UpsertClient;

  await assertRejects(
    () => upsertPlaidTransaction(client, transaction, linkedAccount),
    Error,
    'Plaid ingestion failed while updating a transaction',
  );
});

Deno.test('removePlaidTransaction propagates update failures', async () => {
  const query = {
    update: () => query,
    eq: () => query,
    is: () => query,
    select: () => Promise.resolve({ data: null, error: { message: 'update failed' } }),
  };
  const client = { from: () => query } as unknown as Parameters<typeof removePlaidTransaction>[0];

  await assertRejects(
    () => removePlaidTransaction(client, 'provider-transaction-id'),
    Error,
    'Plaid ingestion failed while removing a transaction',
  );
});

Deno.test('persistPlaidSyncMetadata propagates cursor persistence failures', async () => {
  const query = {
    update: () => query,
    eq: () => Promise.resolve({ error: { message: 'update failed' } }),
  };
  const client = { from: () => query } as unknown as Parameters<typeof persistPlaidSyncMetadata>[0];

  await assertRejects(
    () =>
      persistPlaidSyncMetadata(
        client,
        {
          id: 'connection-id',
          household_id: 'household-id',
          encrypted_access_token: 'encrypted-test-token',
          metadata: null,
        },
        'next-cursor',
      ),
    Error,
    'Plaid ingestion failed while persisting the connection sync cursor',
  );
});

// ---------------------------------------------------------------------------
// MX sync window (#4371)
// ---------------------------------------------------------------------------

Deno.test('resolveMxFromDate reuses a well-formed stored window', () => {
  assertEquals(resolveMxFromDate('2026-04-01', new Date('2026-05-10T00:00:00Z')), '2026-04-01');
});

Deno.test('resolveMxFromDate backfills 90 days when no window is stored', () => {
  // MX has no opaque cursor, so the first run must reach back far enough to
  // populate history rather than starting from "today".
  assertEquals(resolveMxFromDate(null, new Date('2026-05-10T00:00:00Z')), '2026-02-09');
});

Deno.test('resolveMxFromDate ignores a malformed stored window', () => {
  for (const bad of ['', 'yesterday', '2026-4-1', '04/01/2026']) {
    assertEquals(resolveMxFromDate(bad, new Date('2026-05-10T00:00:00Z')), '2026-02-09');
  }
});

Deno.test('shiftDate formats a shifted calendar date and crosses month boundaries', () => {
  assertEquals(shiftDate(new Date('2026-03-03T00:00:00Z'), -7), '2026-02-24');
  assertEquals(shiftDate(new Date('2026-01-01T00:00:00Z'), -1), '2025-12-31');
});

Deno.test('persistMxSyncMetadata merges the window into existing metadata', async () => {
  let updated: Record<string, unknown> | null = null;
  const query = {
    update: (values: Record<string, unknown>) => {
      updated = values;
      return { eq: () => Promise.resolve({ error: null }) };
    },
  };
  const client = { from: () => query } as unknown as Parameters<typeof persistMxSyncMetadata>[0];

  await persistMxSyncMetadata(
    client,
    {
      id: 'connection-id',
      household_id: 'household-id',
      encrypted_access_token: 'envelope',
      metadata: { item_id: 'MBR-2' },
    },
    '2026-05-03',
  );

  assertEquals(updated!.metadata, { item_id: 'MBR-2', mx_from_date: '2026-05-03' });
});

Deno.test('persistMxSyncMetadata propagates window persistence failures', async () => {
  const query = {
    update: () => ({ eq: () => Promise.resolve({ error: { message: 'boom' } }) }),
  };
  const client = { from: () => query } as unknown as Parameters<typeof persistMxSyncMetadata>[0];

  await assertRejects(
    () =>
      persistMxSyncMetadata(
        client,
        {
          id: 'connection-id',
          household_id: 'household-id',
          encrypted_access_token: 'envelope',
          metadata: null,
        },
        '2026-05-03',
      ),
    Error,
    'MX ingestion failed while persisting the connection sync window',
  );
});
