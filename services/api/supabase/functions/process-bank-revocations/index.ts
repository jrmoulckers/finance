// SPDX-License-Identifier: BUSL-1.1

/**
 * Durable bank provider revocation worker (#4405).
 *
 * The database owns ordering, leases, retries, exhaustion, identity severance,
 * and terminal credential purge. This worker only authenticates the scheduler,
 * claims encrypted jobs, calls the provider adapter, and records a safe result.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  claimBankRevocationJobs,
  enforceDueBankConnectionDowngrades,
  recordBankRevocationResult,
} from '../_shared/bank-revocation-outbox.ts';
import { revokeProviderToken, type TokenRevocationResult } from '../_shared/bank-revocation.ts';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_LEASE_SECONDS = 300;

export interface BankRevocationWorkerDeps {
  createClient?: () => SupabaseClient;
  getEnv?: (key: string) => string | undefined;
  revokeToken?: typeof revokeProviderToken;
}

const SAFE_DETAIL_CODES: Record<string, string> = {
  'already invalid at provider': 'ALREADY_INVALID',
  'no stored token': 'CREDENTIAL_MISSING',
  'provider revocation not implemented': 'PROVIDER_UNSUPPORTED',
  'provider credentials not configured': 'PROVIDER_CONFIG_MISSING',
  'encryption key not configured': 'ENCRYPTION_KEY_MISSING',
  'token decryption failed': 'TOKEN_DECRYPTION_FAILED',
  'stored credential malformed': 'CREDENTIAL_MALFORMED',
  'revocation request failed': 'PROVIDER_REQUEST_FAILED',
  'unexpected error': 'REVOCATION_UNEXPECTED',
};

export function safeRevocationErrorCode(result: TokenRevocationResult): string | null {
  if (!result.detail) return result.outcome === 'revoked' ? null : 'REVOCATION_FAILED';
  if (SAFE_DETAIL_CODES[result.detail]) return SAFE_DETAIL_CODES[result.detail];
  if (/^[A-Z0-9_:-]{1,64}$/.test(result.detail)) return result.detail;
  return result.outcome === 'revoked' ? 'ALREADY_INVALID' : 'REVOCATION_FAILED';
}

export function createBankRevocationWorker(deps: BankRevocationWorkerDeps = {}) {
  const createClient = deps.createClient ?? createAdminClient;
  const getEnv = deps.getEnv ?? ((key: string) => Deno.env.get(key));
  const revokeToken = deps.revokeToken ?? revokeProviderToken;

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return methodNotAllowedResponse(req);

    const logger = createLogger('process-bank-revocations');
    const cronSecret = getEnv('CRON_SECRET');
    if (!cronSecret) {
      logger.error('Revocation worker credential is not configured');
      return internalErrorResponse(req);
    }

    const authorization = req.headers.get('Authorization');
    if (!authorization || !(await timingSafeEqual(authorization, `Bearer ${cronSecret}`))) {
      logger.warn('Unauthorized revocation worker request', { httpStatus: 401 });
      return errorResponse(req, 'Unauthorized', 401);
    }

    try {
      const supabase = createClient();
      await enforceDueBankConnectionDowngrades(supabase, 50);
      const jobs = await claimBankRevocationJobs(supabase, {
        limit: DEFAULT_BATCH_SIZE,
        leaseSeconds: DEFAULT_LEASE_SECONDS,
      });

      const counts = { claimed: jobs.length, revoked: 0, retry_wait: 0, exhausted: 0, stale: 0 };
      for (const job of jobs) {
        const providerResult = await revokeToken({
          provider: job.provider,
          encryptedAccessToken: job.encryptedAccessToken,
        });
        const disposition = await recordBankRevocationResult(supabase, {
          id: job.id,
          leaseToken: job.leaseToken,
          succeeded: providerResult.outcome === 'revoked',
          errorCode: safeRevocationErrorCode(providerResult),
        });
        counts[disposition]++;
      }

      logger.info('Bank revocation batch processed', counts);
      return jsonResponse(req, counts);
    } catch {
      logger.error('Bank revocation batch failed');
      return internalErrorResponse(req);
    }
  };
}

serve(createBankRevocationWorker());
