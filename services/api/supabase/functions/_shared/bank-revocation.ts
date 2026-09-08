// SPDX-License-Identifier: BUSL-1.1

/**
 * Aggregator token revocation (#3867 / #3869 / #4405).
 *
 * When a user disconnects a bank connection or deletes their account, the
 * access token we hold on their behalf must be revoked at the aggregator so
 * the processor no longer retains access to their financial data (GDPR
 * Art. 17 erasure + processor deletion propagation).
 *
 * Design constraints:
 *   - The helper always resolves to a classified result so a durable worker can
 *     record a retry. Missing configuration, missing/decryption-failed
 *     credentials, unsupported providers, outages, and ambiguous responses are
 *     failures, never success-shaped skips.
 *   - MUST NOT log or return the plaintext access token or key material.
 *   - Plaid revokes via POST /item/remove; MX revokes by deleting the member
 *     (DELETE /users/{u}/members/{m}). TrueLayer and Finicity are disabled
 *     placeholders and therefore fail closed if a stored row ever reaches this
 *     helper with one of those providers.
 *
 * The result is returned to the caller so it can be written to an audit log
 * without exposing any secret.
 */

import { decryptToken } from './bank-crypto.ts';
import { removeItem, PlaidApiError, type PlaidConfig } from './plaid.ts';
import { decodeMxCredential, deleteMember, MxApiError, type MxConfig } from './mx.ts';

/** Outcome of a best-effort revocation attempt. */
export type TokenRevocationOutcome = 'revoked' | 'already_invalid' | 'failed';

/** Result of a revocation attempt — safe to persist in an audit log. */
export interface TokenRevocationResult {
  /** The aggregator provider the token belonged to. */
  provider: string;
  /** Whether the token was revoked, verified absent, or the attempt failed. */
  outcome: TokenRevocationOutcome;
  /**
   * Safe, non-sensitive detail for failed outcomes (e.g. a Plaid
   * error_code or a configuration note). NEVER contains a token.
   */
  detail?: string;
}

/** Inputs for a single connection's revocation. */
export interface RevokeProviderTokenParams {
  /** Aggregator provider (`plaid`, `mx`, `truelayer`, `finicity`). */
  provider: string;
  /** The stored AES-256-GCM token envelope, or null if none is stored. */
  encryptedAccessToken: string | null | undefined;
}

/** Injectable dependencies (for tests — production uses the real ones). */
export interface RevokeProviderTokenDeps {
  getEnv?: (key: string) => string | undefined;
  decrypt?: (envelope: string, keyMaterial: string) => Promise<string>;
  revokePlaid?: (config: PlaidConfig, accessToken: string) => Promise<unknown>;
  revokeMx?: (config: MxConfig, userGuid: string, memberGuid: string) => Promise<unknown>;
}

/**
 * Plaid error codes that mean the Item is already gone at the provider. These
 * are treated as a successful revocation — there is nothing left to revoke.
 */
const ALREADY_INVALID_PLAID_CODES = new Set([
  'ITEM_NOT_FOUND',
  'INVALID_ACCESS_TOKEN',
  'ITEM_NO_LONGER_SUPPORTED',
]);

/**
 * MX statuses that mean the member is already gone. A 404 carries no
 * `error.status`, so the coarse HTTP code is matched too.
 */
const ALREADY_INVALID_MX_CODES = new Set(['HTTP_404', 'NOT_FOUND', 'RESOURCE_NOT_FOUND']);

function defaultGetEnv(key: string): string | undefined {
  // Deno is the Edge runtime; guard so the module can be imported under other
  // runtimes (e.g. tooling) without a ReferenceError.
  return typeof Deno !== 'undefined' ? Deno.env.get(key) : undefined;
}

/**
 * Revoke a single connection's access token at its aggregator.
 *
 * Always resolves (never rejects). Returns a {@link TokenRevocationResult}
 * describing what happened so the caller can audit it.
 */
export async function revokeProviderToken(
  params: RevokeProviderTokenParams,
  deps: RevokeProviderTokenDeps = {},
): Promise<TokenRevocationResult> {
  const provider = params.provider;
  const getEnv = deps.getEnv ?? defaultGetEnv;
  const decrypt = deps.decrypt ?? decryptToken;
  const revokePlaid = deps.revokePlaid ?? removeItem;
  const revokeMx = deps.revokeMx ?? deleteMember;

  try {
    if (!params.encryptedAccessToken) {
      return { provider, outcome: 'failed', detail: 'REVOCATION_CREDENTIAL_MISSING' };
    }

    // TrueLayer/Finicity are disabled placeholders with no adapter yet.
    if (provider !== 'plaid' && provider !== 'mx') {
      return { provider, outcome: 'failed', detail: 'PROVIDER_REVOCATION_UNSUPPORTED' };
    }

    const clientId = getEnv(provider === 'plaid' ? 'PLAID_CLIENT_ID' : 'MX_CLIENT_ID');
    const secret = getEnv(provider === 'plaid' ? 'PLAID_SECRET' : 'MX_API_KEY');
    if (!clientId || !secret) {
      return { provider, outcome: 'failed', detail: 'PROVIDER_CONFIGURATION_MISSING' };
    }

    const key = getEnv('BANK_ENCRYPTION_KEY');
    if (!key) {
      return { provider, outcome: 'failed', detail: 'ENCRYPTION_CONFIGURATION_MISSING' };
    }

    let accessToken: string;
    try {
      accessToken = await decrypt(params.encryptedAccessToken, key);
    } catch {
      // Do not surface the crypto error detail — it could echo ciphertext.
      return { provider, outcome: 'failed', detail: 'CREDENTIAL_DECRYPTION_FAILED' };
    }

    if (provider === 'mx') {
      let userGuid: string;
      let memberGuid: string;
      try {
        ({ userGuid, memberGuid } = decodeMxCredential(accessToken));
      } catch {
        return { provider, outcome: 'failed', detail: 'REVOCATION_CREDENTIAL_MALFORMED' };
      }

      const mxConfig: MxConfig = {
        clientId,
        apiKey: secret,
        environment: getEnv('MX_ENVIRONMENT') ?? 'sandbox',
      };

      try {
        await revokeMx(mxConfig, userGuid, memberGuid);
        return { provider, outcome: 'revoked' };
      } catch (err) {
        if (err instanceof MxApiError && ALREADY_INVALID_MX_CODES.has(err.errorCode)) {
          return { provider, outcome: 'already_invalid' };
        }
        // MxApiError only carries a safe status code; never the raw body.
        const detail = err instanceof MxApiError ? err.errorCode : 'REVOCATION_REQUEST_FAILED';
        return { provider, outcome: 'failed', detail };
      }
    }

    const config: PlaidConfig = {
      clientId,
      secret,
      environment: getEnv('PLAID_ENVIRONMENT') ?? 'sandbox',
    };

    try {
      await revokePlaid(config, accessToken);
      return { provider, outcome: 'revoked' };
    } catch (err) {
      if (err instanceof PlaidApiError && ALREADY_INVALID_PLAID_CODES.has(err.errorCode)) {
        return { provider, outcome: 'already_invalid' };
      }
      // PlaidApiError only carries a safe error_code; never the raw body.
      const detail = err instanceof PlaidApiError ? err.errorCode : 'REVOCATION_REQUEST_FAILED';
      return { provider, outcome: 'failed', detail };
    }
  } catch {
    // Absolute backstop: revocation must never throw into disconnect/delete.
    return { provider, outcome: 'failed', detail: 'REVOCATION_UNEXPECTED_ERROR' };
  }
}

/**
 * Best-effort revoke a batch of connections. Resolves after attempting every
 * one; individual failures are captured in the returned results, never thrown.
 */
export async function revokeProviderTokens(
  connections: ReadonlyArray<RevokeProviderTokenParams>,
  deps: RevokeProviderTokenDeps = {},
): Promise<TokenRevocationResult[]> {
  const results: TokenRevocationResult[] = [];
  for (const connection of connections) {
    results.push(await revokeProviderToken(connection, deps));
  }
  return results;
}
