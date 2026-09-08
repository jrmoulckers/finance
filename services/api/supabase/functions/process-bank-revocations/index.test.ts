// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createBankRevocationWorker } from './index.ts';

const ITEM = {
  id: 'outbox-1',
  provider: 'plaid',
  encryptedAccessToken: 'enc::credential',
  claimToken: 'claim-1',
  attempts: 1,
};

function request(): Request {
  return new Request('http://localhost/functions/v1/process-bank-revocations', {
    method: 'POST',
    headers: { Authorization: '******' },
  });
}

Deno.test('worker confirms provider revocation and purges through the claim token', async () => {
  const completions: string[] = [];
  const response = await createBankRevocationWorker({
    authenticate: () => Promise.resolve(true),
    claim: () => Promise.resolve([ITEM]),
    revoke: () => Promise.resolve({ provider: 'plaid', outcome: 'revoked' }),
    complete: (item, outcome) => {
      completions.push(`${item.claimToken}:${outcome}`);
      return Promise.resolve(true);
    },
    fail: () => Promise.resolve(false),
  })(request());

  assertEquals(response.status, 200);
  assertEquals(completions, ['claim-1:revoked']);
  assertEquals(await response.json(), {
    status: 'confirmed',
    claimed: 1,
    confirmed: 1,
    failed: 0,
  });
});

Deno.test('worker recognizes verified already-invalid as terminal success', async () => {
  const outcomes: string[] = [];
  const response = await createBankRevocationWorker({
    authenticate: () => Promise.resolve(true),
    claim: () => Promise.resolve([ITEM]),
    revoke: () =>
      Promise.resolve({
        provider: 'plaid',
        outcome: 'revoked',
        detail: 'already invalid at provider',
      }),
    complete: (_item, outcome) => {
      outcomes.push(outcome);
      return Promise.resolve(true);
    },
    fail: () => Promise.resolve(false),
  })(request());

  assertEquals(response.status, 200);
  assertEquals(outcomes, ['already_invalid']);
});

Deno.test('provider outage is a failure with retry, never a success-shaped skip', async () => {
  const errors: string[] = [];
  const response = await createBankRevocationWorker({
    authenticate: () => Promise.resolve(true),
    claim: () => Promise.resolve([ITEM]),
    revoke: () =>
      Promise.resolve({ provider: 'plaid', outcome: 'failed', detail: 'PROVIDER_DOWN' }),
    complete: () => Promise.resolve(false),
    fail: (_item, errorCode) => {
      errors.push(errorCode);
      return Promise.resolve(true);
    },
  })(request());

  assertEquals(response.status, 200);
  assertEquals(errors, ['PROVIDER_DOWN']);
  assertEquals((await response.json()).status, 'retry_scheduled');
});

Deno.test('missing configuration is persisted as a classified failure', async () => {
  const errors: string[] = [];
  await createBankRevocationWorker({
    authenticate: () => Promise.resolve(true),
    claim: () => Promise.resolve([ITEM]),
    revoke: () =>
      Promise.resolve({
        provider: 'plaid',
        outcome: 'failed',
        detail: 'provider credentials not configured',
      }),
    complete: () => Promise.resolve(false),
    fail: (_item, errorCode) => {
      errors.push(errorCode);
      return Promise.resolve(true);
    },
  })(request());

  assertEquals(errors, ['PROVIDER_CONFIGURATION_MISSING']);
});

Deno.test('duplicate delivery is idempotent when completion reports terminal state', async () => {
  let providerCalls = 0;
  const handler = createBankRevocationWorker({
    authenticate: () => Promise.resolve(true),
    claim: () => {
      if (providerCalls > 0) return Promise.resolve([]);
      return Promise.resolve([ITEM]);
    },
    revoke: () => {
      providerCalls++;
      return Promise.resolve({ provider: 'plaid', outcome: 'revoked' });
    },
    complete: () => Promise.resolve(true),
    fail: () => Promise.resolve(false),
  });

  assertEquals((await handler(request())).status, 200);
  assertEquals((await handler(request())).status, 200);
  assertEquals(providerCalls, 1);
});

Deno.test('worker refuses unauthorized calls and never claims work', async () => {
  let claims = 0;
  const response = await createBankRevocationWorker({
    authenticate: () => Promise.resolve(false),
    claim: () => {
      claims++;
      return Promise.resolve([]);
    },
    revoke: () => Promise.resolve({ provider: 'plaid', outcome: 'revoked' }),
    complete: () => Promise.resolve(true),
    fail: () => Promise.resolve(true),
  })(request());

  assertEquals(response.status, 401);
  assertEquals(claims, 0);
});
