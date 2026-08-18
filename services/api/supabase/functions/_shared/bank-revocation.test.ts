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
import { MxApiError } from './mx.ts';

const FULL_ENV: Record<string, string> = {
  PLAID_CLIENT_ID: 'client',
  PLAID_SECRET: 'secret',
  BANK_ENCRYPTION_KEY: 'key-material',
  PLAID_ENVIRONMENT: 'sandbox',
  MX_CLIENT_ID: 'mx-client',
  MX_API_KEY: 'mx-key',
  MX_ENVIRONMENT: 'sandbox',
};

function depsWith(
  env: Record<string, string>,
  overrides: Partial<RevokeProviderTokenDeps> = {},
): RevokeProviderTokenDeps {
  return {
    getEnv: (k: string) => env[k],
    decrypt: () => Promise.resolve('decrypted-token'),
    revokePlaid: () => Promise.resolve({ request_id: 'req-1' }),
    revokeMx: () => Promise.resolve(undefined),
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

Deno.test('revokeProviderToken — skipped for providers with no adapter', async () => {
  for (const provider of ['truelayer', 'finicity']) {
    const result = await revokeProviderToken(
      { provider, encryptedAccessToken: 'aes256gcm:iv:ct' },
      depsWith(FULL_ENV),
    );
    assertEquals(result.outcome, 'skipped');
    assertEquals(result.detail, 'provider revocation not implemented');
  }
});

Deno.test('revokeProviderToken — revokes an MX member with the decoded guid pair', async () => {
  let seen: { userGuid: string; memberGuid: string } | null = null;
  const result = await revokeProviderToken(
    { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      decrypt: () => Promise.resolve('USR-1:MBR-2'),
      revokeMx: (_config, userGuid, memberGuid) => {
        seen = { userGuid, memberGuid };
        return Promise.resolve(undefined);
      },
    }),
  );
  assertEquals(result.outcome, 'revoked');
  assertEquals(seen, { userGuid: 'USR-1', memberGuid: 'MBR-2' });
});

Deno.test('revokeProviderToken — MX 404 counts as revoked (nothing left to revoke)', async () => {
  const result = await revokeProviderToken(
    { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      decrypt: () => Promise.resolve('USR-1:MBR-2'),
      revokeMx: () => Promise.reject(new MxApiError(404, 'HTTP_404')),
    }),
  );
  assertEquals(result.outcome, 'revoked');
  assertEquals(result.detail, 'already invalid at provider');
});

Deno.test('revokeProviderToken — MX failure surfaces only the safe code', async () => {
  const result = await revokeProviderToken(
    { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, {
      decrypt: () => Promise.resolve('USR-1:MBR-2'),
      revokeMx: () => Promise.reject(new MxApiError(500, 'INTERNAL_ERROR')),
    }),
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'INTERNAL_ERROR');
});

Deno.test('revokeProviderToken — MX malformed stored credential fails safely', async () => {
  const result = await revokeProviderToken(
    { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith(FULL_ENV, { decrypt: () => Promise.resolve('not-a-pair') }),
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.detail, 'stored credential malformed');
});

Deno.test('revokeProviderToken — skipped when MX credentials missing', async () => {
  const result = await revokeProviderToken(
    { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
    depsWith({ BANK_ENCRYPTION_KEY: 'key-material' }),
  );
  assertEquals(result.outcome, 'skipped');
  assertEquals(result.detail, 'provider credentials not configured');
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
      { provider: 'truelayer', encryptedAccessToken: 'aes256gcm:iv:ct' },
      { provider: 'plaid', encryptedAccessToken: null },
    ],
    depsWith(FULL_ENV),
  );
  assertEquals(results.length, 3);
  assertEquals(results[0].outcome, 'revoked');
  assertEquals(results[1].outcome, 'skipped');
  assertEquals(results[2].outcome, 'skipped');
});

Deno.test('revokeProviderTokens — revokes mixed Plaid and MX batches', async () => {
  const results = await revokeProviderTokens(
    [
      { provider: 'plaid', encryptedAccessToken: 'aes256gcm:iv:ct' },
      { provider: 'mx', encryptedAccessToken: 'aes256gcm:iv:ct' },
    ],
    depsWith(FULL_ENV, { decrypt: () => Promise.resolve('USR-1:MBR-2') }),
  );
  assertEquals(
    results.map((r) => r.outcome),
    ['revoked', 'revoked'],
  );
});
