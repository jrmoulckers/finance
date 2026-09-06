// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { StripeRestGateway } from '../stripe-common/client.ts';
import { loadStripePortalConfig } from '../stripe-common/config.ts';
import { findOwnedStripeIdentity } from '../stripe-common/store.ts';
import { StripeRequestError, StripeServiceError } from '../stripe-common/types.ts';

const PORTAL_RATE_LIMIT = {
  maxRequests: 10,
  windowSeconds: 60,
  keyPrefix: 'stripe-portal',
  failMode: 'closed' as const,
};

interface PortalService {
  create(ownerId: string): Promise<{ portalUrl: string }>;
}

interface PortalHandlerDependencies {
  service?: PortalService;
  authenticate?: typeof requireAuth;
}

export function createStripePortalHandler(deps: PortalHandlerDependencies = {}) {
  const service = deps.service ?? defaultPortalService();
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
      const result = await service.create(user.id);
      return json(request, 200, { portal_url: result.portalUrl });
    } catch (error) {
      const status =
        error instanceof StripeRequestError
          ? error.status
          : error instanceof StripeServiceError && !error.retryable
            ? 404
            : 503;
      return json(
        request,
        status,
        {
          error:
            status === 404
              ? 'No managed billing account is available'
              : 'Billing service temporarily unavailable',
        },
        status === 503 ? { 'Retry-After': '30' } : {},
      );
    }
  };
}

function defaultPortalService(): PortalService {
  return {
    async create(ownerId) {
      const config = loadStripePortalConfig();
      const supabase = createAdminClient();
      const rateLimit = await checkRateLimit(supabase, ownerId, PORTAL_RATE_LIMIT);
      if (!rateLimit.allowed) {
        throw new StripeRequestError(429, 'Too many billing portal requests');
      }
      const identity = await findOwnedStripeIdentity({
        supabase,
        ownerId,
        environment: config.environment,
      });
      if (!identity) {
        throw new StripeServiceError('Billing identity not found', false);
      }
      const session = await new StripeRestGateway(config.secretKey).createPortalSession({
        customerId: identity.providerCustomerId,
        returnUrl: config.portalReturnUrl,
      });
      if (!session.url) {
        throw new StripeServiceError('Portal URL missing', true);
      }
      return { portalUrl: session.url };
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

export const handler = createStripePortalHandler();
if (import.meta.main) Deno.serve(handler);
