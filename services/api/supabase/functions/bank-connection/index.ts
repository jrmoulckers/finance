// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. Has tests but depends
// on Plaid/MX provider integration (PLAID_CLIENT_ID, PLAID_SECRET, etc.)
// that is not configured. Post-alpha feature. Exclude from alpha
// deployment. (#1390)

/**
 * Bank Connection API Edge Function (#265)
 *
 * Manages bank connections via Plaid and MX aggregators. Provides
 * link token creation, access token exchange, and connection management.
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
// Encryption stub
// ---------------------------------------------------------------------------

/**
 * Encrypt an access token for storage. Uses AES-256-GCM via Web Crypto API.
 *
 * In production, BANK_ENCRYPTION_KEY provides the key material.
 * This is a stub — the actual implementation will use crypto.subtle.
 *
 * NEVER log the plaintext token or the encryption key.
 */
async function encryptAccessToken(plaintext: string): Promise<string> {
  const key = Deno.env.get('BANK_ENCRYPTION_KEY');
  if (!key) {
    throw new Error('BANK_ENCRYPTION_KEY not configured');
  }

  // Stub: In production, use AES-256-GCM with crypto.subtle
  // For now, encode as base64 with a prefix to indicate encryption
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);

  // Format: base64(iv):base64(ciphertext)
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));

  return `aes256gcm:${ivB64}:${ctB64}`;
}

// ---------------------------------------------------------------------------
// Provider API stubs
// ---------------------------------------------------------------------------

/**
 * Create a link token via the provider's API.
 *
 * STUB: In production, this calls the Plaid or MX API.
 * Returns a link_token that the client uses to launch the
 * provider's connection UI.
 */
async function createProviderLinkToken(
  provider: Provider,
  _userId: string,
): Promise<{ link_token: string; expiration: string }> {
  // Plaid: POST /link/token/create
  // MX: POST /users/{user_guid}/connect_widget_url
  if (provider === 'plaid') {
    const clientId = Deno.env.get('PLAID_CLIENT_ID');
    const secret = Deno.env.get('PLAID_SECRET');
    const environment = Deno.env.get('PLAID_ENVIRONMENT') ?? 'sandbox';

    if (!clientId || !secret) {
      throw new Error('Plaid credentials not configured');
    }

    // STUB: Would call Plaid API here
    // const response = await fetch(`https://${environment}.plaid.com/link/token/create`, { ... });
    void environment;
    return {
      link_token: `link-${provider}-${crypto.randomUUID()}`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  } else {
    const clientId = Deno.env.get('MX_CLIENT_ID');
    const apiKey = Deno.env.get('MX_API_KEY');

    if (!clientId || !apiKey) {
      throw new Error('MX credentials not configured');
    }

    // STUB: Would call MX API here
    return {
      link_token: `link-${provider}-${crypto.randomUUID()}`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }
}

/**
 * Exchange a public token for an access token via the provider's API.
 *
 * STUB: In production, this calls Plaid's /item/public_token/exchange
 * or the MX equivalent.
 *
 * NEVER log the returned access token.
 */
async function exchangeProviderToken(
  provider: Provider,
  publicToken: string,
): Promise<{ access_token: string; item_id: string }> {
  void publicToken;

  if (provider === 'plaid') {
    // STUB: Would call POST /item/public_token/exchange
    return {
      access_token: `access-${provider}-${crypto.randomUUID()}`,
      item_id: `item-${crypto.randomUUID()}`,
    };
  } else {
    // STUB: Would call MX API
    return {
      access_token: `access-${provider}-${crypto.randomUUID()}`,
      item_id: `member-${crypto.randomUUID()}`,
    };
  }
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

      const linkResult = await createProviderLinkToken(body.provider, user.id);

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
      const exchangeResult = await exchangeProviderToken(body.provider, body.public_token);

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
    // DELETE — Soft-delete
    // -----------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const connectionId = url.searchParams.get('id');
      if (!connectionId) {
        return errorResponse(req, 'id query parameter is required');
      }

      const { data: existing, error: fetchError } = await supabase
        .from('bank_connections')
        .select('id, household_id')
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

      const { error: deleteError } = await supabase
        .from('bank_connections')
        .update({ deleted_at: new Date().toISOString(), status: 'disconnected' })
        .eq('id', connectionId);

      if (deleteError) {
        logger.error('Failed to soft-delete bank connection', {
          errorMessage: deleteError.message,
        });
        return internalErrorResponse(req);
      }

      logger.info('Bank connection soft-deleted', { connectionId, httpStatus: 204 });
      return noContentResponse(req);
    }

    return methodNotAllowedResponse(req);
  } catch (err) {
    logger.error('Bank connection error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
