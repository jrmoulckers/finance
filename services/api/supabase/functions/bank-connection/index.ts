// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank Connection API Edge Function (#265, #3848)
 *
 * Manages bank connections via Plaid and MX aggregators. Provides
 * link token creation, access token exchange, and connection management.
 *
 * Plaid is the reference implementation (real REST calls via fetch). MX
 * remains a documented stub behind the same interface until its credentials
 * and endpoints are provisioned.
 *
 * Endpoints:
 *   POST ?action=create_link_token  — Generate a link token for Plaid/MX
 *   POST ?action=exchange_token     — Exchange public token for access token
 *   GET                             — List bank connections for household
 *   PUT                             — Update connection (re-auth, disconnect)
 *   DELETE                          — Soft-delete a bank connection
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Only household owners/admins can manage connections
 *   - Access tokens are encrypted before storage (AES-256-GCM)
 *   - NEVER returns access tokens in any response
 *   - NEVER logs access tokens or raw financial data
 *   - Provider API keys from environment variables only
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   PLAID_CLIENT_ID           — Plaid client ID
 *   PLAID_SECRET              — Plaid secret key
 *   PLAID_ENVIRONMENT         — Plaid environment (sandbox/development/production)
 *   MX_CLIENT_ID              — MX client ID
 *   MX_API_KEY                — MX API key
 *   BANK_ENCRYPTION_KEY       — AES-256 key for encrypting access tokens
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { encryptToken } from '../_shared/bank-crypto.ts';
import {
  createLinkToken as plaidCreateLinkToken,
  exchangePublicToken as plaidExchangePublicToken,
  PlaidApiError,
  type PlaidConfig,
} from '../_shared/plaid.ts';
import { revokeProviderToken } from '../_shared/bank-revocation.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  noContentResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Provider = 'plaid' | 'mx';
const VALID_PROVIDERS: readonly Provider[] = ['plaid', 'mx'];

interface CreateLinkTokenRequest {
  provider: Provider;
  household_id: string;
}

interface ExchangeTokenRequest {
  provider: Provider;
  household_id: string;
  public_token: string;
  institution_id: string;
  institution_name: string;
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt a provider access token for storage using AES-256-GCM.
 *
 * Key material comes from BANK_ENCRYPTION_KEY. NEVER log the plaintext token
 * or the key.
 */
async function encryptAccessToken(plaintext: string): Promise<string> {
  const key = Deno.env.get('BANK_ENCRYPTION_KEY');
  if (!key) {
    throw new Error('BANK_ENCRYPTION_KEY not configured');
  }
  return encryptToken(plaintext, key);
}

// ---------------------------------------------------------------------------
// Provider integrations
// ---------------------------------------------------------------------------

/** Read Plaid credentials from the environment. Throws if unset. */
function plaidConfigFromEnv(): PlaidConfig {
  const clientId = Deno.env.get('PLAID_CLIENT_ID');
  const secret = Deno.env.get('PLAID_SECRET');
  if (!clientId || !secret) {
    throw new Error('Plaid credentials not configured');
  }
  return {
    clientId,
    secret,
    environment: Deno.env.get('PLAID_ENVIRONMENT') ?? 'sandbox',
    webhookUrl: Deno.env.get('PLAID_WEBHOOK_URL') ?? undefined,
  };
}

/**
 * Create a link token via the provider's API.
 *
 * Plaid: real POST /link/token/create. MX: documented stub pending
 * credential provisioning.
 */
async function createProviderLinkToken(
  provider: Provider,
  userId: string,
): Promise<{ link_token: string; expiration: string }> {
  if (provider === 'plaid') {
    return plaidCreateLinkToken(plaidConfigFromEnv(), userId);
  }

  // MX stub — kept behind the same interface until MX is provisioned.
  const clientId = Deno.env.get('MX_CLIENT_ID');
  const apiKey = Deno.env.get('MX_API_KEY');
  if (!clientId || !apiKey) {
    throw new Error('MX credentials not configured');
  }
  return {
    link_token: `link-${provider}-${crypto.randomUUID()}`,
    expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

/**
 * Exchange a public token for an access token via the provider's API.
 *
 * NEVER log the returned access token.
 */
async function exchangeProviderToken(
  provider: Provider,
  publicToken: string,
): Promise<{ access_token: string; item_id: string }> {
  if (provider === 'plaid') {
    return plaidExchangePublicToken(plaidConfigFromEnv(), publicToken);
  }

  // MX stub — kept behind the same interface until MX is provisioned.
  const clientId = Deno.env.get('MX_CLIENT_ID');
  const apiKey = Deno.env.get('MX_API_KEY');
  if (!clientId || !apiKey) {
    throw new Error('MX credentials not configured');
  }
  return {
    access_token: `access-${provider}-${crypto.randomUUID()}`,
    item_id: `member-${crypto.randomUUID()}`,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('bank-connection');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('bank-connection', req);
  if (envError) return envError;

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['bank-connection']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['bank-connection']);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // -----------------------------------------------------------------------
    // POST ?action=create_link_token
    // -----------------------------------------------------------------------
    if (req.method === 'POST' && action === 'create_link_token') {
      const body = (await req.json()) as CreateLinkTokenRequest;

      if (!body.provider || !(VALID_PROVIDERS as readonly string[]).includes(body.provider)) {
        return errorResponse(req, `provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
      }
      if (!body.household_id) {
        return errorResponse(req, 'household_id is required');
      }

      // Verify household membership
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', body.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (memError || !membership) {
        return errorResponse(
          req,
          'Only household owners and admins can manage bank connections',
          403,
        );
      }

      const linkResult = await createProviderLinkToken(body.provider, user.id).catch(
        (err: unknown) => {
          if (err instanceof PlaidApiError) {
            logger.warn('Provider link token failed', {
              provider: body.provider,
              errorCode: err.errorCode,
            });
            return null;
          }
          throw err;
        },
      );

      if (!linkResult) {
        return errorResponse(req, 'Provider link token request failed', 502);
      }

      logger.info('Link token created', {
        provider: body.provider,
        httpStatus: 200,
      });

      return jsonResponse(req, {
        link_token: linkResult.link_token,
        expiration: linkResult.expiration,
      });
    }

    // -----------------------------------------------------------------------
    // POST ?action=exchange_token
    // -----------------------------------------------------------------------
    if (req.method === 'POST' && action === 'exchange_token') {
      const body = (await req.json()) as ExchangeTokenRequest;

      if (!body.provider || !(VALID_PROVIDERS as readonly string[]).includes(body.provider)) {
        return errorResponse(req, `provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
      }
      if (!body.household_id) return errorResponse(req, 'household_id is required');
      if (!body.public_token) return errorResponse(req, 'public_token is required');
      if (!body.institution_id) return errorResponse(req, 'institution_id is required');
      if (!body.institution_name) return errorResponse(req, 'institution_name is required');

      // Verify household membership
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', body.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (memError || !membership) {
        return errorResponse(
          req,
          'Only household owners and admins can manage bank connections',
          403,
        );
      }

      // Exchange public token for access token — NEVER log the access token
      const exchangeResult = await exchangeProviderToken(body.provider, body.public_token).catch(
        (err: unknown) => {
          if (err instanceof PlaidApiError) {
            logger.warn('Provider token exchange failed', {
              provider: body.provider,
              errorCode: err.errorCode,
            });
            return null;
          }
          throw err;
        },
      );

      if (!exchangeResult) {
        return errorResponse(req, 'Provider token exchange failed', 502);
      }

      // Encrypt access token before storage
      const encryptedToken = await encryptAccessToken(exchangeResult.access_token);

      // Store the connection
      const { data: connection, error: insertError } = await supabase
        .from('bank_connections')
        .insert({
          household_id: body.household_id,
          owner_id: user.id,
          provider: body.provider,
          institution_id: body.institution_id,
          institution_name: body.institution_name,
          encrypted_access_token: encryptedToken,
          status: 'active',
          metadata: { item_id: exchangeResult.item_id },
        })
        .select('id, provider, institution_name, status, created_at')
        .single();

      if (insertError) {
        logger.error('Failed to store bank connection', {
          errorMessage: insertError.message,
        });
        return internalErrorResponse(req);
      }

      logger.info('Bank connection created', {
        connectionId: connection.id,
        provider: body.provider,
        httpStatus: 201,
      });

      // NEVER return the access token
      return createdResponse(req, {
        id: connection.id,
        provider: connection.provider,
        institution_name: connection.institution_name,
        status: connection.status,
        created_at: connection.created_at,
      });
    }

    // -----------------------------------------------------------------------
    // GET — List connections
    // -----------------------------------------------------------------------
    if (req.method === 'GET') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId) {
        return errorResponse(req, 'household_id query parameter is required');
      }

      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', householdId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (memError || !membership) {
        return errorResponse(req, 'Household access denied', 403);
      }

      // NEVER include encrypted_access_token in response
      const { data: connections, error: listError } = await supabase
        .from('bank_connections')
        .select(
          'id, provider, institution_id, institution_name, status, last_synced_at, error_code, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (listError) {
        logger.error('Failed to list bank connections', { errorMessage: listError.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { connections: connections ?? [] });
    }

    // -----------------------------------------------------------------------
    // DELETE — Disconnect: revoke the provider token, purge it, soft-delete.
    // -----------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const connectionId = url.searchParams.get('id');
      if (!connectionId) {
        return errorResponse(req, 'id query parameter is required');
      }

      const { data: existing, error: fetchError } = await supabase
        .from('bank_connections')
        .select('id, household_id, provider, encrypted_access_token')
        .eq('id', connectionId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !existing) {
        return errorResponse(req, 'Bank connection not found', 404);
      }

      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', existing.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (memError || !membership) {
        return errorResponse(
          req,
          'Only household owners and admins can manage bank connections',
          403,
        );
      }

      // Best-effort revoke the token at the aggregator so the processor no
      // longer retains access on the user's behalf (#3867). NEVER throws —
      // a processor outage must not block the user's disconnect.
      const revocation = await revokeProviderToken({
        provider: existing.provider,
        encryptedAccessToken: existing.encrypted_access_token,
      });

      // Soft-delete AND purge the stored credential — even if revocation was
      // skipped/failed at the provider, we must not keep the token at rest.
      const { error: deleteError } = await supabase
        .from('bank_connections')
        .update({
          deleted_at: new Date().toISOString(),
          status: 'disconnected',
          encrypted_access_token: null,
        })
        .eq('id', connectionId);

      if (deleteError) {
        logger.error('Failed to soft-delete bank connection', {
          errorMessage: deleteError.message,
        });
        return internalErrorResponse(req);
      }

      // Audit the revocation attempt (best-effort — never block the response).
      const auditStatus =
        revocation.outcome === 'revoked'
          ? 'success'
          : revocation.outcome === 'skipped'
            ? 'partial'
            : 'failure';
      const { error: auditError } = await supabase.from('connector_access_log').insert({
        bank_connection_id: connectionId,
        household_id: existing.household_id,
        access_type: 'revoke_access',
        provider_name: existing.provider,
        status: auditStatus,
        error_message: revocation.detail ?? null,
      });
      if (auditError) {
        logger.warn('Failed to write revocation audit log', {
          errorMessage: auditError.message,
        });
      }

      logger.info('Bank connection disconnected', {
        connectionId,
        revocationOutcome: revocation.outcome,
        httpStatus: 204,
      });
      return noContentResponse(req);
    }

    return methodNotAllowedResponse(req);
  } catch (err) {
    logger.error('Bank connection error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
