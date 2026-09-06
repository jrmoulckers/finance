// SPDX-License-Identifier: BUSL-1.1

/**
 * `entitlements-v1` — the versioned, minimized entitlement endpoint (#4403).
 *
 * `GET /functions/v1/entitlements-v1[?household_id=<uuid>]`
 *
 * The response is derived **solely** from `public.get_my_entitlements`, which
 * is `SECURITY DEFINER`, binds every lookup to `auth.uid()`, and refuses a
 * household the caller is not an active member of. The endpoint therefore
 * never accepts a client-supplied tier, allowance, provider, customer,
 * product, purchase, expiry, or entitlement subject: the only request
 * parameter is a household the server independently re-authorizes, and any
 * other parameter is rejected outright.
 *
 * Every failure — unauthenticated, forbidden, malformed, unknown, stale, or
 * projection-unavailable — is explicit and non-authorizing. Nothing in this
 * function logs the response, account identifiers, household identifiers, or
 * provider material.
 *
 * @module
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { checkRateLimit, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { type EntitlementErrorCode, parseProjectionRow, toEnvelope } from './contract.ts';

const FUNCTION_NAME = 'entitlements-v1';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The only query parameter this endpoint understands. */
const HOUSEHOLD_PARAM = 'household_id';

/** PostgreSQL `insufficient_privilege`, raised for auth or membership denial. */
const INSUFFICIENT_PRIVILEGE = '42501';

/** A denial the caller can act on. Never carries provider or ledger detail. */
export class EntitlementRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 429,
    readonly code: EntitlementErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'EntitlementRequestError';
  }
}

/** The projection could not be read or understood. Always fails closed. */
export class EntitlementUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementUnavailableError';
  }
}

/** Reads the raw minimized projection row for an authenticated caller. */
export interface EntitlementProjectionSource {
  load(request: Request, householdId: string | null): Promise<unknown>;
}

/** Enforces the per-caller request budget. */
export type EntitlementRateLimiter = (ownerId: string) => Promise<void>;

interface HandlerDependencies {
  source?: EntitlementProjectionSource;
  authenticate?: typeof requireAuth;
  enforceRateLimit?: EntitlementRateLimiter;
}

export function createEntitlementsHandler(deps: HandlerDependencies = {}) {
  const source = deps.source ?? defaultProjectionSource();
  const authenticate = deps.authenticate ?? requireAuth;
  const enforceRateLimit = deps.enforceRateLimit ?? defaultRateLimiter;

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest(request);
    }
    if (request.method !== 'GET') {
      return failure(request, 405, 'method_not_allowed', 'Method not allowed');
    }

    let user;
    try {
      user = await authenticate(request);
    } catch {
      // The shared helper throws its own bare Response. Normalize it so every
      // failure carries the documented code, CORS headers, and no-store, and
      // so nothing from the auth layer leaks into the body.
      return failure(request, 401, 'unauthenticated', 'Authentication required');
    }

    let householdId: string | null;
    try {
      householdId = readHouseholdParam(request);
      await enforceRateLimit(user.id);
    } catch (error) {
      return denial(request, error);
    }

    let raw: unknown;
    try {
      raw = await source.load(request, householdId);
    } catch (error) {
      return denial(request, error);
    }

    const row = parseProjectionRow(raw, householdId !== null);
    if (row === null) {
      // Malformed, unknown, or internally inconsistent projection state must
      // never authorize a cost-incurring action.
      return failure(
        request,
        503,
        'projection_unavailable',
        'Entitlement projection is temporarily unavailable',
        { 'Retry-After': '30' },
      );
    }

    return json(request, 200, toEnvelope(row));
  };
}

/**
 * Read the single supported parameter.
 *
 * Any additional parameter is rejected so a modified client cannot smuggle an
 * alternative entitlement subject past the server-resolved identity.
 */
function readHouseholdParam(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (key !== HOUSEHOLD_PARAM) {
      throw new EntitlementRequestError(400, 'invalid_request', 'Unsupported request parameter');
    }
  }
  const values = params.getAll(HOUSEHOLD_PARAM);
  if (values.length === 0) return null;
  if (values.length > 1) {
    throw new EntitlementRequestError(400, 'invalid_request', 'Unsupported request parameter');
  }
  const value = values[0];
  if (!UUID_PATTERN.test(value)) {
    throw new EntitlementRequestError(400, 'invalid_request', 'Invalid household');
  }
  return value;
}

function defaultRateLimiter(ownerId: string): Promise<void> {
  return checkRateLimit(createAdminClient(), ownerId, RATE_LIMITS[FUNCTION_NAME]).then((result) => {
    if (!result.allowed) {
      throw new EntitlementRequestError(
        429,
        'rate_limited',
        'Too many entitlement requests',
        result.retryAfterSeconds,
      );
    }
  });
}

function defaultProjectionSource(): EntitlementProjectionSource {
  return {
    async load(request, householdId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authorization = request.headers.get('Authorization');
      if (!supabaseUrl || !anonKey || !authorization) {
        throw new EntitlementUnavailableError('Entitlement projection is not configured');
      }
      // The caller's own credential is forwarded so `auth.uid()` inside the
      // SECURITY DEFINER projection resolves to the authenticated principal.
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await client.rpc('get_my_entitlements', {
        p_household_id: householdId,
      });
      if (error) {
        if (error.code === INSUFFICIENT_PRIVILEGE) {
          throw new EntitlementRequestError(403, 'forbidden', 'Household is not available');
        }
        throw new EntitlementUnavailableError('Entitlement projection lookup failed');
      }
      return Array.isArray(data) ? data[0] : data;
    },
  };
}

function denial(request: Request, error: unknown): Response {
  if (error instanceof EntitlementRequestError) {
    return failure(
      request,
      error.status,
      error.code,
      error.message,
      error.retryAfterSeconds === undefined
        ? {}
        : { 'Retry-After': String(error.retryAfterSeconds) },
    );
  }
  return failure(
    request,
    503,
    'projection_unavailable',
    'Entitlement projection is temporarily unavailable',
    { 'Retry-After': '30' },
  );
}

function failure(
  request: Request,
  status: number,
  code: EntitlementErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return json(request, status, { error: message, code }, headers);
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

const applicationHandler = createEntitlementsHandler();
export const handler = (request: Request): Promise<Response> => {
  // `validateEnv` returns its own bare Response. Normalize it so a
  // misconfigured deployment still answers with the documented envelope, CORS
  // headers, and no-store rather than a shape no client contract describes.
  // A preflight is answered first so a misconfiguration cannot present as a
  // CORS failure in the browser.
  if (request.method === 'OPTIONS') {
    return Promise.resolve(handleCorsPreflightRequest(request));
  }
  const envError = validateEnv(FUNCTION_NAME, request);
  if (envError !== null) {
    return Promise.resolve(
      failure(
        request,
        503,
        'projection_unavailable',
        'Entitlement projection is temporarily unavailable',
        { 'Retry-After': '30' },
      ),
    );
  }
  return applicationHandler(request);
};
if (import.meta.main) Deno.serve(handler);
