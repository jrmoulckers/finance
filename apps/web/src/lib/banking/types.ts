// SPDX-License-Identifier: BUSL-1.1

/**
 * Core types for the provider-agnostic banking connection abstraction layer.
 *
 * Every banking aggregator (Plaid, MX, TrueLayer, manual import, etc.) implements
 * the {@link BankConnectionProvider} interface. The rest of the app interacts
 * with banking data exclusively through these normalized types — never through
 * provider-specific models.
 *
 * Monetary values are always expressed as **integer cents** to avoid
 * floating-point rounding errors in financial calculations.
 *
 * @module banking/types
 */

// ---------------------------------------------------------------------------
// Provider capability flags
// ---------------------------------------------------------------------------

/**
 * Feature flags describing what a specific banking provider supports.
 *
 * Consumers can query these flags to conditionally render UI or skip
 * unsupported operations without try/catch guessing.
 */
export interface ProviderFeatures {
  /** Provider can return up-to-the-second balance data. */
  realTimeBalance: boolean;
  /** Provider pushes transaction updates via webhooks. */
  transactionWebhooks: boolean;
  /** Provider surfaces brokerage / investment account data. */
  investmentAccounts: boolean;
  /** Provider surfaces credit card accounts. */
  creditCards: boolean;
  /** Provider surfaces loan accounts (mortgage, auto, personal). */
  loans: boolean;
  /** Provider surfaces Buy-Now-Pay-Later installment plans. */
  bnpl: boolean;
  /** Provider surfaces cryptocurrency wallet data. */
  crypto: boolean;
  /** Provider supports institutions outside the home country. */
  internationalBanks: boolean;
}

// ---------------------------------------------------------------------------
// Connection lifecycle types
// ---------------------------------------------------------------------------

/**
 * Configuration supplied when initiating a new banking connection.
 *
 * Different providers interpret these fields according to their own API —
 * the `metadata` bag allows provider-specific extras without polluting the
 * shared interface.
 */
export interface ConnectionConfig {
  /** Target financial institution identifier (provider-specific). */
  institutionId?: string;
  /** ISO 3166-1 alpha-2 country code for the institution. */
  countryCode?: string;
  /** Opaque provider-specific configuration. */
  metadata?: Record<string, unknown>;
}

/**
 * Represents an in-progress connection handshake.
 *
 * Providers that require multi-step authentication (OAuth redirect, MFA, etc.)
 * return a session that the UI must complete before data is available.
 */
export interface ConnectionSession {
  /** Unique identifier for this connection attempt. */
  sessionId: string;
  /** Provider-specific URL or token the UI needs to continue the flow. */
  redirectUrl?: string;
  /** Seconds until this session expires. */
  expiresInSeconds?: number;
  /** Opaque provider-specific session data. */
  metadata?: Record<string, unknown>;
}

/**
 * A fully established connection to a financial institution.
 */
export interface BankConnection {
  /** Stable identifier for this connection (app-generated UUID). */
  id: string;
  /** Identifier of the provider that manages this connection. */
  providerId: string;
  /** Provider-specific connection/item identifier. */
  providerConnectionId: string;
  /** Human-readable institution name. */
  institutionName: string;
  /** Current connection health status. */
  status: ConnectionStatusType;
  /** ISO-8601 timestamp of the last successful data refresh. */
  lastRefreshedAt?: string;
  /** ISO-8601 timestamp when the connection was created. */
  createdAt: string;
  /** Opaque provider-specific connection data. */
  metadata?: Record<string, unknown>;
}

/** Possible states for a banking connection. */
export type ConnectionStatusType = 'active' | 'degraded' | 'disconnected' | 'pending' | 'error';

/**
 * Detailed status information for a connection.
 */
export interface ConnectionStatus {
  /** Overall connection health. */
  status: ConnectionStatusType;
  /** Human-readable status message. */
  message?: string;
  /** ISO-8601 timestamp of the last successful sync. */
  lastSuccessfulSync?: string;
  /** If status is `error`, the categorized error code. */
  errorCode?: ConnectionErrorCode;
}

/**
 * Health / availability information for a banking provider.
 */
export interface ProviderHealth {
  /** Whether the provider's API is reachable and responding. */
  isHealthy: boolean;
  /** Provider-reported latency in milliseconds. */
  latencyMs?: number;
  /** Human-readable health summary. */
  message?: string;
  /** ISO-8601 timestamp of this health check. */
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Normalized financial data types
// ---------------------------------------------------------------------------

/**
 * A normalized bank account, independent of the originating provider.
 */
export interface BankAccount {
  /** Stable identifier for this account (app-generated UUID). */
  id: string;
  /** Provider-specific account identifier. */
  providerAccountId: string;
  /** Human-readable account name (e.g., "Chase Checking ••1234"). */
  name: string;
  /** Account type in the app's taxonomy. */
  type: BankAccountType;
  /** ISO 4217 currency code (e.g., "USD"). */
  currency: string;
  /** Financial institution name. */
  institution: string;
  /** Last four digits or mask of the account number. */
  mask?: string;
}

/** Supported account types. */
export type BankAccountType =
  'checking' | 'savings' | 'credit_card' | 'loan' | 'investment' | 'crypto' | 'other';

/**
 * A normalized financial transaction in integer cents.
 */
export interface BankTransaction {
  /** Stable identifier for this transaction (app-generated UUID). */
  id: string;
  /** Provider-specific transaction identifier (used for deduplication). */
  providerTransactionId: string;
  /** Provider-specific account identifier this transaction belongs to. */
  accountId: string;
  /** ISO-8601 date string (YYYY-MM-DD). */
  date: string;
  /** Transaction amount in **integer cents**. Negative = outflow. */
  amountCents: number;
  /** Primary transaction description / payee. */
  description: string;
  /** App-level category (normalized from provider categories). */
  category?: string;
  /** Merchant name, if available. */
  merchant?: string;
  /** Whether this transaction is still pending settlement. */
  pending: boolean;
}

/**
 * Balance snapshot for a single account, in integer cents.
 */
export interface AccountBalance {
  /** Provider-specific account identifier. */
  accountId: string;
  /** Current (ledger) balance in **integer cents**. */
  currentCents: number;
  /** Available balance in **integer cents** (may differ due to holds). */
  availableCents?: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** ISO-8601 timestamp when this balance was captured. */
  asOf: string;
}

// ---------------------------------------------------------------------------
// Date range helper
// ---------------------------------------------------------------------------

/**
 * An inclusive date range for querying transactions.
 */
export interface DateRange {
  /** Start date in ISO-8601 format (YYYY-MM-DD). */
  from: string;
  /** End date in ISO-8601 format (YYYY-MM-DD). */
  to: string;
}

// ---------------------------------------------------------------------------
// Refresh & error types
// ---------------------------------------------------------------------------

/**
 * Result of refreshing one or more banking connections.
 */
export interface RefreshResult {
  /** The connection that was refreshed. */
  connectionId: string;
  /** Whether the refresh completed successfully. */
  success: boolean;
  /** Number of new transactions discovered during refresh. */
  newTransactions?: number;
  /** Error details if the refresh failed. */
  error?: ConnectionError;
}

/** Categorized error codes for banking connection failures. */
export type ConnectionErrorCode =
  | 'AUTHENTICATION_EXPIRED'
  | 'PROVIDER_DOWN'
  | 'RATE_LIMITED'
  | 'INVALID_CREDENTIALS'
  | 'INSTITUTION_NOT_SUPPORTED'
  | 'UNKNOWN';

/**
 * A structured error from a banking connection operation.
 */
export interface ConnectionError {
  /** Categorized error code for programmatic handling. */
  code: ConnectionErrorCode;
  /** Human-readable error message. */
  message: string;
  /** Whether the operation can be retried. */
  retryable: boolean;
  /** Provider-specific error details. */
  providerError?: unknown;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * The main abstraction for banking data providers.
 *
 * Any banking aggregator (Plaid, MX, TrueLayer, manual CSV import, etc.)
 * implements this interface. The rest of the application uses
 * {@link ProviderRegistry} and {@link ConnectionManager} to interact with
 * providers without knowing their implementation details.
 */
export interface BankConnectionProvider {
  /** Unique identifier for this provider (e.g., "plaid", "mx", "manual"). */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** ISO 3166-1 alpha-2 country codes this provider supports. */
  readonly supportedCountries: readonly string[];
  /** Capability flags for this provider. */
  readonly features: ProviderFeatures;

  // -- Connection lifecycle --------------------------------------------------

  /**
   * Begin a new connection flow with a financial institution.
   *
   * @param config - Connection parameters (institution, country, extras).
   * @returns A session object the UI uses to complete the handshake.
   */
  initializeConnection(config: ConnectionConfig): Promise<ConnectionSession>;

  /**
   * Finalize a connection after the user completes authentication.
   *
   * @param sessionId - The session ID from {@link initializeConnection}.
   * @param metadata - Provider-specific completion data (e.g., public token).
   * @returns The established connection record.
   */
  completeConnection(
    sessionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BankConnection>;

  /**
   * Refresh data for an existing connection.
   *
   * @param connectionId - The app-level connection ID.
   * @returns Refresh result with success/failure and new transaction count.
   */
  refreshConnection(connectionId: string): Promise<RefreshResult>;

  /**
   * Permanently remove a connection and revoke provider-side access.
   *
   * @param connectionId - The app-level connection ID to remove.
   */
  removeConnection(connectionId: string): Promise<void>;

  // -- Data access -----------------------------------------------------------

  /**
   * Retrieve all accounts for a given connection.
   *
   * @param connectionId - The app-level connection ID.
   * @returns Normalized bank accounts.
   */
  getAccounts(connectionId: string): Promise<BankAccount[]>;

  /**
   * Retrieve transactions for a connection within a date range.
   *
   * @param connectionId - The app-level connection ID.
   * @param dateRange - Inclusive date range filter.
   * @returns Normalized transactions sorted by date descending.
   */
  getTransactions(connectionId: string, dateRange: DateRange): Promise<BankTransaction[]>;

  /**
   * Retrieve current balances for all accounts in a connection.
   *
   * @param connectionId - The app-level connection ID.
   * @returns Balance snapshots for each account.
   */
  getBalances(connectionId: string): Promise<AccountBalance[]>;

  // -- Status ----------------------------------------------------------------

  /**
   * Check the health/status of a specific connection.
   *
   * @param connectionId - The app-level connection ID.
   * @returns Detailed connection status.
   */
  getConnectionStatus(connectionId: string): Promise<ConnectionStatus>;

  /**
   * Check the overall health of this provider's API.
   *
   * @returns Provider health information.
   */
  getProviderHealth(): Promise<ProviderHealth>;
}
