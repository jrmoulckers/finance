// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  claimBankRevocationJobs,
  completeBankRevocationJob,
  failBankRevocationJob,
  reconcileBankConnectionAllowances,
  resolveBankRevocationReconciliation,
  type ClaimedBankRevocation,
} from '../_shared/bank-revocation-outbox.ts';
import { revokeProviderToken, type TokenRevocationResult } from '../_shared/bank-revocation.ts';

interface RevocationStore {
  reconcileAllowances(): Promise<number>;
  claim(workerId: string): Promise<ClaimedBankRevocation[]>;
  resolve(jobId: string, workerId: string): Promise<'revoke' | 'retained' | 'stale_claim'>;
  complete(jobId: string, workerId: string, alreadyInvalid: boolean): Promise<boolean>;
  fail(
    jobId: string,
    workerId: string,
    errorCode: string,
  ): Promise<'pending_revocation' | 'pending_reconciliation' | 'exhausted' | 'stale_claim'>;
}

interface WorkerDependencies {
  authorize(request: Request): Promise<boolean>;
  store: RevocationStore;
  revoke(job: ClaimedBankRevocation): Promise<TokenRevocationResult>;
  newWorkerId(): string;
}

function json(status: number, body: Record<string, unknown>, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function createBankRevocationWorker(deps: WorkerDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!(await deps.authorize(request))) return json(401, { error: 'unauthorized' });

    const workerId = deps.newWorkerId();
    let allowanceEnqueued: number;
    let jobs: ClaimedBankRevocation[];
    try {
      allowanceEnqueued = await deps.store.reconcileAllowances();
      jobs = await deps.store.claim(workerId);
    } catch {
      return json(
        503,
        { status: 'error', error: 'reconciliation_unavailable' },
        { 'Retry-After': '30' },
      );
    }

    let revoked = 0;
    let alreadyInvalid = 0;
    let retained = 0;
    let retried = 0;
    let exhausted = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        if (job.status === 'pending_reconciliation') {
          const resolution = await deps.store.resolve(job.id, workerId);
          if (resolution === 'retained') {
            retained++;
            continue;
          }
          if (resolution === 'stale_claim') {
            failed++;
            continue;
          }
        }

        const result = await deps.revoke(job);
        if (result.outcome === 'revoked' || result.outcome === 'already_invalid') {
          const completed = await deps.store.complete(
            job.id,
            workerId,
            result.outcome === 'already_invalid',
          );
          if (!completed) {
            failed++;
          } else if (result.outcome === 'already_invalid') {
            alreadyInvalid++;
          } else {
            revoked++;
          }
          continue;
        }

        const failureStatus = await deps.store.fail(
          job.id,
          workerId,
          result.detail ?? 'REVOCATION_FAILED',
        );
        if (failureStatus === 'exhausted') exhausted++;
        else if (failureStatus === 'stale_claim') failed++;
        else retried++;
      } catch {
        failed++;
      }
    }

    const body = {
      status: failed > 0 || retried > 0 || exhausted > 0 ? 'retrying' : 'confirmed',
      allowance_enqueued: allowanceEnqueued,
      claimed: jobs.length,
      revoked,
      already_invalid: alreadyInvalid,
      retained,
      retried,
      exhausted,
      failed,
    };
    return failed > 0 || retried > 0 || exhausted > 0
      ? json(503, body, { 'Retry-After': '30' })
      : json(200, body);
  };
}

function productionDependencies(): WorkerDependencies {
  const admin = createAdminClient();
  return {
    authorize: async (request) => {
      const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const authorization = request.headers.get('authorization');
      if (!serviceRole || !authorization) return false;
      return timingSafeEqual(authorization, `Bearer ${serviceRole}`);
    },
    store: {
      reconcileAllowances: () => reconcileBankConnectionAllowances(admin),
      claim: (workerId) => claimBankRevocationJobs(admin, { workerId }),
      resolve: (jobId, workerId) =>
        resolveBankRevocationReconciliation(admin, { id: jobId, workerId }),
      complete: (jobId, workerId, alreadyInvalid) =>
        completeBankRevocationJob(admin, { id: jobId, workerId, alreadyInvalid }),
      fail: (jobId, workerId, errorCode) =>
        failBankRevocationJob(admin, { id: jobId, workerId, errorCode }),
    },
    revoke: (job) =>
      revokeProviderToken({
        provider: job.provider,
        encryptedAccessToken: job.encryptedAccessToken,
      }),
    newWorkerId: () => crypto.randomUUID(),
  };
}

const logger = createLogger('bank-revocation-worker');

export async function handler(request: Request): Promise<Response> {
  try {
    const response = await createBankRevocationWorker(productionDependencies())(request);
    logger.info('Revocation worker completed', { httpStatus: response.status });
    return response;
  } catch {
    logger.error('Revocation worker failed', {
      errorCode: 'WORKER_CONFIGURATION_OR_RUNTIME_ERROR',
    });
    return json(
      503,
      { status: 'error', error: 'reconciliation_unavailable' },
      { 'Retry-After': '30' },
    );
  }
}

if (import.meta.main) Deno.serve(handler);
