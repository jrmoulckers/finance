// SPDX-License-Identifier: BUSL-1.1

/**
 * Handler-level orchestration tests for the bank connection Edge Function
 * (Refs #4404).
 *
 * These drive the whole reserve → exchange → finalize sequence with fake
 * collaborators, because the defects this suite guards are not visible from
 * either end alone: they live in the DECISIONS the handler makes between the
 * database and the aggregator.
 *
 * The invariant under test throughout is:
 *
 *   revoke the provider Item if and ONLY if we definitely know no connection
 *   row is in place.
 *
 * Revoking is destructive and unrecoverable. An RPC that commits and then loses
 * its response looks exactly like one that failed, so treating every error as a
 * rejection destroys the Item behind a live `bank_connections` row and leaves
 * the household with a connection that can never sync. Several tests below
 * assert a NEGATIVE — that no revoke happened — which is the whole point.
 *
 * The RPC-to-outcome mapping is unit-tested in
 * `_shared/bank-entitlements.test.ts`; the database rule itself is covered by
 * `supabase/tests/bank-connection-cap.test.sql` and
 * `supabase/tests/bank-connection-cap-remediation.test.sql`.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import type { createAdminClient } from '../_shared/auth.ts';
import { PlaidApiError } from '../_shared/plaid.ts';
import { createBankConnectionHandler } from './index.ts';
import type { BankConnectionDeps } from './index.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

const CONNECTION_ID = '44041000-0000-4000-e000-0000000000aa';
const ENCRYPTED = 'enc::access-token';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/** Queued results per RPC name; the last entry repeats once exhausted. */
type RpcScript = Record<string, RpcResult[]>;

interface FakeSupabase {
  client: AdminClient;
  calls: RpcCall[];
}

function createFakeSupabase(script: RpcScript): FakeSupabase {
  const calls: RpcCall[] = [];
  const queues: RpcScript = {};
  for (const [fn, results] of Object.entries(script)) queues[fn] = [...results];

  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      const queue = queues[fn];
      if (!queue || queue.length === 0) {
        // Unscripted RPCs (rate limiting, reservation release) resolve as
        // no-ops; the entitlement RPCs are always scripted explicitly.
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]);
    },
    from(_table: string) {
      return new FakeQuery();
    },
  };

  return { client: client as unknown as AdminClient, calls };
}

/** Membership lookup stub — the authenticated user is always a household owner. */
class FakeQuery {
  select(_columns?: string): this {
    return this;
  }
  eq(_column: string, _value: unknown): this {
    return this;
  }
  is(_column: string, _value: unknown): this {
    return this;
  }
  in(_column: string, _value: unknown): this {
    return this;
  }
  maybeSingle(): Promise<{ data: { id: string } | null; error: null }> {
    return Promise.resolve({ data: { id: 'member-1' }, error: null });
  }
}

interface RevokeCall {
  provider: string;
  encryptedAccessToken: string;
}

interface Harness {
  deps: BankConnectionDeps;
  supabase: FakeSupabase;
  revokes: RevokeCall[];
  exchanges: number;
}

interface HarnessOptions {
  script: RpcScript;
  /** `null` makes the provider exchange fail without creating an Item. */
  exchange?: { access_token: string; item_id: string } | null;
  revokeOutcome?: 'revoked' | 'already_invalid' | 'failed';
}

function harness(options: HarnessOptions): Harness {
  const supabase = createFakeSupabase(options.script);
  const revokes: RevokeCall[] = [];
  const state = { exchanges: 0 };

  const deps: BankConnectionDeps = {
    createClient: () => supabase.client,
    requireAuthFn: (() =>
      Promise.resolve({
        id: 'user-1',
        email: 'owner@example.invalid',
      })) as unknown as BankConnectionDeps['requireAuthFn'],
    exchangeToken: (_provider, _publicToken, _userId) => {
      state.exchanges++;
      const result =
        options.exchange === undefined
          ? { access_token: 'raw-access-token', item_id: 'item-1' }
          : options.exchange;
      if (result === null) return Promise.reject(new PlaidApiError(400, 'INVALID_PUBLIC_TOKEN'));
      return Promise.resolve(result);
    },
    revokeToken: ((params: RevokeCall) => {
      revokes.push(params);
      return Promise.resolve({
        outcome: options.revokeOutcome ?? 'revoked',
        detail: options.revokeOutcome === 'failed' ? 'PROVIDER_DOWN' : null,
      });
    }) as unknown as BankConnectionDeps['revokeToken'],
    encrypt: () => Promise.resolve(ENCRYPTED),
    linkAccounts: (() => Promise.resolve(0)) as unknown as BankConnectionDeps['linkAccounts'],
    newConnectionId: () => CONNECTION_ID,
  };

  return {
    deps,
    supabase,
    revokes,
    get exchanges() {
      return state.exchanges;
    },
  };
}

function withEnv(): void {
  Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  Deno.env.set('SUPABASE_ANON_KEY', 'anon');
  Deno.env.set('ALLOWED_ORIGINS', 'http://localhost');
  Deno.env.set('BANK_ENCRYPTION_KEY', 'x'.repeat(64));
}

function exchangeRequest(): Request {
  return new Request('http://localhost/functions/v1/bank-connection?action=exchange_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-token',
      Origin: 'http://localhost',
    },
    body: JSON.stringify({
      provider: 'plaid',
      household_id: 'household-1',
      public_token: 'public-sandbox-token',
      institution_id: 'ins_1',
      institution_name: 'Test Institution',
    }),
  });
}

function retentionRequest(ids: string[] = [CONNECTION_ID]): Request {
  return new Request(
    'http://localhost/functions/v1/bank-connection?action=select_downgrade_retention',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: '******',
        Origin: 'http://localhost',
      },
      body: JSON.stringify({
        household_id: 'household-1',
        target_tier: 'premium',
        retained_connection_ids: ids,
      }),
    },
  );
}

function disconnectRequest(): Request {
  return new Request(`http://localhost/functions/v1/bank-connection?id=${CONNECTION_ID}`, {
    method: 'DELETE',
    headers: {
      Authorization: '******',
      Origin: 'http://localhost',
    },
  });
}

Deno.test('downgrade retention selection is validated by the server RPC', async () => {
  withEnv();
  const h = harness({
    script: {
      select_bank_connections_for_downgrade: [
        {
          data: [{ status: 'selected', selected_count: 1, target_allowance: 2 }],
          error: null,
        },
      ],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(retentionRequest());
  assertEquals(response.status, 200);
  const call = h.supabase.calls.find(
    (candidate) => candidate.fn === 'select_bank_connections_for_downgrade',
  );
  assertEquals(call?.args.p_actor_id, 'user-1');
  assertEquals(call?.args.p_household_id, 'household-1');
  assertEquals(call?.args.p_selected_connection_ids, [CONNECTION_ID]);
});

Deno.test('invalid downgrade retention selection is rejected', async () => {
  withEnv();
  const h = harness({
    script: {
      select_bank_connections_for_downgrade: [
        {
          data: [{ status: 'invalid_selection', selected_count: 1, target_allowance: 2 }],
          error: null,
        },
      ],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(retentionRequest());
  assertEquals(response.status, 400);
});

Deno.test(
  'disconnect durably enqueues before returning and never calls provider inline',
  async () => {
    withEnv();
    const h = harness({
      script: {
        enqueue_bank_connection_revocation: [
          { data: [{ status: 'enqueued', outbox_id: 'outbox-1' }], error: null },
        ],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(disconnectRequest());
    assertEquals(response.status, 204);
    assertEquals(h.revokes.length, 0);
    const call = h.supabase.calls.find(
      (candidate) => candidate.fn === 'enqueue_bank_connection_revocation',
    );
    assertEquals(call?.args.p_connection_id, CONNECTION_ID);
    assertEquals(call?.args.p_actor_id, 'user-1');
  },
);

function ok(data: unknown): RpcResult {
  return { data, error: null };
}

function rpcError(message: string): RpcResult {
  return { data: null, error: { message } };
}

const RESERVED = ok([
  {
    status: 'reserved',
    reservation_id: 'res-1',
    cap: '2',
    used: '1',
    expires_at: '2026-09-08T00:15:00Z',
  },
]);

function finalizeRow(status: string, extra: Record<string, unknown> = {}): RpcResult {
  return ok([{ status, connection_id: null, created_at: null, ...extra }]);
}

function countCalls(supabase: FakeSupabase, fn: string): number {
  return supabase.calls.filter((call) => call.fn === fn).length;
}

function lastCall(supabase: FakeSupabase, fn: string): RpcCall | undefined {
  return supabase.calls.filter((call) => call.fn === fn).at(-1);
}

// ---------------------------------------------------------------------------
// Reservation gate — nothing billable is created before capacity is claimed
// ---------------------------------------------------------------------------

Deno.test('exchange_token refuses a zero allowance before touching the provider', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [
        ok([
          {
            status: 'premium_required',
            reservation_id: null,
            cap: '0',
            used: '0',
            expires_at: null,
          },
        ]),
      ],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
  const body = await response.json();

  assertEquals(response.status, 403);
  assertEquals(body.code, 'PREMIUM_REQUIRED');
  assertEquals(h.exchanges, 0, 'no billable Item may be created for a zero allowance');
  assertEquals(h.revokes.length, 0);
});

Deno.test(
  'exchange_token returns CONNECTION_CAP_REACHED when the allowance is exhausted',
  async () => {
    withEnv();
    const h = harness({
      script: {
        reserve_bank_connection_slot: [
          ok([{ status: 'at_cap', reservation_id: null, cap: '2', used: '2', expires_at: null }]),
        ],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
    const body = await response.json();

    assertEquals(response.status, 409);
    assertEquals(body.code, 'CONNECTION_CAP_REACHED');
    assertEquals(h.exchanges, 0);
  },
);

// The projection is the sole authority; an unreadable one must not fall back to
// any client-supplied or cached tier.
Deno.test('exchange_token fails closed when the entitlement cannot be resolved', async () => {
  withEnv();
  const h = harness({
    script: { reserve_bank_connection_slot: [rpcError('projection unavailable')] },
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
  const body = await response.json();

  assertEquals(response.status, 503);
  assertEquals(body.code, 'ENTITLEMENT_UNAVAILABLE');
  assertEquals(h.exchanges, 0);
});

// ---------------------------------------------------------------------------
// Provider failure — the reservation must not leak
// ---------------------------------------------------------------------------

Deno.test('a failed provider exchange releases the reservation immediately', async () => {
  withEnv();
  const h = harness({
    script: { reserve_bank_connection_slot: [RESERVED] },
    exchange: null,
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());

  assertEquals(response.status, 502);
  assertEquals(countCalls(h.supabase, 'release_bank_connection_reservation'), 1);
  assertEquals(
    lastCall(h.supabase, 'release_bank_connection_reservation')?.args.p_reservation_id,
    'res-1',
  );
  // No Item exists, so nothing may be revoked and nothing handed off.
  assertEquals(h.revokes.length, 0);
  assertEquals(countCalls(h.supabase, 'record_orphaned_bank_item'), 0);
  assertEquals(countCalls(h.supabase, 'finalize_bank_connection_reservation'), 0);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

Deno.test('a finalized connection is returned without any credential material', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [RESERVED],
      finalize_bank_connection_reservation: [
        finalizeRow('finalized', {
          connection_id: CONNECTION_ID,
          created_at: '2026-09-08T00:01:00Z',
        }),
      ],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
  const raw = await response.text();

  assertEquals(response.status, 201);
  assertEquals(JSON.parse(raw).id, CONNECTION_ID);
  assertEquals(h.revokes.length, 0);
  // The caller-generated id is what makes the RPC idempotent.
  assertEquals(
    lastCall(h.supabase, 'finalize_bank_connection_reservation')?.args.p_connection_id,
    CONNECTION_ID,
  );
  assertEquals(raw.includes(ENCRYPTED), false, 'the stored credential must never be returned');
  assertEquals(
    raw.includes('raw-access-token'),
    false,
    'the provider token must never be returned',
  );
  assertEquals(raw.includes('item-1'), false, 'provider Item identifiers must not be returned');
});

// ---------------------------------------------------------------------------
// DEFINITE rejection — revoke is correct and required
// ---------------------------------------------------------------------------

Deno.test(
  'a definite at-cap finalization revokes the Item and returns the stable error',
  async () => {
    withEnv();
    const h = harness({
      script: {
        reserve_bank_connection_slot: [RESERVED],
        finalize_bank_connection_reservation: [finalizeRow('at_cap')],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
    const body = await response.json();

    assertEquals(response.status, 409);
    assertEquals(body.code, 'CONNECTION_CAP_REACHED');
    assertEquals(h.revokes.length, 1, 'a definitely-orphaned Item must be revoked immediately');
    assertEquals(h.revokes[0].encryptedAccessToken, ENCRYPTED);
    // Revocation succeeded, so there is nothing left to hand off.
    assertEquals(countCalls(h.supabase, 'record_orphaned_bank_item'), 0);
  },
);

Deno.test(
  'a definite premium_required finalization revokes and returns PREMIUM_REQUIRED',
  async () => {
    withEnv();
    const h = harness({
      script: {
        reserve_bank_connection_slot: [RESERVED],
        finalize_bank_connection_reservation: [finalizeRow('premium_required')],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
    const body = await response.json();

    assertEquals(response.status, 403);
    assertEquals(body.code, 'PREMIUM_REQUIRED');
    assertEquals(h.revokes.length, 1);
  },
);

Deno.test('a failed revocation writes a durable pending_revocation handoff', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [RESERVED],
      finalize_bank_connection_reservation: [finalizeRow('at_cap')],
      record_orphaned_bank_item: [ok('handoff-1')],
    },
    revokeOutcome: 'failed',
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());

  assertEquals(response.status, 409);
  assertEquals(h.revokes.length, 1);
  const handoff = lastCall(h.supabase, 'record_orphaned_bank_item');
  assert(handoff, 'a failed revocation must be durably handed off');
  assertEquals(handoff.args.p_status, 'pending_revocation');
  // The credential is the only remaining way to revoke, so it must be retained.
  assertEquals(handoff.args.p_encrypted_access_token, ENCRYPTED);
  assertEquals(handoff.args.p_connection_id, CONNECTION_ID);
});

// ---------------------------------------------------------------------------
// AMBIGUOUS finalization — the core of the remediation
// ---------------------------------------------------------------------------

// The regression: the RPC committed, the response was lost, and the old code
// revoked the Item that was already backing the persisted row.
Deno.test('a commit whose response was lost is confirmed, not revoked', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [RESERVED],
      finalize_bank_connection_reservation: [rpcError('canceling statement due to timeout')],
      bank_connection_finalization_state: [
        ok([{ state: 'finalized', created_at: '2026-09-08T00:01:00Z' }]),
      ],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.id, CONNECTION_ID);
  assertEquals(h.revokes.length, 0, 'an Item backing a committed row must NEVER be revoked');
  assertEquals(countCalls(h.supabase, 'record_orphaned_bank_item'), 0);
  assertEquals(countCalls(h.supabase, 'bank_connection_finalization_state'), 1);
});

// Proven-absent is safe to replay precisely because the call is keyed on the
// caller-generated connection id: a retry cannot create a second billable row.
Deno.test(
  'a proven-absent finalization is retried idempotently and can still succeed',
  async () => {
    withEnv();
    const h = harness({
      script: {
        reserve_bank_connection_slot: [RESERVED],
        finalize_bank_connection_reservation: [
          rpcError('connection reset'),
          finalizeRow('finalized', {
            connection_id: CONNECTION_ID,
            created_at: '2026-09-08T00:02:00Z',
          }),
        ],
        bank_connection_finalization_state: [ok([{ state: 'absent', created_at: null }])],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
    const body = await response.json();

    assertEquals(response.status, 201);
    assertEquals(body.id, CONNECTION_ID);
    assertEquals(countCalls(h.supabase, 'finalize_bank_connection_reservation'), 2);
    assertEquals(h.revokes.length, 0);
    // Every attempt reuses the SAME connection id, which is what makes the replay
    // safe rather than a second billable insert.
    for (const call of h.supabase.calls) {
      if (call.fn === 'finalize_bank_connection_reservation') {
        assertEquals(call.args.p_connection_id, CONNECTION_ID);
      }
    }
  },
);

Deno.test('an ambiguous outcome that cannot be resolved never authorises a revoke', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [RESERVED],
      finalize_bank_connection_reservation: [rpcError('connection reset')],
      bank_connection_finalization_state: [ok([{ state: 'absent', created_at: null }])],
      record_orphaned_bank_item: [ok('handoff-4')],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
  const body = await response.json();

  assertEquals(response.status, 503);
  assertEquals(body.code, 'ENTITLEMENT_UNAVAILABLE');
  // Bounded: the idempotent call is replayed once and then we stop.
  assertEquals(countCalls(h.supabase, 'finalize_bank_connection_reservation'), 2);
  // The confirming read is unlocked, so `absent` only means "not visible to
  // that snapshot" — a finalize still in flight can commit moments later.
  // Revoking on it would destroy the Item behind a row that is about to exist.
  assertEquals(h.revokes.length, 0, 'an unlocked absence must NEVER authorise a revoke');
  const handoff = lastCall(h.supabase, 'record_orphaned_bank_item');
  assert(handoff, 'the unresolved outcome must be handed off for reconciliation');
  assertEquals(handoff.args.p_status, 'pending_reconciliation');
  assertEquals(handoff.args.p_connection_id, CONNECTION_ID);
});

// The exact race the resolver must survive: every observation says "absent"
// while the first finalize is still in flight, and it commits afterwards.
Deno.test('a finalize still in flight during confirmation is recovered, not revoked', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [RESERVED],
      // Attempt #1 loses its response; attempt #2 blocks on the advisory lock
      // held by the still-in-flight attempt #1 and also fails.
      finalize_bank_connection_reservation: [
        rpcError('canceling statement due to statement timeout'),
        rpcError('canceling statement due to statement timeout'),
      ],
      bank_connection_finalization_state: [
        // Read while attempt #1 is uncommitted: nothing visible yet.
        ok([{ state: 'absent', created_at: null }]),
        // Attempt #1 has now committed; the row is visible.
        ok([{ state: 'finalized', created_at: '2026-09-08T00:03:00Z' }]),
      ],
    },
  });

  const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.id, CONNECTION_ID);
  assertEquals(h.revokes.length, 0, 'the Item backing the committed row must survive');
  assertEquals(countCalls(h.supabase, 'record_orphaned_bank_item'), 0);
});

// Nothing in the ambiguous path can license a revoke. When the confirming read
// fails too, the outcome stays unknown and revocation MUST be withheld.
Deno.test(
  'an unconfirmable finalization withholds revocation and hands off for reconciliation',
  async () => {
    withEnv();
    const h = harness({
      script: {
        reserve_bank_connection_slot: [RESERVED],
        finalize_bank_connection_reservation: [rpcError('statement timeout')],
        bank_connection_finalization_state: [rpcError('statement timeout')],
        record_orphaned_bank_item: [ok('handoff-2')],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
    const body = await response.json();

    assertEquals(response.status, 503);
    assertEquals(body.code, 'ENTITLEMENT_UNAVAILABLE');
    assertEquals(h.revokes.length, 0, 'an unknown outcome must NEVER trigger a revoke');

    const handoff = lastCall(h.supabase, 'record_orphaned_bank_item');
    assert(handoff, 'an unknown outcome must be durably handed off');
    assertEquals(handoff.args.p_status, 'pending_reconciliation');
    // Stage 7 needs the id to resolve the outcome before it revokes anything.
    assertEquals(handoff.args.p_connection_id, CONNECTION_ID);
    assertEquals(handoff.args.p_encrypted_access_token, ENCRYPTED);
    assertEquals(handoff.args.p_last_error_code, 'FINALIZE_OUTCOME_UNKNOWN');
  },
);

// A row that was created and then disconnected is a DEFINITE answer, not an
// ambiguous one — the Item is orphaned and must go.
Deno.test(
  'a replay against a disconnected connection is treated as a definite rejection',
  async () => {
    withEnv();
    const h = harness({
      script: {
        reserve_bank_connection_slot: [RESERVED],
        finalize_bank_connection_reservation: [finalizeRow('already_disconnected')],
      },
    });

    const response = await createBankConnectionHandler(h.deps)(exchangeRequest());
    const body = await response.json();

    assertEquals(response.status, 503);
    assertEquals(body.code, 'ENTITLEMENT_UNAVAILABLE');
    assertEquals(h.revokes.length, 1);
    assertEquals(countCalls(h.supabase, 'bank_connection_finalization_state'), 0);
  },
);

// ---------------------------------------------------------------------------
// Error bodies must stay free of financial and provider data
// ---------------------------------------------------------------------------

Deno.test('entitlement errors carry a stable code and no provider or financial data', async () => {
  withEnv();
  const h = harness({
    script: {
      reserve_bank_connection_slot: [RESERVED],
      finalize_bank_connection_reservation: [rpcError('statement timeout')],
      bank_connection_finalization_state: [rpcError('statement timeout')],
      record_orphaned_bank_item: [ok('handoff-3')],
    },
  });

  const raw = await (await createBankConnectionHandler(h.deps)(exchangeRequest())).text();

  assertEquals(JSON.parse(raw).code, 'ENTITLEMENT_UNAVAILABLE');
  assertEquals(raw.includes(ENCRYPTED), false);
  assertEquals(raw.includes('raw-access-token'), false);
  assertEquals(raw.includes('item-1'), false);
  assertEquals(raw.includes('statement timeout'), false, 'internal RPC detail must not leak');
  assertEquals(raw.includes('$'), false, 'no price may appear in an entitlement error');
});
