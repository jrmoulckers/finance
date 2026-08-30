// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  checkConnectionCap,
  connectionCapMessage,
  DEFAULT_CONNECTION_CAP,
  PREMIUM_CONNECTION_CAP,
  resolveConnectionCap,
} from './bank-entitlements.ts';

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

interface CapturedQuery {
  table: string;
  selectOptions: unknown;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
}

/**
 * Minimal Supabase stub. The cap query is awaited directly (no `.single()`),
 * so the builder itself must be thenable.
 */
function clientReturning(result: CountResult): {
  client: SupabaseClient;
  captured: CapturedQuery[];
} {
  const captured: CapturedQuery[] = [];

  const client = {
    from(table: string) {
      const record: CapturedQuery = { table, selectOptions: undefined, eq: [], is: [] };
      captured.push(record);
      const query = {
        select: (_columns: string, options?: unknown) => {
          record.selectOptions = options;
          return query;
        },
        eq: (column: string, value: unknown) => {
          record.eq.push([column, value]);
          return query;
        },
        is: (column: string, value: unknown) => {
          record.is.push([column, value]);
          return query;
        },
        then: (resolve: (value: CountResult) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return query;
    },
  } as unknown as SupabaseClient;

  return { client, captured };
}

Deno.test('resolveConnectionCap returns the premium allowance while tiers are unmodelled', () => {
  assertEquals(resolveConnectionCap(), DEFAULT_CONNECTION_CAP);
  assertEquals(DEFAULT_CONNECTION_CAP, PREMIUM_CONNECTION_CAP);
  assertEquals(PREMIUM_CONNECTION_CAP, 2);
});

Deno.test('checkConnectionCap allows a household below the cap', async () => {
  const { client } = clientReturning({ count: 1, error: null });
  const result = await checkConnectionCap(client, 'hh-1');
  assertEquals(result, { status: 'allowed', current: 1, cap: 2 });
});

Deno.test('checkConnectionCap allows a household with no connections', async () => {
  const { client } = clientReturning({ count: 0, error: null });
  const result = await checkConnectionCap(client, 'hh-1');
  assertEquals(result, { status: 'allowed', current: 0, cap: 2 });
});

Deno.test('checkConnectionCap treats a null count as zero', async () => {
  const { client } = clientReturning({ count: null, error: null });
  const result = await checkConnectionCap(client, 'hh-1');
  assertEquals(result, { status: 'allowed', current: 0, cap: 2 });
});

Deno.test('checkConnectionCap rejects a household exactly at the cap', async () => {
  const { client } = clientReturning({ count: 2, error: null });
  const result = await checkConnectionCap(client, 'hh-1');
  assertEquals(result, { status: 'at_cap', current: 2, cap: 2 });
});

Deno.test('checkConnectionCap rejects a household already over the cap', async () => {
  // Pre-existing households may exceed the cap; they must not be able to grow.
  const { client } = clientReturning({ count: 7, error: null });
  const result = await checkConnectionCap(client, 'hh-1');
  assertEquals(result, { status: 'at_cap', current: 7, cap: 2 });
});

Deno.test('checkConnectionCap fails closed when the count query errors', async () => {
  const { client } = clientReturning({ count: null, error: { message: 'connection refused' } });
  const result = await checkConnectionCap(client, 'hh-1');
  assertEquals(result, { status: 'error', message: 'connection refused' });
});

Deno.test('checkConnectionCap counts only live rows for the requested household', async () => {
  const { client, captured } = clientReturning({ count: 0, error: null });
  await checkConnectionCap(client, 'hh-42');

  assertEquals(captured.length, 1);
  assertEquals(captured[0].table, 'bank_connections');
  assertEquals(captured[0].selectOptions, { count: 'exact', head: true });
  assertEquals(captured[0].eq, [['household_id', 'hh-42']]);
  // Soft-deleted rows are already revoked at the provider and cost nothing, so
  // they must not consume allowance.
  assertEquals(captured[0].is, [['deleted_at', null]]);
});

Deno.test('checkConnectionCap honours an explicit cap override', async () => {
  const { client } = clientReturning({ count: 2, error: null });
  assertEquals(await checkConnectionCap(client, 'hh-1', 4), {
    status: 'allowed',
    current: 2,
    cap: 4,
  });
  assertEquals(await checkConnectionCap(client, 'hh-1', 0), {
    status: 'at_cap',
    current: 2,
    cap: 0,
  });
});

Deno.test('connectionCapMessage states the limit and the remedy without a price', () => {
  const message = connectionCapMessage(2);
  assertStringIncludes(message, '2 connected banks');
  assertStringIncludes(message, 'Disconnect a bank');
  // The client owns upgrade presentation; this string also reaches logs.
  assertEquals(message.includes('$'), false);
});

Deno.test('connectionCapMessage singularises a cap of one', () => {
  assertStringIncludes(connectionCapMessage(1), '1 connected bank.');
});
