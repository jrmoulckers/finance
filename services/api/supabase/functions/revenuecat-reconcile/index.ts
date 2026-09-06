// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitResponse,
} from '../_shared/rate-limit.ts';
import { RevenueCatClient, RevenueCatUnavailableError } from '../_shared/revenuecat/client.ts';
import { readRevenueCatConfig, type RevenueCatConfig } from '../_shared/revenuecat/config.ts';
import { RevenueCatEvidenceError } from '../_shared/revenuecat/normalization.ts';
import { ingestRevenueCatEvents } from '../_shared/revenuecat/service.ts';
import {
  createRevenueCatStore,
  type RevenueCatStore,
  RevenueCatStoreError,
} from '../_shared/revenuecat/store.ts';

interface ReconciliationDependencies {
  config: RevenueCatConfig;
  client: Pick<RevenueCatClient, 'getCustomerEvents'>;
  store: RevenueCatStore;
  checkLimit: (request: Request) => Promise<Response | null>;
}

const RECONCILIATION_BATCH_SIZE = 100;

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function reconciliationOffset(request: Request): number | null {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor === null) return 0;
  const match = /^v1:(0|[1-9]\d*)$/.exec(cursor);
  if (!match) return null;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) ? offset : null;
}

export function createRevenueCatReconciliationHandler(dependencies: ReconciliationDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }
    const authorization = request.headers.get('authorization');
    if (
      !authorization ||
      !(await timingSafeEqual(authorization, dependencies.config.reconciliationAuthorization))
    ) {
      return json({ error: 'unauthorized' }, 401);
    }

    const limited = await dependencies.checkLimit(request);
    if (limited) return limited;

    const offset = reconciliationOffset(request);
    if (offset === null) {
      return json({ status: 'error', error: 'invalid_request' }, 400);
    }

    try {
      let reconciled = 0;
      const identities = await dependencies.store.listIdentities(
        dependencies.config.environment,
        offset,
        RECONCILIATION_BATCH_SIZE + 1,
      );
      const batch = identities.slice(0, RECONCILIATION_BATCH_SIZE);
      for (const identity of batch) {
        const events = await dependencies.client.getCustomerEvents(identity.customerId);
        const result = await ingestRevenueCatEvents(
          events,
          dependencies.config,
          dependencies.store,
          { identity, expectedCustomerId: identity.customerId },
        );
        reconciled += result.recognized;
      }

      const hasMore = identities.length > RECONCILIATION_BATCH_SIZE;
      return json({
        status: hasMore ? 'partial' : 'confirmed',
        reconciled,
        next_cursor: hasMore ? `v1:${offset + RECONCILIATION_BATCH_SIZE}` : null,
      });
    } catch (error) {
      if (error instanceof RevenueCatUnavailableError || error instanceof RevenueCatStoreError) {
        return json({ status: 'error', error: 'temporarily_unavailable' }, 503, {
          'Retry-After': '60',
        });
      }
      if (error instanceof RevenueCatEvidenceError) {
        return json({ status: 'error', error: 'invalid_evidence' }, 400);
      }
      return json({ status: 'error', error: 'internal_error' }, 500);
    }
  };
}

async function productionHandler(request: Request): Promise<Response> {
  const logger = createLogger('revenuecat-reconcile');
  const envError = validateEnv('revenuecat-reconcile', request);
  if (envError) return envError;

  try {
    const admin = createAdminClient();
    const config = readRevenueCatConfig();
    const handler = createRevenueCatReconciliationHandler({
      config,
      client: new RevenueCatClient(config),
      store: createRevenueCatStore(admin),
      checkLimit: async (incoming) => {
        const result = await checkRateLimit(
          admin,
          getClientIp(incoming) ?? 'unknown',
          RATE_LIMITS['revenuecat-reconcile'],
        );
        return result.allowed
          ? null
          : rateLimitResponse(incoming, result, RATE_LIMITS['revenuecat-reconcile']);
      },
    });
    const response = await handler(request);
    logger.info('Request completed', { httpStatus: response.status });
    return response;
  } catch {
    logger.error('Request failed', {
      errorCode: 'configuration_or_runtime_error',
    });
    return json({ status: 'error', error: 'temporarily_unavailable' }, 503, {
      'Retry-After': '60',
    });
  }
}

if (import.meta.main) Deno.serve(productionHandler);
