// SPDX-License-Identifier: BUSL-1.1

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  type BillingProjection,
  StripeRequestError,
  StripeServiceError,
} from '../stripe-common/types.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface StatusService {
  load(request: Request, ownerId: string, householdId: string | null): Promise<BillingProjection>;
}

interface StatusHandlerDependencies {
  service?: StatusService;
  authenticate?: typeof requireAuth;
}

export function createStripeStatusHandler(deps: StatusHandlerDependencies = {}) {
  const service = deps.service ?? defaultStatusService();
  const authenticate = deps.authenticate ?? requireAuth;
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(request);
    }
    if (request.method !== 'GET') {
      return json(request, 405, { error: 'Method not allowed' });
    }
    let user;
    try {
      user = await authenticate(request);
    } catch (response) {
      return response as Response;
    }

    const householdId = new URL(request.url).searchParams.get('household_id');
    if (householdId && !UUID_PATTERN.test(householdId)) {
      return json(request, 400, { error: 'Invalid household' });
    }
    try {
      return json(request, 200, {
        projection: await service.load(request, user.id, householdId),
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
            status === 403
              ? 'Household is not available'
              : 'Entitlement status temporarily unavailable',
        },
        status === 503 ? { 'Retry-After': '30' } : {},
      );
    }
  };
}

function defaultStatusService(): StatusService {
  return {
    async load(request, ownerId, householdId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authorization = request.headers.get('Authorization');
      if (!supabaseUrl || !anonKey || !authorization) {
        throw new StripeServiceError('Entitlement status is not configured', true);
      }
      const rateLimit = await checkRateLimit(
        createAdminClient(),
        ownerId,
        RATE_LIMITS['stripe-status'],
      );
      if (!rateLimit.allowed) {
        throw new StripeRequestError(429, 'Too many entitlement status requests');
      }
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await client.rpc('get_my_entitlements', {
        p_household_id: householdId,
      });
      if (error) {
        throw new StripeServiceError('Entitlement status lookup failed', false);
      }
      const projection = Array.isArray(data) ? data[0] : data;
      if (!isProjection(projection)) {
        throw new StripeServiceError('Entitlement status response invalid', true);
      }
      return projection;
    },
  };
}

function isProjection(value: unknown): value is BillingProjection {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.user_display_tier === 'free' ||
      record.user_display_tier === 'plus' ||
      record.user_display_tier === 'premium') &&
    (record.household_display_tier === null ||
      record.household_display_tier === 'free' ||
      record.household_display_tier === 'premium' ||
      record.household_display_tier === 'family') &&
    typeof record.bank_connection_allowance === 'number' &&
    typeof record.is_premium_sponsor === 'boolean' &&
    typeof record.is_family_bound === 'boolean' &&
    typeof record.effective_at === 'string' &&
    (record.expires_at === null || typeof record.expires_at === 'string') &&
    typeof record.projection_version === 'number' &&
    typeof record.server_time === 'string'
  );
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

const applicationHandler = createStripeStatusHandler();
export const handler = (request: Request): Promise<Response> => {
  const envError = validateEnv('stripe-status', request);
  return envError ? Promise.resolve(envError) : applicationHandler(request);
};
if (import.meta.main) Deno.serve(handler);
