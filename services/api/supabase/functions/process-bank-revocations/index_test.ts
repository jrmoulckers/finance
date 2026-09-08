// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createBankRevocationWorker, safeRevocationErrorCode } from './index.ts';

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function workerRequest(authorization = 'Bearer cron-test'): Request {
  return new Request('http://localhost/functions/v1/process-bank-revocations', {
    method: 'POST',
    headers: { Authorization: authorization },
  });
}

function fakeClient(options: { resultError?: boolean; disposition?: string } = {}) {
  const calls: RpcCall[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'enforce_due_bank_connection_downgrades') {
        return Promise.resolve({
          data: [{ households_processed: '1', connections_queued: '1' }],
          error: null,
        });
      }
      if (name === 'claim_bank_revocation_jobs') {
        return Promise.resolve({
          data: [
            {
              id: 'job-1',
              provider: 'plaid',
              encrypted_access_token: 'enc::credential',
              lease_token: 'lease-1',
            },
          ],
          error: null,
        });
      }
      if (name === 'record_bank_revocation_result') {
        return Promise.resolve(
          options.resultError
            ? { data: null, error: { message: 'response lost' } }
            : { data: options.disposition ?? 'revoked', error: null },
        );
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

Deno.test('worker requires its server-to-server credential before claiming', async () => {
  const fake = fakeClient();
  const response = await createBankRevocationWorker({
    createClient: () => fake.client,
    getEnv: () => undefined,
  })(workerRequest());

  assertEquals(response.status, 500);
  assertEquals(fake.calls.length, 0);
});

Deno.test('worker treats provider already-invalid as terminal success', async () => {
  const fake = fakeClient();
  const response = await createBankRevocationWorker({
    createClient: () => fake.client,
    getEnv: (key) => (key === 'CRON_SECRET' ? 'cron-test' : undefined),
    revokeToken: ((params: { provider: string }) =>
      Promise.resolve({
        provider: params.provider,
        outcome: 'revoked' as const,
        detail: 'already invalid at provider',
      })) as never,
  })(workerRequest());

  assertEquals(response.status, 200);
  const result = fake.calls.find((call) => call.name === 'record_bank_revocation_result');
  assertEquals(result?.args.p_succeeded, true);
  assertEquals(result?.args.p_error_code, 'ALREADY_INVALID');
  const raw = await response.text();
  assertEquals(raw.includes('enc::credential'), false);
  assertEquals(raw.includes('job-1'), false);
  assertEquals(raw.includes('plaid'), false);
});

Deno.test('missing provider configuration remains a retry failure', async () => {
  const fake = fakeClient({ disposition: 'retry_wait' });
  const response = await createBankRevocationWorker({
    createClient: () => fake.client,
    getEnv: (key) => (key === 'CRON_SECRET' ? 'cron-test' : undefined),
    revokeToken: ((params: { provider: string }) =>
      Promise.resolve({
        provider: params.provider,
        outcome: 'failed' as const,
        detail: 'provider credentials not configured',
      })) as never,
  })(workerRequest());

  assertEquals(response.status, 200);
  const result = fake.calls.find((call) => call.name === 'record_bank_revocation_result');
  assertEquals(result?.args.p_succeeded, false);
  assertEquals(result?.args.p_error_code, 'PROVIDER_CONFIG_MISSING');
});

Deno.test('ambiguous result persistence is never reported as success', async () => {
  const fake = fakeClient({ resultError: true });
  const response = await createBankRevocationWorker({
    createClient: () => fake.client,
    getEnv: (key) => (key === 'CRON_SECRET' ? 'cron-test' : undefined),
    revokeToken: ((params: { provider: string }) =>
      Promise.resolve({ provider: params.provider, outcome: 'revoked' as const })) as never,
  })(workerRequest());

  assertEquals(response.status, 500);
});

Deno.test('safe error mapping rejects provider-controlled detail text', () => {
  assertEquals(
    safeRevocationErrorCode({
      provider: 'plaid',
      outcome: 'failed',
      detail: 'raw response with customer material',
    }),
    'REVOCATION_FAILED',
  );
  assertEquals(
    safeRevocationErrorCode({
      provider: 'plaid',
      outcome: 'failed',
      detail: 'INSTITUTION_DOWN',
    }),
    'INSTITUTION_DOWN',
  );
});
