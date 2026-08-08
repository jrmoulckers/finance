// SPDX-License-Identifier: BUSL-1.1

/**
 * Reusable base implementation for edge-backed banking aggregators.
 *
 * Real aggregators (Plaid, MX, TrueLayer, Finicity, …) become **thin
 * subclasses** of {@link BaseAggregatorProvider}: they supply their identity,
 * supported countries, and capability flags via config, and inherit the entire
 * connection lifecycle. All privileged provider I/O is routed through the
 * project's Supabase Edge Functions (`bank-connection`, `aggregator-health`)
 * so that provider API keys and access tokens **never** touch the client.
 *
 * Two seams are dependency-injected to keep this class fully unit-testable and
 * free of hidden globals:
 *
 * 1. {@link EdgeTransport} — a `fetch` implementation, an async auth-token
 *    getter, and the edge base URL. There is **no** hardcoded global `fetch`.
 * 2. {@link SyncedBankDataSource} — the local, PowerSync-synced read path for
 *    accounts / transactions / balances. In this app those reads come from
 *    synced SQLite repositories, **not** from per-provider network fetches, so
 *    the read methods deliberately throw a categorized error when no
 *    data-source is injected instead of faking a network call.
 *
 * @module banking/base-aggregator-provider
 */

import { categorizeError } from './connection-manager';
import type {
  AccountBalance,
  BankAccount,
  BankConnection,
  BankConnectionProvider,
  BankTransaction,
  ConnectionConfig,
  ConnectionError,
  ConnectionErrorCode,
  ConnectionSession,
  ConnectionStatus,
  ConnectionStatusType,
  DateRange,
  ProviderFeatures,
  ProviderHealth,
  RefreshResult,
} from './types';

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

/**
 * Transport seam for reaching the Supabase Edge Functions.
 *
 * Injecting the `fetch` implementation and auth-token getter keeps the base
 * provider free of hidden global state and trivially mockable in unit tests.
 */
export interface EdgeTransport {
  /** Base URL for the edge functions (e.g. `https://<ref>.functions.supabase.co`). */
  readonly baseUrl: string;
  /** `fetch`-compatible implementation used for every edge request. */
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Resolve the current user's bearer token for the `Authorization` header. */
  getAuthToken: () => Promise<string>;
}

/**
 * Local read path for normalized banking data.
 *
 * In this app, accounts / transactions / balances are served from
 * PowerSync-synced local SQLite repositories rather than per-provider network
 * calls. A concrete implementation is injected via config; when absent, the
 * base provider's read methods throw a clear categorized error.
 */
export interface SyncedBankDataSource {
  /** Read all accounts for a connection from the synced local store. */
  getAccounts(connectionId: string): Promise<BankAccount[]>;
  /** Read transactions for a connection within a date range from the synced local store. */
  getTransactions(connectionId: string, dateRange: DateRange): Promise<BankTransaction[]>;
  /** Read current balances for a connection from the synced local store. */
  getBalances(connectionId: string): Promise<AccountBalance[]>;
}

/**
 * Configuration for a {@link BaseAggregatorProvider} instance.
 *
 * The identity/capability fields drive the provider contract, while the
 * injected `transport`, optional `dataSource`, and optional
 * `resolveHouseholdId` supply the runtime seams.
 */
export interface AggregatorProviderConfig {
  /** Unique provider identifier sent as `provider` to the edge functions. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** ISO 3166-1 alpha-2 country codes this provider supports. */
  supportedCountries: readonly string[];
  /** Capability flags for this provider. */
  features: ProviderFeatures;
  /** Transport used to reach the edge functions. */
  transport: EdgeTransport;
  /** Optional synced local read path for accounts/transactions/balances. */
  dataSource?: SyncedBankDataSource;
  /**
   * Optional resolver for the household id used to scope edge requests when it
   * is not supplied inline via connection metadata.
   */
  resolveHouseholdId?: () => Promise<string> | string;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Error thrown by {@link BaseAggregatorProvider} that carries a structured,
 * categorized {@link ConnectionError} alongside a standard `Error` message.
 *
 * Being a real `Error` preserves the message for any upstream re-categorization
 * (e.g. {@link ConnectionManager}), while `connectionError` exposes the
 * programmatic {@link ConnectionErrorCode} and retryability.
 */
export class BankingProviderError extends Error {
  /** The structured, categorized error details. */
  readonly connectionError: ConnectionError;

  /**
   * @param connectionError - The categorized error to wrap.
   */
  constructor(connectionError: ConnectionError) {
    super(connectionError.message);
    this.name = 'BankingProviderError';
    this.connectionError = connectionError;
  }

  /** The categorized error code. */
  get code(): ConnectionErrorCode {
    return this.connectionError.code;
  }

  /** Whether the failed operation may be retried. */
  get retryable(): boolean {
    return this.connectionError.retryable;
  }
}

// ---------------------------------------------------------------------------
// Small typed helpers (avoid `any`)
// ---------------------------------------------------------------------------

/** Narrow an unknown value to a plain record, or an empty record. @internal */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Return the value if it is a string, else `undefined`. @internal */
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Return the value if it is a finite number, else `undefined`. @internal */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Produce a message keyword for an HTTP status so {@link categorizeError} can
 * map it onto a {@link ConnectionErrorCode} using the shared heuristic.
 * @internal
 */
function statusKeyword(status: number): string {
  if (status === 401) return 'authentication expired';
  if (status === 403) return 'invalid credentials';
  if (status === 429) return 'rate limit exceeded';
  if (status >= 500) return 'provider unavailable';
  return 'request failed';
}

/** Map an edge connection-status string onto the normalized status type. @internal */
function mapConnectionStatus(raw: string | undefined): ConnectionStatusType {
  switch (raw) {
    case 'active':
    case 'healthy':
      return 'active';
    case 'disconnected':
      return 'disconnected';
    case 'error':
      return 'error';
    case 'pending':
      return 'pending';
    case 'needs_reauth':
    case 'stale':
    case 'degraded':
      return 'degraded';
    default:
      return 'pending';
  }
}

// ---------------------------------------------------------------------------
// BaseAggregatorProvider
// ---------------------------------------------------------------------------

/**
 * Config-driven, edge-backed base class implementing
 * {@link BankConnectionProvider}.
 *
 * ```ts
 * class PlaidProvider extends BaseAggregatorProvider {
 *   constructor(transport: EdgeTransport, dataSource: SyncedBankDataSource) {
 *     super({
 *       id: 'plaid',
 *       name: 'Plaid',
 *       supportedCountries: ['US', 'CA', 'GB'],
 *       features: { ...  },
 *       transport,
 *       dataSource,
 *     });
 *   }
 * }
 * ```
 */
export class BaseAggregatorProvider implements BankConnectionProvider {
  readonly id: string;
  readonly name: string;
  readonly supportedCountries: readonly string[];
  readonly features: ProviderFeatures;

  /** @internal */
  protected readonly config: AggregatorProviderConfig;

  /**
   * @param config - Identity/capability fields plus the injected transport,
   *   optional synced data-source, and optional household-id resolver.
   */
  constructor(config: AggregatorProviderConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.supportedCountries = config.supportedCountries;
    this.features = config.features;
  }

  // -- Connection lifecycle --------------------------------------------------

  /**
   * Begin a new connection by requesting a link token from the
   * `bank-connection?action=create_link_token` edge endpoint.
   */
  async initializeConnection(config: ConnectionConfig): Promise<ConnectionSession> {
    const householdId = await this.householdIdFrom(config?.metadata);

    const body = await this.request('bank-connection?action=create_link_token', {
      method: 'POST',
      body: JSON.stringify({ provider: this.id, household_id: householdId }),
    });

    const rec = asRecord(body);
    const linkToken = str(rec.link_token);
    if (!linkToken) {
      throw new BankingProviderError({
        code: 'UNKNOWN',
        message: 'The link-creation response was malformed (no link identifier was returned).',
        retryable: false,
        providerError: body,
      });
    }

    const expiration = str(rec.expiration);
    const expiresAt = expiration ? Date.parse(expiration) : NaN;
    const expiresInSeconds = Number.isNaN(expiresAt)
      ? undefined
      : Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

    return {
      sessionId: linkToken,
      expiresInSeconds,
      metadata: { linkToken, expiration },
    };
  }

  /**
   * Finalize a connection by exchanging the public token via
   * `bank-connection?action=exchange_token`.
   *
   * `metadata` must carry the provider `publicToken`/`public_token` (from the
   * client link SDK) plus the `institutionId`/`institutionName`. The household
   * id may be supplied in metadata or resolved via `resolveHouseholdId`.
   */
  async completeConnection(
    sessionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BankConnection> {
    const meta = asRecord(metadata);
    const householdId = await this.householdIdFrom(metadata);
    const publicToken = str(meta.publicToken) ?? str(meta.public_token) ?? sessionId;
    const institutionId = str(meta.institutionId) ?? str(meta.institution_id);
    const institutionName = str(meta.institutionName) ?? str(meta.institution_name);

    if (!institutionId || !institutionName) {
      throw new BankingProviderError({
        code: 'UNKNOWN',
        message:
          'completeConnection requires institutionId and institutionName in metadata to finalize the link.',
        retryable: false,
      });
    }

    const body = await this.request('bank-connection?action=exchange_token', {
      method: 'POST',
      body: JSON.stringify({
        provider: this.id,
        household_id: householdId,
        public_token: publicToken,
        institution_id: institutionId,
        institution_name: institutionName,
      }),
    });

    const rec = asRecord(body);
    const id = str(rec.id);
    if (!id) {
      throw new BankingProviderError({
        code: 'UNKNOWN',
        message: 'The token-exchange response was malformed (no connection id was returned).',
        retryable: false,
        providerError: body,
      });
    }

    return {
      id,
      providerId: this.id,
      providerConnectionId: id,
      institutionName: str(rec.institution_name) ?? institutionName,
      status: mapConnectionStatus(str(rec.status)),
      createdAt: str(rec.created_at) ?? new Date().toISOString(),
      metadata: { ...meta },
    };
  }

  /**
   * Trigger a server-side health check / re-sync for a connection via
   * `aggregator-health?action=check_health`.
   *
   * Transaction rows still reach the client through PowerSync, while the
   * aggregate count reports what the server-side refresh ingested.
   */
  async refreshConnection(connectionId: string): Promise<RefreshResult> {
    const body = await this.request('aggregator-health?action=check_health', {
      method: 'POST',
      body: JSON.stringify({ connection_id: connectionId, provider: this.id }),
    });

    const rec = asRecord(body);
    const health = str(rec.health_status);
    const success = health !== 'unknown_error' && health !== 'auth_expired';
    const newTransactions =
      typeof rec.new_transactions === 'number' && Number.isFinite(rec.new_transactions)
        ? rec.new_transactions
        : undefined;

    return { connectionId, success, newTransactions };
  }

  /**
   * Permanently remove a connection via `DELETE bank-connection?id=…`, which
   * revokes provider-side access and soft-deletes the record server-side.
   */
  async removeConnection(connectionId: string): Promise<void> {
    await this.request(`bank-connection?id=${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
    });
  }

  // -- Data access (synced local read path) ----------------------------------

  /** Read accounts from the injected synced data-source (never a network fetch). */
  async getAccounts(connectionId: string): Promise<BankAccount[]> {
    return this.readFromDataSource('getAccounts', (ds) => ds.getAccounts(connectionId));
  }

  /** Read transactions from the injected synced data-source (never a network fetch). */
  async getTransactions(connectionId: string, dateRange: DateRange): Promise<BankTransaction[]> {
    return this.readFromDataSource('getTransactions', (ds) =>
      ds.getTransactions(connectionId, dateRange),
    );
  }

  /** Read balances from the injected synced data-source (never a network fetch). */
  async getBalances(connectionId: string): Promise<AccountBalance[]> {
    return this.readFromDataSource('getBalances', (ds) => ds.getBalances(connectionId));
  }

  // -- Status ----------------------------------------------------------------

  /**
   * Fetch a single connection's health from
   * `aggregator-health?action=health` and map it onto {@link ConnectionStatus}.
   */
  async getConnectionStatus(connectionId: string): Promise<ConnectionStatus> {
    const householdId = await this.householdIdFrom();

    const body = await this.request(
      `aggregator-health?action=health&household_id=${encodeURIComponent(householdId)}`,
      { method: 'GET' },
    );

    const list = asRecord(body).connections;
    const connections = Array.isArray(list) ? list : [];
    const match = connections.map(asRecord).find((c) => str(c.id) === connectionId);

    if (!match) {
      throw new BankingProviderError({
        code: 'UNKNOWN',
        message: `No health record was found for connection ${connectionId}.`,
        retryable: false,
      });
    }

    const health = str(match.health_status);
    const lastSuccessfulSync = str(match.last_synced_at);

    let status: ConnectionStatusType;
    let errorCode: ConnectionErrorCode | undefined;
    let message: string | undefined = str(match.error_code);

    switch (health) {
      case 'healthy':
        status = 'active';
        break;
      case 'stale':
        status = 'degraded';
        break;
      case 'auth_expired':
        status = 'error';
        errorCode = 'AUTHENTICATION_EXPIRED';
        break;
      case 'unknown_error':
        status = 'error';
        errorCode = 'UNKNOWN';
        break;
      default:
        status = mapConnectionStatus(str(match.connection_status));
    }

    if (!message) {
      message = `Connection health: ${health ?? str(match.connection_status) ?? 'unknown'}.`;
    }

    return { status, message, lastSuccessfulSync, errorCode };
  }

  /**
   * Fetch this provider's health from `aggregator-health?action=providers` and
   * map the matching directory entry onto {@link ProviderHealth}.
   */
  async getProviderHealth(): Promise<ProviderHealth> {
    const body = await this.request('aggregator-health?action=providers', { method: 'GET' });

    const list = asRecord(body).providers;
    const providers = Array.isArray(list) ? list : [];
    const match = providers.map(asRecord).find((p) => str(p.name) === this.id);

    const checkedAt = new Date().toISOString();
    if (!match) {
      return {
        isHealthy: false,
        message: `Provider ${this.name} is not listed in the aggregator directory.`,
        checkedAt,
      };
    }

    const status = str(match.status);
    const score = num(match.health_score);
    const enabled = match.is_enabled !== false;
    const isHealthy =
      enabled && (status === 'healthy' || status === 'operational' || (score ?? 0) >= 50);

    return {
      isHealthy,
      latencyMs: num(match.latency_ms),
      message: str(match.display_name) ?? status,
      checkedAt: str(match.last_health_check) ?? checkedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Perform an authenticated edge request and return the parsed JSON body.
   *
   * On a thrown transport error or any non-2xx response, a categorized
   * {@link BankingProviderError} is raised (reusing {@link categorizeError}).
   * @internal
   */
  private async request(functionPath: string, init: RequestInit): Promise<unknown> {
    const { transport } = this.config;

    let response: Response;
    try {
      const token = await transport.getAuthToken();
      const base = transport.baseUrl.replace(/\/+$/, '');
      const url = `${base}/${functionPath}`;
      response = await transport.fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      throw new BankingProviderError(categorizeError(err));
    }

    if (!response.ok) {
      const errorBody = await this.safeParse(response);
      throw new BankingProviderError(this.categorizeStatus(response.status, errorBody));
    }

    return this.safeParse(response);
  }

  /**
   * Categorize an HTTP error status into a {@link ConnectionError}, reusing the
   * shared {@link categorizeError} keyword heuristic.
   * @internal
   */
  private categorizeStatus(status: number, body: unknown): ConnectionError {
    const rec = asRecord(body);
    const serverMessage =
      str(rec.error) ?? str(rec.message) ?? (typeof body === 'string' ? body : undefined);
    const keyword = statusKeyword(status);
    const composed = `${keyword} (HTTP ${status})${serverMessage ? `: ${serverMessage}` : ''}`;
    const categorized = categorizeError(new Error(composed));
    return { ...categorized, providerError: body };
  }

  /**
   * Read the response body once and parse it as JSON, falling back to the raw
   * text (or `undefined` for empty bodies, e.g. a 204).
   * @internal
   */
  private async safeParse(response: Response): Promise<unknown> {
    try {
      const text = await response.text();
      if (!text) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch {
      return undefined;
    }
  }

  /**
   * Read from the injected {@link SyncedBankDataSource}, or throw a clear
   * categorized error explaining that reads flow through synced repositories.
   * @internal
   */
  private async readFromDataSource<T>(
    op: string,
    read: (dataSource: SyncedBankDataSource) => Promise<T>,
  ): Promise<T> {
    const { dataSource } = this.config;
    if (!dataSource) {
      throw new BankingProviderError({
        code: 'UNKNOWN',
        message:
          `${op} is not served by the aggregator API: accounts, transactions, and ` +
          'balances are read from PowerSync-synced local repositories. Inject a dataSource ' +
          'to enable local reads.',
        retryable: false,
      });
    }
    return read(dataSource);
  }

  /**
   * Resolve the household id from inline metadata or the configured resolver.
   * @internal
   */
  private async householdIdFrom(metadata?: Record<string, unknown>): Promise<string> {
    const rec = asRecord(metadata);
    const inline = str(rec.householdId) ?? str(rec.household_id);
    if (inline) return inline;

    if (this.config.resolveHouseholdId) {
      const resolved = await this.config.resolveHouseholdId();
      if (resolved) return resolved;
    }

    throw new BankingProviderError({
      code: 'UNKNOWN',
      message:
        'A household id is required to manage this bank connection, but none was supplied in ' +
        'metadata or resolvable via resolveHouseholdId.',
      retryable: false,
    });
  }
}
