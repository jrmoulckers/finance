// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  safeBankRevocationErrorCode,
  type ClaimedBankRevocationJob,
} from '../_shared/bank-revocation-queue.ts';
import {
  createBankRevocationWorkerHandler,
  runBankRevocationWorker,
  type BankRevocationWorkerDeps,
} from './index.ts';

const CLIENT = {} as SupabaseClient;

function job(overrides: Partial<ClaimedBankRevocationJob> = {}): ClaimedBankRevocationJob {
  return {
    id: 'job-1',
    provider: 'plaid',
    encryptedAccessToken: 'enc::credential',
    connectionId: 'connection-1',
    operationReason: 'downgrade',
    reconciliationRequired: false,
    claimToken: 'claim-1',
    attemptNumber: 1,
    ...overrides,
  };
}

Deno.test('worker completes confirmed revoke and already-invalid outcomes', async () => {
  const completions: string[] = [];
  const jobs = [job(), job({ id: 'job-2', claimToken: 'claim-2' })];
  let revocations = 0;
  const summary = await runBankRevocationWorker(CLIENT, {
    claimJobs: () => Promise.resolve(jobs),
    revokeToken: (params) => {
      revocations++;
      return Promise.resolve({
        provider: params.provider,
        outcome: revocations === 1 ? 'revoked' : 'already_invalid',
      });
    },
    completeJob: (_client, claimed, outcome) => {
      completions.push(`${claimed.id}:${outcome}`);
      return Promise.resolve(true);
    },
  });

  assertEquals(completions, ['job-1:revoked', 'job-2:already_invalid']);
  assertEquals(summary, {
    claimed: 2,
    revoked: 1,
    alreadyInvalid: 1,
    reconciled: 0,
    retried: 0,
    exhausted: 0,
    deferred: 0,
  });
});

Deno.test(
  'worker keeps missing config, decrypt, outage, and transport failures retryable',
  async () => {
    const errorCodes: string[] = [];
    const failureDetails = [
      'provider credentials not configured',
      'token decryption failed',
      'INTERNAL_SERVER_ERROR',
      'revocation request failed',
    ];
    let index = 0;
    const summary = await runBankRevocationWorker(CLIENT, {
      claimJobs: () =>
        Promise.resolve(
          failureDetails.map((_, jobIndex) =>
            job({ id: `job-${jobIndex}`, claimToken: `claim-${jobIndex}` }),
          ),
        ),
      revokeToken: (params) =>
        Promise.resolve({
          provider: params.provider,
          outcome: index === 0 ? 'skipped' : 'failed',
          detail: failureDetails[index++],
        }),
      retryJob: (_client, _job, errorCode) => {
        errorCodes.push(errorCode);
        return Promise.resolve('retry_wait');
      },
    });

    assertEquals(errorCodes, [
      'PROVIDER_CONFIG_MISSING',
      'TOKEN_DECRYPTION_FAILED',
      'INTERNAL_SERVER_ERROR',
      'PROVIDER_REQUEST_FAILED',
    ]);
    assertEquals(summary.retried, 4);
    assertEquals(summary.revoked, 0);
  },
);

Deno.test('worker reconciles committed Stage 6 handoff without provider revocation', async () => {
  let revoked = false;
  const summary = await runBankRevocationWorker(CLIENT, {
    claimJobs: () =>
      Promise.resolve([job({ reconciliationRequired: true, encryptedAccessToken: null })]),
    resolveReconciliation: () => Promise.resolve('reconciled'),
    revokeToken: (params) => {
      revoked = true;
      return Promise.resolve({ provider: params.provider, outcome: 'revoked' });
    },
  });

  assertEquals(revoked, false);
  assertEquals(summary.reconciled, 1);
});

Deno.test('worker defers unresolved reconciliation through the bounded retry path', async () => {
  let revoked = false;
  let retryCode = '';
  const summary = await runBankRevocationWorker(CLIENT, {
    claimJobs: () =>
      Promise.resolve([job({ reconciliationRequired: true, encryptedAccessToken: null })]),
    resolveReconciliation: () => Promise.resolve('retry'),
    revokeToken: (params) => {
      revoked = true;
      return Promise.resolve({ provider: params.provider, outcome: 'revoked' });
    },
    retryJob: (_client, _job, errorCode) => {
      retryCode = errorCode;
      return Promise.resolve('exhausted');
    },
  });

  assertEquals(revoked, false);
  assertEquals(retryCode, 'RECONCILIATION_DEFERRED');
  assertEquals(summary.exhausted, 1);
});

Deno.test('lost completion is restart-safe and completes on already-invalid replay', async () => {
  const claimed = job();
  let run = 0;
  let completions = 0;
  const deps: BankRevocationWorkerDeps = {
    claimJobs: () => Promise.resolve([claimed]),
    revokeToken: (params) =>
      Promise.resolve({
        provider: params.provider,
        outcome: run++ === 0 ? 'revoked' : 'already_invalid',
      }),
    completeJob: () => Promise.resolve(++completions === 2),
  };

  const first = await runBankRevocationWorker(CLIENT, deps);
  const restarted = await runBankRevocationWorker(CLIENT, deps);

  assertEquals(first.deferred, 1);
  assertEquals(restarted.alreadyInvalid, 1);
  assertEquals(completions, 2);
});

Deno.test('safe failure classifier never persists raw or oversized detail', () => {
  assertEquals(safeBankRevocationErrorCode('token decryption failed'), 'TOKEN_DECRYPTION_FAILED');
  assertEquals(safeBankRevocationErrorCode('INSTITUTION_DOWN'), 'INSTITUTION_DOWN');
  assertEquals(
    safeBankRevocationErrorCode('raw response with account 123 and credential material'),
    'UNCLASSIFIED_FAILURE',
  );
  assertEquals(safeBankRevocationErrorCode('A'.repeat(65)), 'UNCLASSIFIED_FAILURE');
});

Deno.test('worker endpoint requires its cron credential and returns counts only', async () => {
  const handler = createBankRevocationWorkerHandler({
    getEnv: (name) => (name === 'CRON_SECRET' ? 'cron-test-secret' : undefined),
    createClient: () => CLIENT as never,
    claimJobs: () => Promise.resolve([]),
  });

  const denied = await handler(
    new Request('http://localhost/functions/v1/bank-revocation-worker', {
      method: 'POST',
    }),
  );
  assertEquals(denied.status, 401);

  const response = await handler(
    new Request('http://localhost/functions/v1/bank-revocation-worker', {
      method: 'POST',
      headers: { Authorization: 'Bearer cron-test-secret' },
    }),
  );
  const raw = await response.text();
  assertEquals(response.status, 200);
  assertEquals(raw.includes('enc::credential'), false);
  assertEquals(raw.includes('connection-1'), false);
  assertEquals(raw.includes('job-1'), false);
  assertEquals(JSON.parse(raw).claimed, 0);
});
