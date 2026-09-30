// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { billingAdapterDisabledResponse } from '../_shared/billing-adapter-control.ts';
import { timingSafeEqual } from '../_shared/crypto.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { StripeRestGateway } from '../stripe-common/client.ts';
import { loadStripeBaseConfig } from '../stripe-common/config.ts';
import { normalizeReconciledSubscription } from '../stripe-common/normalize.ts';
import {
  findOwnedStripeIdentity,
  listStripeIdentities,
  recordAndApplyStripeEvidence,
} from '../stripe-common/store.ts';
import { StripeRequestError, StripeServiceError } from '../stripe-common/types.ts';

interface ReconcileService {
  reconcile(ownerId: string): Promise<number>;
  reconcileBatch?(offset: number): Promise<{ reconciled: number; nextCursor: string | null }>;
}

interface ReconcileHandlerDependencies {
  service?: ReconcileService;
  authenticate?: typeof requireAuth;
  schedulerAuthorization?: string;
}

const RECONCILIATION_BATCH_SIZE = 100;

export function createStripeReconcileHandler(deps: ReconcileHandlerDependencies = {}) {
  const service = deps.service ?? defaultReconcileService();
  const authenticate = deps.authenticate ?? requireAuth;
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(request);
    }
    if (request.method !== 'POST') {
      return json(request, 405, { error: 'Method not allowed' });
    }
    const maintenanceTask = request.headers.get('X-Finance-Maintenance-Task');
    if (maintenanceTask === 'stripe-reconciliation') {
      if (
        !deps.schedulerAuthorization ||
        !(await timingSafeEqual(
          request.headers.get('Authorization') ?? '',
          deps.schedulerAuthorization,
        ))
      ) {
        return json(request, 401, { error: 'Unauthorized' });
      }
      const offset = reconciliationOffset(request);
      if (offset === null) return json(request, 400, { error: 'Invalid cursor' });
      try {
        if (!service.reconcileBatch) throw new Error('Scheduled reconciliation unavailable');
        return json(request, 200, {
          state: 'pending',
          ...(await service.reconcileBatch(offset)),
        });
      } catch {
        return json(
          request,
          503,
          { error: 'Billing reconciliation temporarily unavailable' },
          { 'Retry-After': '30' },
        );
      }
    }
    let user;
    try {
      user = await authenticate(request);
    } catch (response) {
      return response as Response;
    }
    try {
      const reconciled = await service.reconcile(user.id);
      return json(request, 200, { state: 'pending', reconciled });
    } catch (error) {
      if (error instanceof StripeRequestError) {
        return json(request, error.status, { error: error.message });
      }
      return json(
        request,
        503,
        { error: 'Billing reconciliation temporarily unavailable' },
        { 'Retry-After': '30' },
      );
    }
  };
}

function defaultReconcileService(): ReconcileService {
  async function reconcileIdentity(
    identity: NonNullable<Awaited<ReturnType<typeof findOwnedStripeIdentity>>>,
  ): Promise<number> {
    const config = loadStripeBaseConfig();
    const supabase = createAdminClient();
    const gateway = new StripeRestGateway(config.secretKey);
    if ((await gateway.retrieveAccount()).id !== config.accountId) {
      throw new StripeServiceError('Stripe account mismatch', false);
    }
    const subscriptions = await gateway.listSubscriptions(identity.providerCustomerId);
    let reconciled = 0;
    const reconciledAt = Math.floor(Date.now() / 1000);
    for (const subscription of subscriptions) {
      if (subscription.livemode !== (config.environment === 'production')) {
        throw new StripeServiceError('Stripe mode mismatch', false);
      }
      const invoice = subscription.latest_invoice
        ? await gateway.retrieveInvoice(subscription.latest_invoice)
        : null;
      const evidence = normalizeReconciledSubscription(subscription, invoice, reconciledAt);
      if (!evidence) continue;
      await recordAndApplyStripeEvidence({
        supabase,
        context: identity,
        environment: config.environment,
        evidence,
      });
      reconciled++;
    }
    return reconciled;
  }

  return {
    async reconcile(ownerId) {
      const config = loadStripeBaseConfig();
      const supabase = createAdminClient();
      const rateLimit = await checkRateLimit(supabase, ownerId, RATE_LIMITS['stripe-reconcile']);
      if (!rateLimit.allowed) {
        throw new StripeRequestError(429, 'Too many reconciliation requests');
      }
      const identity = await findOwnedStripeIdentity({
        supabase,
        ownerId,
        environment: config.environment,
      });
      if (!identity) return 0;
      return reconcileIdentity(identity);
    },
    async reconcileBatch(offset) {
      const config = loadStripeBaseConfig();
      const identities = await listStripeIdentities({
        supabase: createAdminClient(),
        environment: config.environment,
        offset,
        limit: RECONCILIATION_BATCH_SIZE + 1,
      });
      let reconciled = 0;
      for (const identity of identities.slice(0, RECONCILIATION_BATCH_SIZE)) {
        reconciled += await reconcileIdentity(identity);
      }
      return {
        reconciled,
        nextCursor:
          identities.length > RECONCILIATION_BATCH_SIZE
            ? `v1:${offset + RECONCILIATION_BATCH_SIZE}`
            : null,
      };
    },
  };
}

function reconciliationOffset(request: Request): number | null {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (cursor === null) return 0;
  const match = /^v1:(0|[1-9]\d*)$/.exec(cursor);
  if (!match) return null;
  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) ? offset : null;
}

function json(
  request: Request,
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

const applicationHandler = createStripeReconcileHandler({
  schedulerAuthorization: Deno.env.get('STRIPE_RECONCILIATION_AUTHORIZATION'),
});
export const handler = (request: Request): Promise<Response> => {
  if (request.method !== 'OPTIONS') {
    const disabled = billingAdapterDisabledResponse('stripe');
    if (disabled) return Promise.resolve(disabled);
  }
  const envError = validateEnv('stripe-reconcile', request);
  return envError ? Promise.resolve(envError) : applicationHandler(request);
};
if (import.meta.main) Deno.serve(handler);
