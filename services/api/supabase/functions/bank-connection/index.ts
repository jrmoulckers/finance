// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank Connection API Edge Function (#265, #3848)
 *
 * Manages bank connections via Plaid and MX aggregators. Provides
 * link token creation, access token exchange, and connection management.
 *
 * Plaid and MX are both real implementations (direct REST calls via fetch).
 * TrueLayer and Finicity remain disabled placeholders in the provider registry
 * and are never routed to.
 *
 * Provider credential models differ and are normalized behind this function:
 *   - Plaid: `public_token` is exchanged for an `access_token` + `item_id`.
 *   - MX: the connect widget returns a `member_guid`, which is paired with the
 *     user's MX `user_guid` into one opaque credential (see `_shared/mx.ts`).
 *     The client posts that `member_guid` as `public_token`.
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
 *   MX_ENVIRONMENT            — MX environment (sandbox/integration/production)
 *   BANK_ENCRYPTION_KEY       — AES-256 key for encrypting access tokens
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { encryptToken } from '../_shared/bank-crypto.ts';
import { ensureCanManageHousehold } from '../_shared/bank-authorization.ts';
import {
  checkConnectionCap,
  connectionCapMessage,
  resolveConnectionCap,
} from '../_shared/bank-entitlements.ts';
import {
  createLinkToken as plaidCreateLinkToken,
  exchangePublicToken as plaidExchangePublicToken,
  getAccounts as plaidGetAccounts,
  plaidAccountTypeToInternal,
  PlaidApiError,
  type InternalAccountType,
  type PlaidAccount,
  type PlaidConfig,
} from '../_shared/plaid.ts';
import {
  createWidgetUrl as mxCreateWidgetUrl,
  encodeMxCredential,
  decodeMxCredential,
  ensureUser as mxEnsureUser,
  getAccounts as mxGetAccounts,
  mxAccountTypeToInternal,
  MxApiError,
  type MxConfig,
} from '../_shared/mx.ts';
import {
  ingestMxTransactions,
  ingestPlaidTransactions,
  type BankConnectionRow,
  type IngestionSummary,
} from '../_shared/bank-ingest.ts';
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

type AdminClient = ReturnType<typeof createAdminClient>;
type FunctionLogger = ReturnType<typeof createLogger>;

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

/** Read MX credentials from the environment. Throws if unset. */
function mxConfigFromEnv(): MxConfig {
  const clientId = Deno.env.get('MX_CLIENT_ID');
  const apiKey = Deno.env.get('MX_API_KEY');
  if (!clientId || !apiKey) {
    throw new Error('MX credentials not configured');
  }
  return {
    clientId,
    apiKey,
    environment: Deno.env.get('MX_ENVIRONMENT') ?? 'sandbox',
  };
}

/**
 * Create a link token via the provider's API.
 *
 * Plaid: POST /link/token/create, returning a Link token.
 * MX: POST /users/{guid}/widget_urls, returning a connect-widget URL. Both are
 * opaque to the client, which only forwards them to the provider's SDK.
 */
async function createProviderLinkToken(
  provider: Provider,
  userId: string,
): Promise<{ link_token: string; expiration: string }> {
  if (provider === 'plaid') {
    return plaidCreateLinkToken(plaidConfigFromEnv(), userId);
  }

  const config = mxConfigFromEnv();
  const userGuid = await mxEnsureUser(config, userId);
  return mxCreateWidgetUrl(config, userGuid);
}

/**
 * Exchange the client's post-link handle for the stored provider credential.
 *
 * Plaid: real POST /item/public_token/exchange.
 * MX: the widget returns a `member_guid` (posted as `public_token`); it is
 * paired with the user's MX `user_guid` into one opaque credential, because
 * every MX data call needs both.
 *
 * NEVER log the returned credential.
 */
async function exchangeProviderToken(
  provider: Provider,
  publicToken: string,
  userId: string,
): Promise<{ access_token: string; item_id: string }> {
  if (provider === 'plaid') {
    return plaidExchangePublicToken(plaidConfigFromEnv(), publicToken);
  }

  const config = mxConfigFromEnv();
  const userGuid = await mxEnsureUser(config, userId);
  // The widget hands back only the member guid; tolerate a client that already
  // sends the full pair so both widget integrations work.
  const memberGuid = publicToken.includes(':')
    ? decodeMxCredential(publicToken).memberGuid
    : publicToken;

  return {
    access_token: encodeMxCredential(userGuid, memberGuid),
    // `item_id` is the provider-side connection handle the webhook matches on.
    // For MX that is the member guid (see bank-webhook's MX lookup).
    item_id: memberGuid,
  };
}

// ---------------------------------------------------------------------------
// Account discovery + linking
// ---------------------------------------------------------------------------

/**
 * A provider's external account, normalized to the fields account provisioning
 * needs. Each provider maps its own payload (and its own account-type
 * taxonomy) into this shape so the linking loop stays provider-agnostic.
 */
interface ExternalAccount {
  externalId: string;
  displayName: string;
  internalType: InternalAccountType;
  currencyCode: string;
  balanceCents: number;
  externalType: string | null;
  externalSubtype: string | null;
}

/** Convert a possibly-absent major-unit balance to integer cents. */
function toBalanceCents(balance: number | null | undefined): number {
  return typeof balance === 'number' && Number.isFinite(balance) ? Math.round(balance * 100) : 0;
}

/** Normalize a Plaid account into the provider-agnostic shape. */
function plaidAccountToExternal(account: PlaidAccount): ExternalAccount {
  return {
    externalId: account.account_id,
    displayName: account.name ?? account.official_name ?? 'Account',
    internalType: plaidAccountTypeToInternal(account.type, account.subtype),
    currencyCode: account.balances?.iso_currency_code ?? 'USD',
    balanceCents: toBalanceCents(account.balances?.current),
    externalType: account.type,
    externalSubtype: account.subtype,
  };
}

/**
 * Discover the external accounts for a connection via the provider's API.
 *
 * Plaid: POST /accounts/get. MX: GET /users/{u}/members/{m}/accounts.
 */
async function discoverProviderAccounts(
  provider: Provider,
  accessToken: string,
): Promise<ExternalAccount[]> {
  if (provider === 'plaid') {
    const { accounts } = await plaidGetAccounts(plaidConfigFromEnv(), accessToken);
    return accounts.map(plaidAccountToExternal);
  }

  const config = mxConfigFromEnv();
  const { userGuid, memberGuid } = decodeMxCredential(accessToken);
  const { accounts } = await mxGetAccounts(config, userGuid, memberGuid);

  return accounts.map((account) => ({
    externalId: account.guid,
    displayName: account.name ?? 'Account',
    internalType: mxAccountTypeToInternal(account.type, account.subtype),
    currencyCode: account.currency_code ?? 'USD',
    balanceCents: toBalanceCents(account.balance),
    externalType: account.type,
    externalSubtype: account.subtype,
  }));
}

/**
 * Run the provider's initial transaction backfill for a freshly-linked
 * connection so transactions appear immediately (webhooks only deliver deltas
 * afterward). Provider-agnostic dispatch — mirrors the other provider helpers.
 */
async function runInitialProviderSync(
  supabase: AdminClient,
  provider: Provider,
  connection: BankConnectionRow,
  logger: FunctionLogger,
): Promise<IngestionSummary> {
  if (provider === 'plaid') {
    return ingestPlaidTransactions(supabase, connection, logger);
  }
  return ingestMxTransactions(supabase, connection, logger);
}

/**
 * Discover a connection's external accounts, provision a matching internal
 * `accounts` row for each, and insert the linked `bank_connection_accounts`
 * mapping (is_linked=true).
 *
 * Account linking is the HARD PREREQUISITE for transaction ingestion: both the
 * webhook and the initial sync DROP any transaction whose external account is
 * not linked here. Best-effort per account — a single failure is logged and
 * skipped so the remaining accounts still link.
 *
 * @returns The number of external accounts successfully linked.
 */
async function provisionAndLinkAccounts(
  supabase: AdminClient,
  params: {
    provider: Provider;
    accessToken: string;
    connectionId: string;
    householdId: string;
  },
  logger: FunctionLogger,
): Promise<number> {
  const externalAccounts = await discoverProviderAccounts(params.provider, params.accessToken);
  let linked = 0;

  for (const ext of externalAccounts) {
    // 1. Provision an internal Finance account for this external account.
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        household_id: params.householdId,
        name: ext.displayName,
        type: ext.internalType,
        currency_code: ext.currencyCode,
        balance_cents: ext.balanceCents,
        is_active: true,
      })
      .select('id')
      .single();

    if (accountError || !account) {
      logger.warn('Failed to provision internal account', {
        connectionId: params.connectionId,
        errorMessage: accountError?.message,
      });
      continue;
    }

    // 2. Insert the linked mapping so ingestion accepts this account's txns.
    const { error: linkError } = await supabase.from('bank_connection_accounts').insert({
      bank_connection_id: params.connectionId,
      household_id: params.householdId,
      account_id: account.id,
      external_account_id: ext.externalId,
      external_name: ext.displayName,
      external_type: ext.externalType,
      external_subtype: ext.externalSubtype,
      currency_code: ext.currencyCode,
      is_linked: true,
    });

    if (linkError) {
      logger.warn('Failed to link external account', {
        connectionId: params.connectionId,
        errorMessage: linkError.message,
      });
      continue;
    }

    linked++;
  }

  return linked;
}

// ---------------------------------------------------------------------------
// Connection cap
// ---------------------------------------------------------------------------

/**
 * Reject the request when the household has no remaining connection allowance.
 *
 * Returns the rejection `Response`, or `null` when the caller may proceed.
 *
 * Enforced on BOTH `create_link_token` and `exchange_token`. The link-token
 * check is a courtesy so the user is not sent through a provider Link flow that
 * cannot succeed; the exchange check is the authoritative one, because that is
 * the call that creates the billable Item and a client can skip straight to it.
 *
 * Fails closed — if the count cannot be established we do not create an Item we
 * would be unable to account for.
 *
 * Uses 409 rather than 403 so a client can distinguish "household is full" from
 * the 403 returned for insufficient household permissions.
 */
async function enforceConnectionCap(
  supabase: SupabaseClient,
  householdId: string,
  req: Request,
  logger: FunctionLogger,
): Promise<Response | null> {
  const capCheck = await checkConnectionCap(supabase, householdId, resolveConnectionCap());

  if (capCheck.status === 'error') {
    logger.error('Failed to count household bank connections', {
      errorMessage: capCheck.message,
    });
    return internalErrorResponse(req);
  }

  if (capCheck.status === 'at_cap') {
    logger.warn('Bank connection cap reached', {
      current: capCheck.current,
      cap: capCheck.cap,
      httpStatus: 409,
    });
    return errorResponse(req, connectionCapMessage(capCheck.cap), 409);
  }

  return null;
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

      if (
        !(await ensureCanManageHousehold(supabase, body.household_id, user.id, {
          provisionIfMissing: true,
          userEmail: user.email,
        }))
      ) {
        return errorResponse(
          req,
          'Only household owners and admins can manage bank connections',
          403,
        );
      }

      const linkCapRejection = await enforceConnectionCap(supabase, body.household_id, req, logger);
      if (linkCapRejection) return linkCapRejection;

      const linkResult = await createProviderLinkToken(body.provider, user.id).catch(
        (err: unknown) => {
          if (err instanceof PlaidApiError || err instanceof MxApiError) {
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

      if (!(await ensureCanManageHousehold(supabase, body.household_id, user.id))) {
        return errorResponse(
          req,
          'Only household owners and admins can manage bank connections',
          403,
        );
      }

      // Authoritative cap check — this is the call that creates the billable
      // Item, and a client can reach it without ever requesting a link token.
      const exchangeCapRejection = await enforceConnectionCap(
        supabase,
        body.household_id,
        req,
        logger,
      );
      if (exchangeCapRejection) return exchangeCapRejection;

      // Exchange the client handle for the stored credential — NEVER log it.
      const exchangeResult = await exchangeProviderToken(
        body.provider,
        body.public_token,
        user.id,
      ).catch((err: unknown) => {
        if (err instanceof PlaidApiError || err instanceof MxApiError) {
          logger.warn('Provider token exchange failed', {
            provider: body.provider,
            errorCode: err.errorCode,
          });
          return null;
        }
        throw err;
      });

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

      // Discover + link the institution's accounts, then run an initial
      // backfill so transactions appear immediately (webhooks only deliver
      // DELTAS after this point). Best-effort: a failure here must NOT fail the
      // connection — the next webhook or a manual refresh will catch up.
      try {
        const linkedCount = await provisionAndLinkAccounts(
          supabase,
          {
            provider: body.provider,
            accessToken: exchangeResult.access_token,
            connectionId: connection.id,
            householdId: body.household_id,
          },
          logger,
        );

        if (linkedCount > 0) {
          const initialSync = await runInitialProviderSync(
            supabase,
            body.provider,
            {
              id: connection.id,
              household_id: body.household_id,
              encrypted_access_token: encryptedToken,
              metadata: { item_id: exchangeResult.item_id },
            },
            logger,
          );
          logger.info('Initial account link + sync complete', {
            connectionId: connection.id,
            linkedAccounts: linkedCount,
            added: initialSync.added,
            modified: initialSync.modified,
          });
        } else {
          logger.warn('No external accounts linked for connection', {
            connectionId: connection.id,
          });
        }
      } catch (err) {
        logger.error('Account linking / initial sync failed (connection retained)', {
          connectionId: connection.id,
          errorMessage: (err as Error).message,
        });
      }

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

      if (!(await ensureCanManageHousehold(supabase, existing.household_id, user.id))) {
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
