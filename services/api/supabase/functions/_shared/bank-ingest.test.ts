// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  loadLinkedAccounts,
  persistPlaidSyncMetadata,
  removePlaidTransaction,
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
