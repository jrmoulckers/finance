// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { isStripeCatalogChoice, resolveCatalogChoice } from '../stripe-common/catalog.ts';
import { StripeRestGateway } from '../stripe-common/client.ts';
import { loadStripeCheckoutConfig } from '../stripe-common/config.ts';
import {
  ensureStripeBillingContext,
  requireHouseholdMembership,
  requirePremiumAddonEligibility,
} from '../stripe-common/store.ts';
import {
  type StripeCatalogChoice,
  StripeRequestError,
  StripeServiceError,
} from '../stripe-common/types.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = new Set(['catalog_choice', 'household_intent']);

interface CheckoutService {
  create(input: {
    ownerId: string;
    catalogChoice: StripeCatalogChoice;
    householdIntent: string | null;
  }): Promise<{ checkoutUrl: string }>;
}

interface CheckoutHandlerDependencies {
  service?: CheckoutService;
  authenticate?: typeof requireAuth;
}

export function createStripeCheckoutHandler(deps: CheckoutHandlerDependencies = {}) {
  const service = deps.service ?? defaultCheckoutService();
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json(request, 400, { error: 'Invalid request' });
    }
    if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
      return json(request, 400, { error: 'Unsupported checkout field' });
    }
    if (!isStripeCatalogChoice(body.catalog_choice)) {
      return json(request, 400, { error: 'Unknown catalog choice' });
    }
    const householdIntent = body.household_intent;
    if (
      householdIntent !== undefined &&
      (typeof householdIntent !== 'string' || !UUID_PATTERN.test(householdIntent))
    ) {
      return json(request, 400, { error: 'Invalid household intent' });
    }

    try {
      const result = await service.create({
        ownerId: user.id,
        catalogChoice: body.catalog_choice,
        householdIntent: householdIntent ?? null,
      });
      return json(request, 201, {
        state: 'pending',
        checkout_url: result.checkoutUrl,
      });
    } catch (error) {
      const status =
        error instanceof StripeRequestError
          ? error.status
          : error instanceof StripeServiceError && !error.retryable
            ? 403
            : 503;
      return json(
        request,
        status,
        {
          error:
            status < 500
              ? error instanceof Error
                ? error.message
                : 'Purchase is not eligible'
              : 'Billing service temporarily unavailable',
        },
        status === 503 ? { 'Retry-After': '30' } : {},
      );
    }
  };
}

function defaultCheckoutService(): CheckoutService {
  return {
    async create(input) {
      const config = loadStripeCheckoutConfig();
      const gateway = new StripeRestGateway(config.secretKey);
      const supabase = createAdminClient();
      const rateLimit = await checkRateLimit(
        supabase,
        input.ownerId,
        RATE_LIMITS['stripe-checkout'],
      );
      if (!rateLimit.allowed) {
        throw new StripeRequestError(429, 'Too many checkout requests');
      }
      const entry = resolveCatalogChoice(input.catalogChoice);
      if (entry.requiresHousehold && !input.householdIntent) {
        throw new StripeRequestError(400, 'This catalog choice requires a household');
      }
      if (!entry.requiresHousehold && input.householdIntent && entry.tier !== 'premium') {
        throw new StripeRequestError(400, 'This catalog choice is purchaser-scoped');
      }
      if (input.householdIntent) {
        await requireHouseholdMembership({
          supabase,
          ownerId: input.ownerId,
          householdId: input.householdIntent,
        });
      }
      const context = await ensureStripeBillingContext({
        supabase,
        gateway,
        ownerId: input.ownerId,
        environment: config.environment,
      });
      if (entry.logicalProduct === 'premium_bank_addon' && input.householdIntent) {
        await requirePremiumAddonEligibility({
          supabase,
          billingAccountId: context.billingAccountId,
          householdId: input.householdIntent,
        });
      }
      const timeBucket = Math.floor(Date.now() / (30 * 60 * 1000));
      const session = await gateway.createCheckoutSession({
        customerId: context.providerCustomerId,
        entry,
        billingAccountId: context.billingAccountId,
        ownerId: input.ownerId,
        householdId: input.householdIntent,
        successUrl: config.checkoutSuccessUrl,
        cancelUrl: config.checkoutCancelUrl,
        idempotencyKey:
          `finance-checkout:${config.environment}:${context.billingAccountId}:` +
          `${entry.choice}:${input.householdIntent ?? 'user'}:${timeBucket}`,
      });
      if (!session.url) {
        throw new StripeServiceError('Checkout URL missing', true);
      }
      return { checkoutUrl: session.url };
    },
  };
}

function json(
  request: Request,
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    ...getCorsHeaders(request),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

const applicationHandler = createStripeCheckoutHandler();
export const handler = (request: Request): Promise<Response> => {
  const envError = validateEnv('stripe-checkout', request);
  return envError ? Promise.resolve(envError) : applicationHandler(request);
};
if (import.meta.main) Deno.serve(handler);
