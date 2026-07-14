// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the best-effort aggregator token revocation helper (#3867/#3869).
 *
 * Verifies the outcome matrix (revoked / skipped / failed), that the helper
 * NEVER throws into the caller, and that it never surfaces the plaintext token.
 * All external dependencies (env, decrypt, Plaid) are injected so no network
 * or real credentials are needed.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  revokeProviderToken,
  revokeProviderTokens,
  type RevokeProviderTokenDeps,
} from './bank-revocation.ts';
import { PlaidApiError, type PlaidConfig } from './plaid.ts';

const FULL_ENV: Record<string, string> = {
  PLAID_CLIENT_ID: 'client',
  PLAID_SECRET: 'secret',
  BANK_ENCRYPTION_KEY: 'key-material',
  PLAID_ENVIRONMENT: 'sandbox',
};

function depsWith(
  env: Record<string, string>,
  overrides: Partial<RevokeProviderTokenDeps> = {},
): RevokeProviderTokenDeps {
  return {
    getEnv: (k: string) => env[k],
    decrypt: () => Promise.resolve('decrypted-token'),
    revokePlaid: () => Promise.resolve({ request_id: 'req-1' }),
    ...overrides,
  };
}

Deno.test('revokeProviderToken — skipped when no stored token', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: null },
    depsWith(FULL_ENV),
  );
  assertEquals(result.outcome, 'skipped');
  assertEquals(result.detail, 'no stored token');
});

Deno.test('revokeProviderToken — skipped for non-Plaid providers (stub)', async () => {
  for (const provider of ['mx', 'truelayer', 'finicity']) {
    const result = await revokeProviderToken(
      { provider, encryptedAccessToken: 'aes256gcm:iv:ct' },
      depsWith(FULL_ENV),
    );
    assertEquals(result.outcome, 'skipped');
    assertEquals(result.detail, 'provider revocation not implemented');
  }
});

Deno.test('revokeProviderToken — skipped when Plaid credentials missing', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith({ BANK_ENCRYPTION_KEY: 'key-material' }),
  );
  assertEquals(result.outcome, 'skipped');
  assertEquals(result.detail, 'provider credentials not configured');
});

Deno.test('revokeProviderToken — failed when encryption key missing', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith({ PLAID_CLIENT_ID: 'client', PLAID_SECRET: 'secret' }),
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'encryption key not configured');
});

Deno.test('revokeProviderToken — failed when decryption throws', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      decrypt: () => Promise.reject(new Error('bad ciphertext')),
    }),
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'token decryption failed');
});

Deno.test('revokeProviderToken — revoked on success with decrypted token', async () => {
  let revokedWith: { config: PlaidConfig; token: string } | null = null;
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      decrypt: () => Promise.resolve('plaintext-access-token'),
      revokePlaid: (config: PlaidConfig, token: string) => {
        revokedWith = { config, token };
        return Promise.resolve({ request_id: 'req-1' });
      },
    }),
  );
  assertEquals(result.outcome, 'revoked');
  assertEquals(revokedWith!.token, 'plaintext-access-token');
  assertEquals(revokedWith!.config.clientId, 'client');
  assertEquals(revokedWith!.config.environment, 'sandbox');
});

Deno.test('revokeProviderToken — treats already-invalid item as revoked', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      revokePlaid: () => Promise.reject(new PlaidApiError(400, 'ITEM_NOT_FOUND')),
    }),
  );
  assertEquals(result.outcome, 'revoked');
  assertEquals(result.detail, 'already invalid at provider');
});

Deno.test('revokeProviderToken — failed carries the safe Plaid error code', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      revokePlaid: () => Promise.reject(new PlaidApiError(500, 'INTERNAL_SERVER_ERROR')),
    }),
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'INTERNAL_SERVER_ERROR');
});

Deno.test('revokeProviderToken — failed generically on a non-Plaid error', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      revokePlaid: () => Promise.reject(new Error('network down')),
    }),
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'revocation request failed');
});

Deno.test('revokeProviderToken — never throws even if getEnv throws', async () => {
  const result = await revokeProviderToken(
    { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
    {
      getEnv: () => {
        throw new Error('env exploded');
      },
    },
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'unexpected error');
});

Deno.test('revokeProviderTokens — processes a batch of connections', async () => {
  const results = await revokeProviderTokens(
    [
      { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
      { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
      { provider: 'plaid', encryptedAccessToken: null },
    ],
    depsWith(FULL_ENV),
  );
  assertEquals(results.length, 3);
  assertEquals(results[0].outcome, 'revoked');
  assertEquals(results[1].outcome, 'skipped');
  assertEquals(results[2].outcome, 'skipped');
});
