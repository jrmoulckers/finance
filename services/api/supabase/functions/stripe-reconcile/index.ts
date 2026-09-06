// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { StripeRestGateway } from '../stripe-common/client.ts';
import { loadStripeRuntimeConfig } from '../stripe-common/config.ts';
import { normalizeReconciledSubscription } from '../stripe-common/normalize.ts';
import { findOwnedStripeIdentity, recordAndApplyStripeEvidence } from '../stripe-common/store.ts';
import { StripeRequestError, StripeServiceError } from '../stripe-common/types.ts';

const RECONCILE_RATE_LIMIT = {
  maxRequests: 6,
  windowSeconds: 3_600,
  keyPrefix: 'stripe-reconcile',
  failMode: 'closed' as const,
};

interface ReconcileService {
  reconcile(ownerId: string): Promise<number>;
}

interface ReconcileHandlerDependencies {
  service?: ReconcileService;
  authenticate?: typeof requireAuth;
}

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
  return {
    async reconcile(ownerId) {
      const config = loadStripeRuntimeConfig();
      const supabase = createAdminClient();
      const rateLimit = await checkRateLimit(supabase, ownerId, RECONCILE_RATE_LIMIT);
      if (!rateLimit.allowed) {
        throw new StripeRequestError(429, 'Too many reconciliation requests');
      }
      const identity = await findOwnedStripeIdentity({
        supabase,
        ownerId,
        environment: config.environment,
      });
      if (!identity) return 0;

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
    },
  };
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

export const handler = createStripeReconcileHandler();
if (import.meta.main) Deno.serve(handler);
