// SPDX-License-Identifier: BUSL-1.1

/**
 * Service-role worker for the durable bank revocation outbox (#4405).
 *
 * The database owns leasing, idempotency, backoff, and terminal credential
 * purge. This worker only reconciles an ambiguous Stage 6 handoff, calls the
 * provider adapter, and records a classified outcome. Responses and logs carry
 * counts only: never job IDs, connection IDs, provider IDs, credentials,
 * ciphertext, raw provider responses, or financial data.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  claimBankRevocationJobs,
  completeBankRevocationJob,
  resolveBankRevocationReconciliation,
  retryBankRevocationJob,
  safeBankRevocationErrorCode,
} from '../_shared/bank-revocation-queue.ts';
import { revokeProviderToken, type TokenRevocationResult } from '../_shared/bank-revocation.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

export interface BankRevocationWorkerSummary {
  claimed: number;
  revoked: number;
  alreadyInvalid: number;
  reconciled: number;
  retried: number;
  exhausted: number;
  deferred: number;
}

export interface BankRevocationWorkerDeps {
  claimJobs?: typeof claimBankRevocationJobs;
  resolveReconciliation?: typeof resolveBankRevocationReconciliation;
  revokeToken?: (
    params: Parameters<typeof revokeProviderToken>[0],
  ) => Promise<TokenRevocationResult>;
  completeJob?: typeof completeBankRevocationJob;
  retryJob?: typeof retryBankRevocationJob;
}

export async function runBankRevocationWorker(
  supabase: SupabaseClient,
  deps: BankRevocationWorkerDeps = {},
): Promise<BankRevocationWorkerSummary> {
  const claimJobs = deps.claimJobs ?? claimBankRevocationJobs;
  const resolveReconciliation = deps.resolveReconciliation ?? resolveBankRevocationReconciliation;
  const revokeToken = deps.revokeToken ?? revokeProviderToken;
  const completeJob = deps.completeJob ?? completeBankRevocationJob;
  const retryJob = deps.retryJob ?? retryBankRevocationJob;
  const jobs = await claimJobs(supabase, 10);
  const summary: BankRevocationWorkerSummary = {
    claimed: jobs.length,
    revoked: 0,
    alreadyInvalid: 0,
    reconciled: 0,
    retried: 0,
    exhausted: 0,
    deferred: 0,
  };

  for (const job of jobs) {
    if (job.reconciliationRequired) {
      const resolution = await resolveReconciliation(supabase, job);
      if (resolution === 'reconciled') {
        summary.reconciled++;
        continue;
      }
      if (resolution === 'lost_claim') {
        summary.deferred++;
        continue;
      }
      if (resolution === 'ready') {
        // The reconciliation RPC requeues this job without exposing its
        // credential. A later claim returns the credential only after the
        // ambiguity has been resolved.
        summary.deferred++;
        continue;
      }
      if (resolution === 'retry') {
        const retry = await retryJob(supabase, job, 'RECONCILIATION_DEFERRED');
        if (retry === 'retry_wait') summary.retried++;
        else if (retry === 'exhausted') summary.exhausted++;
        else summary.deferred++;
        continue;
      }
    }

    const revocation = await revokeToken({
      provider: job.provider,
      encryptedAccessToken: job.encryptedAccessToken,
    });

    if (revocation.outcome === 'revoked' || revocation.outcome === 'already_invalid') {
      const completed = await completeJob(supabase, job, revocation.outcome);
      if (!completed) {
        // Provider success with an unobserved DB completion is replay-safe: the
        // lease expires, the idempotent provider call reports already-invalid,
        // and the same durable job completes on a later run.
        summary.deferred++;
      } else if (revocation.outcome === 'already_invalid') {
        summary.alreadyInvalid++;
      } else {
        summary.revoked++;
      }
      continue;
    }

    const retry = await retryJob(supabase, job, safeBankRevocationErrorCode(revocation.detail));
    if (retry === 'retry_wait') summary.retried++;
    else if (retry === 'exhausted') summary.exhausted++;
    else summary.deferred++;
  }

  return summary;
}

export function createBankRevocationWorkerHandler(
  deps: BankRevocationWorkerDeps & {
    createClient?: typeof createAdminClient;
    getEnv?: (name: string) => string | undefined;
  } = {},
) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...JSON_HEADERS, Allow: 'POST' },
      });
    }

    const logger = createLogger('bank-revocation-worker');
    const getEnv = deps.getEnv ?? ((name: string) => Deno.env.get(name));
    const cronSecret = getEnv('CRON_SECRET');
    const authorization = req.headers.get('Authorization');
    if (!cronSecret) {
      logger.error('Worker authorization is not configured');
      return new Response(JSON.stringify({ error: 'Worker unavailable' }), {
        status: 503,
        headers: JSON_HEADERS,
      });
    }
    if (!authorization || !(await timingSafeEqual(authorization, `Bearer ${cronSecret}`))) {
      logger.warn('Unauthorized worker request', { httpStatus: 401 });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    try {
      const supabase = (deps.createClient ?? createAdminClient)();
      const summary = await runBankRevocationWorker(supabase, deps);
      logger.info('Revocation batch completed', {
        claimed: summary.claimed,
        revoked: summary.revoked,
        alreadyInvalid: summary.alreadyInvalid,
        reconciled: summary.reconciled,
        retried: summary.retried,
        exhausted: summary.exhausted,
        deferred: summary.deferred,
      });
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: JSON_HEADERS,
      });
    } catch {
      logger.error('Revocation batch failed');
      return new Response(JSON.stringify({ error: 'Worker failed' }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }
  };
}

if (import.meta.main) Deno.serve(createBankRevocationWorkerHandler());
