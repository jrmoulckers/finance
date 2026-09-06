// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient } from '../_shared/auth.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitResponse,
} from '../_shared/rate-limit.ts';
import { readRevenueCatConfig, type RevenueCatConfig } from '../_shared/revenuecat/config.ts';
import {
  parseRevenueCatWebhookBody,
  RevenueCatEvidenceError,
} from '../_shared/revenuecat/normalization.ts';
import { ingestRevenueCatEvents } from '../_shared/revenuecat/service.ts';
import {
  createRevenueCatStore,
  type RevenueCatStore,
  RevenueCatStoreError,
} from '../_shared/revenuecat/store.ts';
import { verifyRevenueCatWebhook } from '../_shared/revenuecat/signature.ts';

const MAX_WEBHOOK_BYTES = 256 * 1024;

interface WebhookDependencies {
  config: RevenueCatConfig;
  store: RevenueCatStore;
  checkLimit: (request: Request) => Promise<Response | null>;
  nowMs?: () => number;
}

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function createRevenueCatWebhookHandler(dependencies: WebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    const limited = await dependencies.checkLimit(request);
    if (limited) return limited;

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_WEBHOOK_BYTES) {
      return json({ error: 'invalid_evidence' }, 413);
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_WEBHOOK_BYTES) {
      return json({ error: 'invalid_evidence' }, 413);
    }
    if (
      !(await verifyRevenueCatWebhook(
        request.headers,
        rawBody,
        dependencies.config.webhookAuthorization,
        dependencies.config.webhookSignatureSecrets,
        dependencies.nowMs?.(),
      ))
    ) {
      return json({ error: 'unauthorized' }, 401);
    }

    try {
      const event = parseRevenueCatWebhookBody(rawBody);
      await ingestRevenueCatEvents([event], dependencies.config, dependencies.store);
      return json({ received: true });
    } catch (error) {
      if (error instanceof RevenueCatEvidenceError) {
        return json({ error: 'invalid_evidence' }, 400);
      }
      if (error instanceof RevenueCatStoreError) {
        return json({ error: 'temporarily_unavailable' }, 503, { 'Retry-After': '60' });
      }
      return json({ error: 'internal_error' }, 500);
    }
  };
}

async function productionHandler(request: Request): Promise<Response> {
  const logger = createLogger('revenuecat-webhook');
  const envError = validateEnv('revenuecat-webhook', request);
  if (envError) return envError;

  try {
    const admin = createAdminClient();
    const handler = createRevenueCatWebhookHandler({
      config: readRevenueCatConfig(),
      store: createRevenueCatStore(admin),
      checkLimit: async (incoming) => {
        const result = await checkRateLimit(
          admin,
          getClientIp(incoming) ?? 'unknown',
          RATE_LIMITS['revenuecat-webhook'],
        );
        return result.allowed
          ? null
          : rateLimitResponse(incoming, result, RATE_LIMITS['revenuecat-webhook']);
      },
    });
    const response = await handler(request);
    logger.info('Request completed', { httpStatus: response.status });
    return response;
  } catch {
    logger.error('Request failed', {
      errorCode: 'configuration_or_runtime_error',
    });
    return json({ error: 'temporarily_unavailable' }, 503, {
      'Retry-After': '60',
    });
  }
}

if (import.meta.main) Deno.serve(productionHandler);
