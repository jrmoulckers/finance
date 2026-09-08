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
  confirmConnectionFinalization,
  connectionCapMessage,
  finalizeConnectionReservation,
  premiumRequiredMessage,
  readConnectionCapacity,
  recordOrphanedItem,
  releaseConnectionReservation,
  reserveConnectionSlot,
  type BankEntitlementErrorCode,
  type FinalizeOutcome,
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
  enqueueBankConnectionRevocation,
  prepareBankConnectionDowngrade,
  type DowngradeTargetTier,
} from '../_shared/bank-revocation-outbox.ts';
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

interface PrepareDowngradeRequest {
  household_id: string;
  target_tier: DowngradeTargetTier;
  retained_connection_ids?: unknown;
}

/**
 * Injectable collaborators. Production uses the real implementations; the
 * handler tests substitute them so the reserve → exchange → finalize
 * orchestration — including every revoke decision — is exercised without a
 * database, an aggregator, or key material.
 */
export interface BankConnectionDeps {
  createClient?: typeof createAdminClient;
  requireAuthFn?: typeof requireAuth;
  exchangeToken?: (
    provider: Provider,
    publicToken: string,
    userId: string,
  ) => Promise<{ access_token: string; item_id: string }>;
  revokeToken?: typeof revokeProviderToken;
  encrypt?: (plaintext: string) => Promise<string>;
  linkAccounts?: typeof provisionAndLinkAccounts;
  /** Generates the caller-owned connection id that makes finalization idempotent. */
  newConnectionId?: () => string;
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
// Connection cap (tier-aware, reservation-backed — #4404)
// ---------------------------------------------------------------------------

/**
 * Error body carrying a stable machine-readable `code` alongside the message.
 *
 * The three codes are the entitlement contract clients branch on:
 *   - `PREMIUM_REQUIRED`        — the household allowance is 0 (Free/Plus). 403.
 *   - `CONNECTION_CAP_REACHED`  — allowance exhausted (live + reserved). 409.
 *   - `ENTITLEMENT_UNAVAILABLE` — the projection could not be resolved; we fail
 *                                 closed rather than trusting any client value.
 */
function entitlementErrorResponse(
  req: Request,
  code: BankEntitlementErrorCode,
  message: string,
  status: number,
): Response {
  return jsonResponse(req, { error: message, code }, status);
}

/**
 * Non-authoritative courtesy pre-check for `create_link_token` so a user is not
 * sent through a provider Link flow that cannot succeed. The authoritative gate
 * is the atomic reservation on `exchange_token` — a client can skip straight to
 * it, so this must never be the only enforcement.
 *
 * Fails closed: if the capacity snapshot cannot be resolved we reject with
 * `ENTITLEMENT_UNAVAILABLE` rather than allowing a link flow we cannot back.
 */
async function precheckConnectionCapacity(
  supabase: SupabaseClient,
  householdId: string,
  req: Request,
  logger: FunctionLogger,
): Promise<Response | null> {
  const capacity = await readConnectionCapacity(supabase, householdId);

  if (!capacity) {
    logger.error('Failed to resolve bank connection capacity');
    return entitlementErrorResponse(
      req,
      'ENTITLEMENT_UNAVAILABLE',
      'Bank connection availability is temporarily unavailable. Try again shortly.',
      503,
    );
  }

  if (capacity.cap <= 0) {
    logger.warn('Bank connection requires an eligible plan', { httpStatus: 403 });
    return entitlementErrorResponse(req, 'PREMIUM_REQUIRED', premiumRequiredMessage(), 403);
  }

  if (capacity.used >= capacity.cap) {
    logger.warn('Bank connection cap reached', { httpStatus: 409 });
    return entitlementErrorResponse(
      req,
      'CONNECTION_CAP_REACHED',
      connectionCapMessage(capacity.cap),
      409,
    );
  }

  return null;
}

/**
 * The resolver's verdict — either a DEFINITE database answer, or `unknown`.
 *
 * There is deliberately no third "we are fairly sure nothing committed" state.
 * Only a definite answer authorises revoking the provider Item; see
 * {@link resolveFinalization} for why an unlocked absence is not one.
 */
type ResolvedFinalization = FinalizeOutcome;

/** How many times the idempotent finalize call may be replayed in one request. */
const MAX_FINALIZE_ATTEMPTS = 2;

/**
 * Drive finalization to a verdict the caller can act on.
 *
 * The problem this solves: an RPC can COMMIT and still lose its response. The
 * original flow treated every finalize error as "nothing was persisted" and
 * revoked the provider Item — which, after a committed-then-lost response,
 * destroys the Item behind a live `bank_connections` row and leaves the
 * household with a connection that can never sync.
 *
 * Because the connection id is generated here and the RPC is idempotent on it,
 * an unobserved outcome is partly recoverable:
 *   - confirm the id against the database;
 *   - `finalized` / `disconnected` → a definite answer, no retry needed;
 *   - `absent` → nothing is visible yet, so replaying the identical call is
 *     safe (it cannot create a second billable row) and often resolves it;
 *   - the confirming read itself failing → still unknown.
 *
 * WHY A REPORTED ABSENCE IS NOT A LICENCE TO REVOKE
 *
 * `bank_connection_finalization_state` reads WITHOUT the per-household
 * reservation advisory lock, so `absent` means "not visible to this snapshot",
 * not "will never exist". A finalize transaction that is still in flight — or
 * one that is merely queued behind the lock — is invisible to it and can commit
 * moments later. Taking the lock in the confirming read would narrow that window
 * but not close it, because a finalize that has not yet reached the lock would
 * simply acquire it afterwards.
 *
 * Revocation is destructive and unrecoverable, so exhausting the retries WITHOUT
 * a definite answer resolves to `unknown`: the caller withholds revocation and
 * hands the credential off for reconciliation instead. The Item is still
 * revoked promptly in every case where the database DID answer definitively
 * (`at_cap`, `premium_required`, `reservation_not_found`,
 * `already_disconnected`), which is what "definitely absent" means here.
 */
async function resolveFinalization(
  supabase: SupabaseClient,
  params: {
    reservationId: string;
    householdId: string;
    ownerId: string;
    provider: Provider;
    institutionId: string;
    institutionName: string;
    encryptedAccessToken: string;
    connectionId: string;
    metadata?: Record<string, unknown>;
  },
  logger: FunctionLogger,
): Promise<ResolvedFinalization> {
  let outcome = await finalizeConnectionReservation(supabase, params);
  let attempts = 1;

  while (outcome.status === 'unknown') {
    const confirmation = await confirmConnectionFinalization(supabase, {
      connectionId: params.connectionId,
      householdId: params.householdId,
    });

    if (confirmation.state === 'finalized') {
      // The lost response hid a successful commit. Report the persisted row.
      logger.warn('Recovered a bank connection finalization whose response was lost', {
        connectionId: params.connectionId,
        provider: params.provider,
      });
      return {
        status: 'finalized',
        connectionId: params.connectionId,
        createdAt: confirmation.createdAt,
      };
    }

    if (confirmation.state === 'disconnected') {
      return { status: 'already_disconnected' };
    }

    if (confirmation.state === 'unknown' || attempts >= MAX_FINALIZE_ATTEMPTS) {
      // Either the confirming read failed, or it reported an absence we cannot
      // treat as final (see the note above). Fail closed WITHOUT revoking.
      return outcome;
    }

    logger.warn('Replaying an unobserved bank connection finalization', {
      connectionId: params.connectionId,
      provider: params.provider,
    });
    outcome = await finalizeConnectionReservation(supabase, params);
    attempts++;
  }

  return outcome;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Build the request handler with its collaborators resolved.
 *
 * Exported so the reserve → exchange → finalize orchestration can be driven
 * end-to-end in tests. The production entry point below binds the real
 * implementations.
 */
export function createBankConnectionHandler(deps: BankConnectionDeps = {}) {
  const createClient = deps.createClient ?? createAdminClient;
  const authenticate = deps.requireAuthFn ?? requireAuth;
  const exchangeToken = deps.exchangeToken ?? exchangeProviderToken;
  const revokeToken = deps.revokeToken ?? revokeProviderToken;
  const encrypt = deps.encrypt ?? encryptAccessToken;
  const linkAccounts = deps.linkAccounts ?? provisionAndLinkAccounts;
  const newConnectionId = deps.newConnectionId ?? (() => crypto.randomUUID());

  return async (req: Request): Promise<Response> => {
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
        user = await authenticate(req);
      } catch (response) {
        return response as Response;
      }

      logger.setUserId(user.id);
      const supabase = createClient();

      // Rate limiting
      const rateLimitResult = await checkRateLimit(
        supabase,
        user.id,
        RATE_LIMITS['bank-connection'],
      );
      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', { httpStatus: 429 });
        return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['bank-connection']);
      }

      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      // -----------------------------------------------------------------------
      // POST ?action=prepare_downgrade
      // -----------------------------------------------------------------------
      if (req.method === 'POST' && action === 'prepare_downgrade') {
        const body = (await req.json()) as PrepareDowngradeRequest;
        if (!body.household_id) return errorResponse(req, 'household_id is required');
        if (!(['free', 'plus', 'premium'] as const).includes(body.target_tier)) {
          return errorResponse(req, 'target_tier must be free, plus, or premium');
        }
        if (
          body.retained_connection_ids !== undefined &&
          (!Array.isArray(body.retained_connection_ids) ||
            body.retained_connection_ids.some((id) => typeof id !== 'string'))
        ) {
          return errorResponse(req, 'retained_connection_ids must be an array of connection ids');
        }

        const selection = await prepareBankConnectionDowngrade(supabase, {
          householdId: body.household_id,
          actorId: user.id,
          targetTier: body.target_tier,
          retainedConnectionIds: (body.retained_connection_ids ?? []) as string[],
        });

        if (selection.status === 'forbidden') {
          return errorResponse(
            req,
            'Only household owners and admins can prepare a downgrade',
            403,
          );
        }
        if (selection.status === 'invalid') {
          return errorResponse(req, 'The retained connection selection is invalid', 400);
        }
        if (selection.status === 'unavailable') {
          return entitlementErrorResponse(
            req,
            'ENTITLEMENT_UNAVAILABLE',
            'Downgrade preparation is temporarily unavailable. Try again shortly.',
            503,
          );
        }

        return jsonResponse(req, {
          status: 'prepared',
          selection_id: selection.selectionId,
          retained_count: selection.retainedCount,
          target_allowance: selection.targetAllowance,
        });
      }

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

        const linkCapRejection = await precheckConnectionCapacity(
          supabase,
          body.household_id,
          req,
          logger,
        );
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

        // Atomic reservation — claims capacity BEFORE the provider exchange
        // creates a billable Item, so concurrent requests cannot all pass a
        // count-then-create check. This is the AUTHORITATIVE gate: a client can
        // reach exchange_token without ever requesting a link token.
        const reservation = await reserveConnectionSlot(supabase, {
          householdId: body.household_id,
          ownerId: user.id,
          provider: body.provider,
        });

        if (reservation.status === 'premium_required') {
          logger.warn('Bank connection requires an eligible plan', { httpStatus: 403 });
          return entitlementErrorResponse(req, 'PREMIUM_REQUIRED', premiumRequiredMessage(), 403);
        }
        if (reservation.status === 'at_cap') {
          logger.warn('Bank connection cap reached', { httpStatus: 409 });
          return entitlementErrorResponse(
            req,
            'CONNECTION_CAP_REACHED',
            connectionCapMessage(reservation.cap),
            409,
          );
        }
        if (reservation.status === 'forbidden') {
          return errorResponse(
            req,
            'Only household owners and admins can manage bank connections',
            403,
          );
        }
        if (reservation.status === 'error') {
          // Fail closed — never fall back to a client tier, flag, or cached cap.
          logger.error('Failed to reserve a bank connection slot', {
            errorMessage: reservation.message,
          });
          return entitlementErrorResponse(
            req,
            'ENTITLEMENT_UNAVAILABLE',
            'Bank connection availability is temporarily unavailable. Try again shortly.',
            503,
          );
        }

        const reservationId = reservation.reservationId;

        // Exchange the client handle for the stored credential — NEVER log it.
        const exchangeResult = await exchangeToken(body.provider, body.public_token, user.id).catch(
          (err: unknown) => {
            if (err instanceof PlaidApiError || err instanceof MxApiError) {
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
          // No billable Item was created; free the reserved slot immediately.
          await releaseConnectionReservation(supabase, {
            reservationId,
            householdId: body.household_id,
          });
          return errorResponse(req, 'Provider token exchange failed', 502);
        }

        // A billable Item now exists at the provider. Encrypt before storage.
        const encryptedToken = await encrypt(exchangeResult.access_token);

        // The connection id is generated HERE so finalization is idempotent on
        // it: a replay after a lost response returns the committed row instead of
        // creating a second billable connection.
        const connectionId = newConnectionId();

        // Consume the reservation and persist the row atomically under the same
        // per-household lock the reservation was taken under, driving the call to
        // a verdict that is either definite or explicitly unknown.
        const finalize = await resolveFinalization(
          supabase,
          {
            reservationId,
            householdId: body.household_id,
            ownerId: user.id,
            provider: body.provider,
            institutionId: body.institution_id,
            institutionName: body.institution_name,
            encryptedAccessToken: encryptedToken,
            connectionId,
            metadata: { item_id: exchangeResult.item_id },
          },
          logger,
        );

        if (finalize.status === 'unknown') {
          // The Item is billable and we do NOT know whether its row committed.
          // Revoking here could destroy the Item behind a live connection, so we
          // withhold revocation and durably hand the credential off for
          // reconciliation: Stage 7 resolves `connection_id` against
          // `bank_connections` BEFORE it revokes anything.
          const handoffId = await recordOrphanedItem(supabase, {
            householdId: body.household_id,
            ownerId: user.id,
            provider: body.provider,
            encryptedAccessToken: encryptedToken,
            lastErrorCode: 'FINALIZE_OUTCOME_UNKNOWN',
            status: 'pending_reconciliation',
            connectionId,
          });
          logger.error('Bank connection finalization outcome unknown; revocation withheld', {
            provider: body.provider,
            connectionId,
            handoffRecorded: handoffId !== null,
          });
          return entitlementErrorResponse(
            req,
            'ENTITLEMENT_UNAVAILABLE',
            'Bank connection could not be completed. Try again shortly.',
            503,
          );
        }

        if (finalize.status !== 'finalized') {
          // A DEFINITE rejection: a confirming read or the RPC itself proved no
          // row is in place, so the Item is billable and orphaned. Revoke it
          // immediately and idempotently; if that cannot be confirmed, durably
          // hand the encrypted credential to Stage 7 so revocation is retried and
          // never lost. NEVER report a success-shaped result here.
          const revocation = await revokeToken({
            provider: body.provider,
            encryptedAccessToken: encryptedToken,
          });

          if (revocation.outcome === 'revoked') {
            logger.warn('Provider Item revoked after finalization failure', {
              provider: body.provider,
              finalizeStatus: finalize.status,
            });
          } else {
            const handoffId = await recordOrphanedItem(supabase, {
              householdId: body.household_id,
              ownerId: user.id,
              provider: body.provider,
              encryptedAccessToken: encryptedToken,
              lastErrorCode: revocation.detail,
              status: 'pending_revocation',
              connectionId,
            });
            logger.error('Orphaned provider Item retained for revocation retry', {
              provider: body.provider,
              revocationOutcome: revocation.outcome,
              handoffRecorded: handoffId !== null,
              finalizeStatus: finalize.status,
            });
          }

          if (finalize.status === 'premium_required') {
            return entitlementErrorResponse(req, 'PREMIUM_REQUIRED', premiumRequiredMessage(), 403);
          }
          if (finalize.status === 'at_cap') {
            return entitlementErrorResponse(
              req,
              'CONNECTION_CAP_REACHED',
              'This household has reached its bank connection limit. ' +
                'Disconnect a bank before connecting another.',
              409,
            );
          }
          // reservation_not_found / already_disconnected → fail closed with the
          // stable unavailable code.
          return entitlementErrorResponse(
            req,
            'ENTITLEMENT_UNAVAILABLE',
            'Bank connection could not be completed. Try again shortly.',
            503,
          );
        }

        const connection = {
          id: finalize.connectionId,
          provider: body.provider,
          institution_name: body.institution_name,
          status: 'active',
          created_at: finalize.createdAt,
        };

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
          const linkedCount = await linkAccounts(
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
      // DELETE — Disable sync and durably enqueue provider revocation.
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

        if (!(await ensureCanManageHousehold(supabase, existing.household_id, user.id))) {
          return errorResponse(
            req,
            'Only household owners and admins can manage bank connections',
            403,
          );
        }

        const enqueue = await enqueueBankConnectionRevocation(supabase, {
          connectionId,
          operation: 'user_disconnect',
          actorId: user.id,
        });
        if (enqueue === 'forbidden') {
          return errorResponse(
            req,
            'Only household owners and admins can manage bank connections',
            403,
          );
        }
        if (enqueue === 'not_found') {
          return errorResponse(req, 'Bank connection not found', 404);
        }
        if (enqueue === 'unavailable') {
          logger.error('Failed to durably enqueue bank connection revocation', {
            errorCode: 'REVOCATION_ENQUEUE_FAILED',
          });
          return internalErrorResponse(req);
        }

        logger.info('Bank connection revocation enqueued', {
          connectionId,
          httpStatus: 204,
        });
        return noContentResponse(req);
      }

      return methodNotAllowedResponse(req);
    } catch (err) {
      logger.error('Bank connection error', { errorMessage: (err as Error).message });
      return internalErrorResponse(req);
    }
  };
}

serve(createBankConnectionHandler());
