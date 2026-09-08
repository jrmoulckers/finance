// SPDX-License-Identifier: BUSL-1.1

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createAdminClient } from '../_shared/auth.ts';
import { createAccountDeleteHandler } from './index.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

Deno.test('account-delete returns 405 for unsupported requests', async () => {
  withEnv();
  const handler = createAccountDeleteHandler({
    createClient: () => createFakeSupabase().client as unknown as AdminClient,
  });

  const response = await handler(
    new Request('http://localhost/functions/v1/account-delete', { method: 'GET' }),
  );

  assertEquals(response.status, 405);
  assertEquals(response.headers.get('Allow'), 'DELETE, POST');
});

Deno.test('account-delete requires authentication before deleting anything', async () => {
  withEnv();
  const fake = createFakeSupabase();
  const handler = createAccountDeleteHandler({
    createClient: () => fake.client as unknown as AdminClient,
  });

  const response = await handler(
    new Request('http://localhost/functions/v1/account-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(fake.operations.length, 0);
  assertEquals(fake.deletedAuthUser, null);
});

Deno.test('account-delete cascades sole-household data before deleting auth user', async () => {
  withEnv();
  const fake = createFakeSupabase();
  const handler = createAccountDeleteHandler({
    createClient: () => fake.client as unknown as AdminClient,
  });

  const response = await handler(
    new Request('http://localhost/functions/v1/account-delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    }),
  );

  assertEquals(response.status, 204);
  assert(fake.operations.some((op) => op === 'rpc:destroy_user_encryption_keys'));
  assert(fake.operations.some((op) => op === 'rpc:destroy_household_encryption_keys'));
  assert(fake.operations.indexOf('delete:transactions') < fake.operations.indexOf('delete:users'));
  assert(
    fake.operations.indexOf('delete:users') < fake.operations.indexOf('auth.deleteUser:user-1'),
  );
  assertEquals(fake.deletedAuthUser, 'user-1');
  assert(response.headers.get('Set-Cookie')?.includes('finance_refresh='));
});

Deno.test('account-delete rejects when confirmation token is missing', async () => {
  withEnv();
  const fake = createFakeSupabase();
  const handler = createAccountDeleteHandler({
    createClient: () => fake.client as unknown as AdminClient,
  });

  const response = await handler(
    new Request('http://localhost/functions/v1/account-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({}),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(fake.operations.length, 0);
  assertEquals(fake.deletedAuthUser, null);
});

Deno.test(
  'account-delete does NOT silently transfer shared-household ownership (#1962)',
  async () => {
    withEnv();
    const fake = createFakeSupabase({ sharedHousehold: true });
    const handler = createAccountDeleteHandler({
      createClient: () => fake.client as unknown as AdminClient,
    });

    const response = await handler(
      new Request('http://localhost/functions/v1/account-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer access-token',
        },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      }),
    );

    assertEquals(response.status, 204);
    // The household entity itself must NOT be deleted (others still use it).
    assert(!fake.operations.includes('delete:households'));
    // The user's contributed rows in the shared household ARE deleted via
    // owner_id (USER_OWNED_TABLES loop).
    assert(fake.operations.includes('delete:transactions'));
    assert(fake.operations.includes('delete:budgets'));
    assert(fake.operations.includes('delete:goals'));
    // created_by is cleared, NOT reassigned to another member.
    const householdUpdates = fake.updates.filter((u) => u.table === 'households');
    assert(householdUpdates.length > 0, 'expected an update to households');
    for (const update of householdUpdates) {
      assertEquals(
        update.values.created_by,
        null,
        'created_by must be null, never another user_id',
      );
    }
    // Auth user is still deleted last.
    assertEquals(fake.deletedAuthUser, 'user-1');
  },
);

function withEnv(): void {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  Deno.env.set('SUPABASE_ANON_KEY', 'anon');
}

// ---------------------------------------------------------------------------
// Orphaned provider Items (#4404)
//
// `bank_connection_orphaned_items` holds an encrypted provider credential for a
// billable Item that never became a `bank_connections` row. Its owner/household
// FKs are ON DELETE SET NULL, so it SURVIVES account deletion — which means it
// is invisible to the `bank_connections` sweep and, without this step, would
// leave the processor holding access to a deleted user's account indefinitely
// (GDPR Art. 17 processor propagation).
// ---------------------------------------------------------------------------

function orphanRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'handoff-1',
    provider: 'plaid',
    encrypted_access_token: 'enc::orphan',
    status: 'pending_revocation',
    connection_id: null,
    ...overrides,
  };
}

function deleteRequest(): Request {
  return new Request('http://localhost/functions/v1/account-delete', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-token',
    },
    body: JSON.stringify({ confirmation: 'DELETE' }),
  });
}

Deno.test(
  'account-delete revokes orphaned provider Items and purges their credential',
  async () => {
    withEnv();
    const fake = createFakeSupabase({
      orphanedItems: [
        orphanRow(),
        orphanRow({
          id: 'handoff-2',
          provider: 'mx',
          status: 'pending_reconciliation',
          connection_id: 'conn-2',
        }),
      ],
    });
    const revoked: Array<{ provider: string; encryptedAccessToken: string | null | undefined }> =
      [];

    const response = await createAccountDeleteHandler({
      createClient: () => fake.client as unknown as AdminClient,
      revokeToken: ((params: { provider: string; encryptedAccessToken: string | null }) => {
        revoked.push(params);
        return Promise.resolve({ provider: params.provider, outcome: 'revoked' as const });
      }) as never,
    })(deleteRequest());

    assertEquals(response.status, 204);
    assertEquals(revoked.length, 2);
    assertEquals(revoked[0].encryptedAccessToken, 'enc::orphan');

    // Both are dispositioned terminally, which destroys the stored credential in
    // the same database statement.
    const completions = fake.rpcCalls.filter((c) => c.name === 'complete_orphaned_bank_item');
    assertEquals(completions.length, 2);
    for (const completion of completions) {
      assertEquals(completion.args.p_status, 'revoked');
    }
    assertEquals(
      fake.rpcCalls.filter((c) => c.name === 'record_orphaned_bank_item_attempt').length,
      0,
    );

    // A reconciliation row is revoked here even though it never is in the request
    // path: the account and any row it might have committed are both being erased.
    assertEquals(revoked[1].provider, 'mx');
  },
);

// The stored credential is the ONLY remaining way to revoke, so a failed
// attempt must not destroy it. Retention stays bounded by `retain_until`.
Deno.test(
  'account-delete retains the credential when revocation could not be confirmed',
  async () => {
    withEnv();
    const fake = createFakeSupabase({ orphanedItems: [orphanRow()] });

    const response = await createAccountDeleteHandler({
      createClient: () => fake.client as unknown as AdminClient,
      revokeToken: ((params: { provider: string }) =>
        Promise.resolve({
          provider: params.provider,
          outcome: 'failed' as const,
          detail: 'PROVIDER_DOWN',
        })) as never,
    })(deleteRequest());

    assertEquals(response.status, 204);
    assertEquals(fake.rpcCalls.filter((c) => c.name === 'complete_orphaned_bank_item').length, 0);
    const attempts = fake.rpcCalls.filter((c) => c.name === 'record_orphaned_bank_item_attempt');
    assertEquals(attempts.length, 1);
    assertEquals(attempts[0].args.p_last_error_code, 'PROVIDER_DOWN');
  },
);

// The handoff rows must be claimed while the account can still be identified —
// once `users` is deleted the ON DELETE SET NULL FKs erase the linkage.
Deno.test('account-delete claims orphaned Items before deleting any rows', async () => {
  withEnv();
  const fake = createFakeSupabase({ orphanedItems: [orphanRow()] });

  await createAccountDeleteHandler({
    createClient: () => fake.client as unknown as AdminClient,
    revokeToken: ((params: { provider: string }) =>
      Promise.resolve({ provider: params.provider, outcome: 'revoked' as const })) as never,
  })(deleteRequest());

  const claimIndex = fake.operations.indexOf('rpc:claim_orphaned_bank_items_for_erasure');
  assert(claimIndex >= 0, 'account deletion must claim orphaned provider Items');
  assert(claimIndex < fake.operations.indexOf('delete:users'));
  assert(claimIndex < fake.operations.indexOf('auth.deleteUser:user-1'));

  const claim = fake.rpcCalls.find((c) => c.name === 'claim_orphaned_bank_items_for_erasure');
  assertEquals(claim?.args.p_owner_id, 'user-1');
  assertEquals(claim?.args.p_household_ids, ['household-1']);
});

// Erasure of an auxiliary table must never be able to strand a user in a
// half-deleted account.
Deno.test('account-delete completes even if the orphan handoff table is unavailable', async () => {
  withEnv();
  const fake = createFakeSupabase({ orphanedItems: [orphanRow()] });

  const response = await createAccountDeleteHandler({
    createClient: () => fake.client as unknown as AdminClient,
    revokeToken: (() => {
      throw new Error('revocation exploded');
    }) as never,
  })(deleteRequest());

  assertEquals(response.status, 204);
  assertEquals(fake.deletedAuthUser, 'user-1');
});

Deno.test('account-delete never returns orphaned credential or provider data', async () => {
  withEnv();
  const fake = createFakeSupabase({
    orphanedItems: [orphanRow({ connection_id: 'conn-1' })],
  });

  const response = await createAccountDeleteHandler({
    createClient: () => fake.client as unknown as AdminClient,
    revokeToken: ((params: { provider: string }) =>
      Promise.resolve({ provider: params.provider, outcome: 'revoked' as const })) as never,
  })(deleteRequest());

  const raw = await response.text();
  assertEquals(raw.includes('enc::orphan'), false);
  assertEquals(raw.includes('handoff-1'), false);
  assertEquals(raw.includes('conn-1'), false);
});

interface FakeState {
  operations: string[];
  updates: Array<{ table: string; values: Record<string, unknown> }>;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  deletedAuthUser: string | null;
  sharedHousehold: boolean;
  orphanedItems: unknown[];
}

interface FakeClient {
  auth: {
    getUser: (
      token: string,
    ) => Promise<{ data: { user: { id: string; email: string } }; error: null }>;
    admin: { deleteUser: (userId: string) => Promise<{ error: null }> };
  };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown[]; error: null }>;
  from: (table: string) => FakeQuery;
}

interface FakeSupabaseOptions {
  sharedHousehold?: boolean;
  /** Rows returned by `claim_orphaned_bank_items_for_erasure`. */
  orphanedItems?: unknown[];
}

function createFakeSupabase(opts: FakeSupabaseOptions = {}): FakeState & { client: FakeClient } {
  const state: FakeState = {
    operations: [],
    updates: [],
    rpcCalls: [],
    deletedAuthUser: null,
    sharedHousehold: opts.sharedHousehold === true,
    orphanedItems: opts.orphanedItems ?? [],
  };
  const client = {
    auth: {
      getUser: (_token: string) =>
        Promise.resolve({
          data: { user: { id: 'user-1', email: 'alex@example.com' } },
          error: null,
        }),
      admin: {
        deleteUser: (userId: string) => {
          state.deletedAuthUser = userId;
          state.operations.push(`auth.deleteUser:${userId}`);
          return Promise.resolve({ error: null });
        },
      },
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      state.operations.push(`rpc:${name}`);
      state.rpcCalls.push({ name, args });
      if (name === 'claim_orphaned_bank_items_for_erasure') {
        return Promise.resolve({ data: state.orphanedItems, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
    from: (table: string) => new FakeQuery(table, state),
  };
  return {
    operations: state.operations,
    updates: state.updates,
    rpcCalls: state.rpcCalls,
    get deletedAuthUser() {
      return state.deletedAuthUser;
    },
    get sharedHousehold() {
      return state.sharedHousehold;
    },
    get orphanedItems() {
      return state.orphanedItems;
    },
    client,
  };
}

class FakeQuery {
  private op: 'select' | 'delete' | 'update' | null = null;
  private filters = new Map<string, unknown>();
  private updateValues: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: FakeState,
  ) {}

  select(_columns?: string): this {
    this.op = 'select';
    return this;
  }

  delete(): this {
    this.op = 'delete';
    this.state.operations.push(`delete:${this.table}`);
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.op = 'update';
    this.updateValues = values;
    this.state.operations.push(`update:${this.table}`);
    this.state.updates.push({ table: this.table, values });
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.set(column, value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.set(`neq:${column}`, value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.set(`is:${column}`, value);
    return this;
  }

  in(column: string, value: unknown): this {
    this.filters.set(`in:${column}`, value);
    return this;
  }

  or(_filter: string): this {
    return this;
  }

  then(resolve: (value: { data: unknown[]; error: null }) => void): void {
    resolve({ data: this.resolveData(), error: null });
  }

  private resolveData(): unknown[] {
    if (this.op !== 'select') return [];
    if (this.table === 'household_members' && this.filters.get('user_id') === 'user-1') {
      return [{ household_id: 'household-1' }];
    }
    if (this.table === 'household_members' && this.filters.get('household_id') === 'household-1') {
      // When shared, return another member; when sole, return empty.
      return this.state.sharedHousehold ? [{ user_id: 'user-2' }] : [];
    }
    if (this.table === 'households') {
      return [{ id: 'household-1', created_by: 'user-1' }];
    }
    return [];
  }
}
