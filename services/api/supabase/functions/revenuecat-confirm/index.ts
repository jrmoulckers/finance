// SPDX-License-Identifier: BUSL-1.1

import { type AuthenticatedUser, createAdminClient, requireAuth } from '../_shared/auth.ts';
import { createClient } from '@supabase/supabase-js';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '../_shared/rate-limit.ts';
import { RevenueCatClient, RevenueCatUnavailableError } from '../_shared/revenuecat/client.ts';
import { readRevenueCatConfig, type RevenueCatConfig } from '../_shared/revenuecat/config.ts';
import { RevenueCatEvidenceError } from '../_shared/revenuecat/normalization.ts';
import { confirmRevenueCatPurchase } from '../_shared/revenuecat/service.ts';
import {
  createRevenueCatStore,
  type RevenueCatStore,
  RevenueCatStoreError,
} from '../_shared/revenuecat/store.ts';
import { errorResponse, jsonResponse, methodNotAllowedResponse } from '../_shared/response.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CONFIRMATION_BYTES = 8 * 1024;
const ALLOWED_CONFIRMATION_FIELDS = new Set(['operation', 'app_id', 'environment', 'household_id']);

interface ConfirmationDependencies {
  authenticate: (request: Request) => Promise<AuthenticatedUser>;
  config: RevenueCatConfig;
  client: Pick<RevenueCatClient, 'getCustomerEvents'>;
  store: RevenueCatStore;
  checkLimit: (userId: string, request: Request) => Promise<Response | null>;
}

interface ConfirmationBody {
  operation: 'confirm' | 'restore';
  app_id: string;
  environment: string;
  household_id?: string | null;
}

function confirmationResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
  retryAfter?: string,
): Response {
  const response = jsonResponse(request, body, status);
  response.headers.set('Cache-Control', 'no-store');
  if (retryAfter) response.headers.set('Retry-After', retryAfter);
  return response;
}

function parseBody(value: unknown): ConfirmationBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ALLOWED_CONFIRMATION_FIELDS.has(key))) {
    return null;
  }
  if (
    (body.operation !== 'confirm' && body.operation !== 'restore') ||
    typeof body.app_id !== 'string' ||
    typeof body.environment !== 'string' ||
    (body.household_id !== undefined &&
      body.household_id !== null &&
      (typeof body.household_id !== 'string' || !UUID_PATTERN.test(body.household_id)))
  ) {
    return null;
  }
  return body as unknown as ConfirmationBody;
}

export function createRevenueCatConfirmationHandler(dependencies: ConfirmationDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(request);
    }
    if (request.method !== 'POST' && request.method !== 'GET') {
      return methodNotAllowedResponse(request);
    }

    let user: AuthenticatedUser;
    try {
      user = await dependencies.authenticate(request);
    } catch (response) {
      return response as Response;
    }

    const limited = await dependencies.checkLimit(user.id, request);
    if (limited) return limited;

    if (request.method === 'GET') {
      const householdId = new URL(request.url).searchParams.get('household_id');
      if (householdId && !UUID_PATTERN.test(householdId)) {
        return confirmationResponse(
          request,
          {
            status: 'error',
            error: 'invalid_request',
          },
          400,
        );
      }
      try {
        if (
          householdId &&
          !(await dependencies.store.verifyHouseholdMembership(user.id, householdId))
        ) {
          return confirmationResponse(
            request,
            { status: 'error', error: 'household_access_denied' },
            403,
          );
        }
        return confirmationResponse(request, {
          status: 'confirmed',
          entitlement: await dependencies.store.getProjection(user.id, householdId),
        });
      } catch {
        return confirmationResponse(
          request,
          { status: 'error', error: 'temporarily_unavailable' },
          503,
          '60',
        );
      }
    }

    let body: ConfirmationBody | null;
    try {
      const declaredLength = Number(request.headers.get('content-length') ?? 0);
      if (declaredLength > MAX_CONFIRMATION_BYTES) {
        return confirmationResponse(
          request,
          {
            status: 'error',
            error: 'invalid_request',
          },
          413,
        );
      }
      const rawBody = await request.text();
      if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_CONFIRMATION_BYTES) {
        return confirmationResponse(
          request,
          {
            status: 'error',
            error: 'invalid_request',
          },
          413,
        );
      }
      body = parseBody(JSON.parse(rawBody));
    } catch {
      body = null;
    }
    if (!body) {
      return confirmationResponse(
        request,
        {
          status: 'error',
          error: 'invalid_request',
        },
        400,
      );
    }

    try {
      const result = await confirmRevenueCatPurchase(
        user.id,
        body.household_id ?? null,
        body.app_id,
        body.environment,
        dependencies.config,
        dependencies.client,
        dependencies.store,
      );
      return confirmationResponse(request, { ...result });
    } catch (error) {
      if (error instanceof RevenueCatUnavailableError || error instanceof RevenueCatStoreError) {
        return confirmationResponse(
          request,
          { status: 'error', error: 'temporarily_unavailable' },
          503,
          '60',
        );
      }
      if (error instanceof RevenueCatEvidenceError) {
        return confirmationResponse(
          request,
          {
            status: 'error',
            error: 'invalid_evidence',
          },
          400,
        );
      }
      if (error instanceof Error && error.message === 'household_access_denied') {
        return confirmationResponse(
          request,
          { status: 'error', error: 'household_access_denied' },
          403,
        );
      }
      return confirmationResponse(
        request,
        {
          status: 'error',
          error: 'invalid_request',
        },
        400,
      );
    }
  };
}

async function productionHandler(request: Request): Promise<Response> {
  const logger = createLogger('revenuecat-confirm');
  const envError = validateEnv('revenuecat-confirm', request);
  if (envError) return envError;

  try {
    const admin = createAdminClient();
    const config = readRevenueCatConfig();
    const projectionClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: {
            Authorization: request.headers.get('Authorization') ?? '',
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const handler = createRevenueCatConfirmationHandler({
      authenticate: requireAuth,
      config,
      client: new RevenueCatClient(config),
      store: createRevenueCatStore(admin, projectionClient),
      checkLimit: async (userId, incoming) => {
        const result = await checkRateLimit(admin, userId, RATE_LIMITS['revenuecat-confirm']);
        return result.allowed
          ? null
          : rateLimitResponse(incoming, result, RATE_LIMITS['revenuecat-confirm']);
      },
    });
    const response = await handler(request);
    logger.info('Request completed', { httpStatus: response.status });
    return response;
  } catch {
    logger.error('Request failed', {
      errorCode: 'configuration_or_runtime_error',
    });
    return errorResponse(request, 'temporarily_unavailable', 503);
  }
}

if (import.meta.main) Deno.serve(productionHandler);
