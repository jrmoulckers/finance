// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { revokeProviderToken } from '../_shared/bank-revocation.ts';
import {
  claimBankConnectionRevocations,
  completeBankConnectionRevocation,
  failBankConnectionRevocation,
  safeRevocationErrorCode,
  type ClaimedBankRevocation,
} from '../_shared/bank-revocation-outbox.ts';

const BATCH_SIZE = 25;

interface WorkerDependencies {
  authenticate(request: Request): Promise<boolean>;
  claim(limit: number): Promise<ClaimedBankRevocation[]>;
  revoke(item: ClaimedBankRevocation): ReturnType<typeof revokeProviderToken>;
  complete(item: ClaimedBankRevocation, outcome: 'revoked' | 'already_invalid'): Promise<boolean>;
  fail(item: ClaimedBankRevocation, errorCode: string): Promise<boolean>;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function createBankRevocationWorker(deps: WorkerDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!(await deps.authenticate(request))) return json(401, { error: 'unauthorized' });

    let claimed: ClaimedBankRevocation[];
    try {
      claimed = await deps.claim(BATCH_SIZE);
    } catch {
      return json(503, { status: 'error', error: 'claim_unavailable' });
    }

    let confirmed = 0;
    let failed = 0;
    let persistenceFailures = 0;

    for (const item of claimed) {
      const result = await deps.revoke(item);
      if (result.outcome === 'revoked') {
        const outcome =
          result.detail === 'already invalid at provider' ? 'already_invalid' : 'revoked';
        if (await deps.complete(item, outcome)) confirmed++;
        else persistenceFailures++;
        continue;
      }

      if (await deps.fail(item, safeRevocationErrorCode(result.detail))) failed++;
      else persistenceFailures++;
    }

    if (persistenceFailures > 0) {
      return json(503, {
        status: 'partial',
        claimed: claimed.length,
        confirmed,
        failed,
        persistence_failures: persistenceFailures,
      });
    }

    return json(200, {
      status: failed > 0 ? 'retry_scheduled' : 'confirmed',
      claimed: claimed.length,
      confirmed,
      failed,
    });
  };
}

function productionDependencies(supabase: SupabaseClient): WorkerDependencies {
  return {
    async authenticate(request) {
      const secret = Deno.env.get('CRON_SECRET');
      const authorization = request.headers.get('authorization');
      return (
        !!secret && !!authorization && (await timingSafeEqual(authorization, 'Bearer ' + secret))
      );
    },
    claim: (limit) => claimBankConnectionRevocations(supabase, limit),
    revoke: (item) =>
      revokeProviderToken({
        provider: item.provider,
        encryptedAccessToken: item.encryptedAccessToken,
      }),
    complete: (item, outcome) =>
      completeBankConnectionRevocation(supabase, {
        id: item.id,
        claimToken: item.claimToken,
        outcome,
      }),
    fail: (item, errorCode) =>
      failBankConnectionRevocation(supabase, {
        id: item.id,
        claimToken: item.claimToken,
        errorCode,
      }),
  };
}

export const handler = async (request: Request): Promise<Response> => {
  const envError = validateEnv('process-bank-revocations', request);
  if (envError) return envError;

  const logger = createLogger('process-bank-revocations');
  try {
    const response = await createBankRevocationWorker(productionDependencies(createAdminClient()))(
      request,
    );
    logger.info('Revocation worker batch completed', { httpStatus: response.status });
    return response;
  } catch {
    logger.error('Revocation worker batch failed', { errorCode: 'WORKER_RUNTIME_FAILURE' });
    return json(503, { status: 'error', error: 'temporarily_unavailable' });
  }
};

if (import.meta.main) Deno.serve(handler);
