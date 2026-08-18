// SPDX-License-Identifier: BUSL-1.1

/**
 * Best-effort aggregator token revocation (#3867 / #3869).
 *
 * When a user disconnects a bank connection or deletes their account, the
 * access token we hold on their behalf must be revoked at the aggregator so
 * the processor no longer retains access to their financial data (GDPR
 * Art. 17 erasure + processor deletion propagation).
 *
 * Design constraints:
 *   - MUST be best-effort: revocation NEVER throws into the caller's
 *     disconnect / delete flow. A processor outage or missing credential
 *     must not block a user from disconnecting or deleting their account.
 *   - MUST NOT log or return the plaintext access token or key material.
 *   - Plaid revokes via POST /item/remove; MX revokes by deleting the member
 *     (DELETE /users/{u}/members/{m}). TrueLayer and Finicity are disabled
 *     placeholders and record a `skipped` outcome so the audit trail still
 *     shows revocation was attempted.
 *
 * The result is returned to the caller so it can be written to an audit log
 * without exposing any secret.
 */

import { decryptToken } from './bank-crypto.ts';
import { removeItem, PlaidApiError, type PlaidConfig } from './plaid.ts';
import { decodeMxCredential, deleteMember, MxApiError, type MxConfig } from './mx.ts';

/** Outcome of a best-effort revocation attempt. */
export type TokenRevocationOutcome = 'revoked' | 'skipped' | 'failed';

/** Result of a revocation attempt — safe to persist in an audit log. */
export interface TokenRevocationResult {
  /** The aggregator provider the token belonged to. */
  provider: string;
  /** Whether the token was revoked, skipped, or the attempt failed. */
  outcome: TokenRevocationOutcome;
  /**
   * Safe, non-sensitive detail for skipped/failed outcomes (e.g. a Plaid
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
 * Best-effort revoke a single connection's access token at its aggregator.
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
      return { provider, outcome: 'skipped', detail: 'no stored token' };
    }

    // TrueLayer/Finicity are disabled placeholders with no adapter yet.
    if (provider !== 'plaid' && provider !== 'mx') {
      return { provider, outcome: 'skipped', detail: 'provider revocation not implemented' };
    }

    const clientId = getEnv(provider === 'plaid' ? 'PLAID_CLIENT_ID' : 'MX_CLIENT_ID');
    const secret = getEnv(provider === 'plaid' ? 'PLAID_SECRET' : 'MX_API_KEY');
    if (!clientId || !secret) {
      return { provider, outcome: 'skipped', detail: 'provider credentials not configured' };
    }

    const key = getEnv('BANK_ENCRYPTION_KEY');
    if (!key) {
      return { provider, outcome: 'failed', detail: 'encryption key not configured' };
    }

    let accessToken: string;
    try {
      accessToken = await decrypt(params.encryptedAccessToken, key);
    } catch {
      // Do not surface the crypto error detail — it could echo ciphertext.
      return { provider, outcome: 'failed', detail: 'token decryption failed' };
    }

    if (provider === 'mx') {
      let userGuid: string;
      let memberGuid: string;
      try {
        ({ userGuid, memberGuid } = decodeMxCredential(accessToken));
      } catch {
        return { provider, outcome: 'failed', detail: 'stored credential malformed' };
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
          return { provider, outcome: 'revoked', detail: 'already invalid at provider' };
        }
        // MxApiError only carries a safe status code; never the raw body.
        const detail = err instanceof MxApiError ? err.errorCode : 'revocation request failed';
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
        return { provider, outcome: 'revoked', detail: 'already invalid at provider' };
      }
      // PlaidApiError only carries a safe error_code; never the raw body.
      const detail = err instanceof PlaidApiError ? err.errorCode : 'revocation request failed';
      return { provider, outcome: 'failed', detail };
    }
  } catch {
    // Absolute backstop: revocation must never throw into disconnect/delete.
    return { provider, outcome: 'failed', detail: 'unexpected error' };
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
