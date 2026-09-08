// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import type { ClaimedBankRevocation } from '../_shared/bank-revocation-outbox.ts';
import { createBankRevocationWorker } from './index.ts';

function job(overrides: Partial<ClaimedBankRevocation> = {}): ClaimedBankRevocation {
  return {
    id: 'job-1',
    provider: 'plaid',
    encryptedAccessToken: 'encrypted-minimum-credential',
    status: 'pending_revocation',
    connectionId: 'connection-1',
    sourceReason: 'downgrade',
    attempts: 1,
    ...overrides,
  };
}

function request(): Request {
  return new Request('http://localhost/functions/v1/bank-revocation-worker', {
    method: 'POST',
    headers: { Authorization: '******' },
  });
}

Deno.test('provider outage is recorded for retry and a later worker succeeds', async () => {
  const claimed = job();
  let run = 0;
  const completed: boolean[] = [];
  const failures: string[] = [];
  const handler = createBankRevocationWorker({
    authorize: () => Promise.resolve(true),
    newWorkerId: () => `worker-${++run}`,
    store: {
      reconcileAllowances: () => Promise.resolve(0),
      claim: () => Promise.resolve([claimed]),
      resolve: () => Promise.resolve('revoke'),
      complete: (_id, _worker, alreadyInvalid) => {
        completed.push(alreadyInvalid);
        return Promise.resolve(true);
      },
      fail: (_id, _worker, errorCode) => {
        failures.push(errorCode);
        return Promise.resolve('pending_revocation');
      },
    },
    revoke: () =>
      run === 1
        ? Promise.resolve({
            provider: 'plaid',
            outcome: 'failed',
            detail: 'PROVIDER_OUTAGE',
          })
        : Promise.resolve({ provider: 'plaid', outcome: 'revoked' }),
  });

  assertEquals((await handler(request())).status, 503);
  assertEquals(failures, ['PROVIDER_OUTAGE']);
  assertEquals((await handler(request())).status, 200);
  assertEquals(completed, [false]);
});

Deno.test('verified already-invalid is terminal success', async () => {
  const completions: boolean[] = [];
  const handler = createBankRevocationWorker({
    authorize: () => Promise.resolve(true),
    newWorkerId: () => 'worker-1',
    store: {
      reconcileAllowances: () => Promise.resolve(0),
      claim: () => Promise.resolve([job()]),
      resolve: () => Promise.resolve('revoke'),
      complete: (_id, _worker, alreadyInvalid) => {
        completions.push(alreadyInvalid);
        return Promise.resolve(true);
      },
      fail: () => Promise.resolve('pending_revocation'),
    },
    revoke: () => Promise.resolve({ provider: 'plaid', outcome: 'already_invalid' }),
  });

  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(completions, [true]);
  assertEquals((await response.json()).already_invalid, 1);
});

Deno.test('confirmed live finalization is retained and never revoked', async () => {
  let revocations = 0;
  const handler = createBankRevocationWorker({
    authorize: () => Promise.resolve(true),
    newWorkerId: () => 'worker-1',
    store: {
      reconcileAllowances: () => Promise.resolve(0),
      claim: () => Promise.resolve([job({ status: 'pending_reconciliation' })]),
      resolve: () => Promise.resolve('retained'),
      complete: () => Promise.resolve(true),
      fail: () => Promise.resolve('pending_reconciliation'),
    },
    revoke: () => {
      revocations++;
      return Promise.resolve({ provider: 'plaid', outcome: 'revoked' });
    },
  });

  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(revocations, 0);
  assertEquals((await response.json()).retained, 1);
});

Deno.test('exhausted retry is surfaced as failure without purging in the worker', async () => {
  const handler = createBankRevocationWorker({
    authorize: () => Promise.resolve(true),
    newWorkerId: () => 'worker-1',
    store: {
      reconcileAllowances: () => Promise.resolve(0),
      claim: () => Promise.resolve([job({ attempts: 12 })]),
      resolve: () => Promise.resolve('revoke'),
      complete: () => Promise.resolve(true),
      fail: () => Promise.resolve('exhausted'),
    },
    revoke: () =>
      Promise.resolve({ provider: 'plaid', outcome: 'failed', detail: 'PROVIDER_OUTAGE' }),
  });

  const response = await handler(request());
  assertEquals(response.status, 503);
  assertEquals((await response.json()).exhausted, 1);
});

Deno.test('worker rejects an unauthorized delivery before touching the store', async () => {
  let calls = 0;
  const handler = createBankRevocationWorker({
    authorize: () => Promise.resolve(false),
    newWorkerId: () => 'worker-1',
    store: {
      reconcileAllowances: () => {
        calls++;
        return Promise.resolve(0);
      },
      claim: () => Promise.resolve([]),
      resolve: () => Promise.resolve('revoke'),
      complete: () => Promise.resolve(true),
      fail: () => Promise.resolve('pending_revocation'),
    },
    revoke: () => Promise.resolve({ provider: 'plaid', outcome: 'revoked' }),
  });

  assertEquals((await handler(request())).status, 401);
  assertEquals(calls, 0);
});
