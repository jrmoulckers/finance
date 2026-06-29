// SPDX-License-Identifier: BUSL-1.1

/**
 * Mock banking provider for testing and development.
 *
 * Generates realistic-looking financial data (accounts, transactions,
 * balances) without any network calls. Output is **deterministic** when
 * a seed is provided, making it suitable for snapshot tests.
 *
 * Supports configurable:
 * - Number of accounts
 * - Transaction volume per account
 * - Error simulation (force specific error types)
 *
 * @module banking/mock-provider
 */

import type {
  AccountBalance,
  BankAccount,
  BankAccountType,
  BankConnection,
  BankConnectionProvider,
  BankTransaction,
  ConnectionConfig,
  ConnectionSession,
  ConnectionStatus,
  DateRange,
  ProviderFeatures,
  ProviderHealth,
  RefreshResult,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Options to customize mock data generation.
 */
export interface MockProviderConfig {
  /** Seed for deterministic random number generation. @default 42 */
  seed?: number;
  /** Number of accounts to generate per connection. @default 3 */
  accountCount?: number;
  /** Number of transactions to generate per account. @default 25 */
  transactionsPerAccount?: number;
  /** Force an error on the next operation (then resets). */
  simulateError?: string;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32)
// ---------------------------------------------------------------------------

/**
 * Create a seeded pseudo-random number generator (Mulberry32).
 *
 * @param seed - Integer seed.
 * @returns A function that returns the next pseudo-random float in [0, 1).
 * @internal
 */
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const ACCOUNT_TEMPLATES: Array<{
  name: string;
  type: BankAccountType;
  institution: string;
  mask: string;
}> = [
  {
    name: 'Chase Checking',
    type: 'checking',
    institution: 'JPMorgan Chase',
    mask: '4521',
  },
  {
    name: 'Chase Savings',
    type: 'savings',
    institution: 'JPMorgan Chase',
    mask: '7833',
  },
  {
    name: 'Amex Platinum',
    type: 'credit_card',
    institution: 'American Express',
    mask: '1008',
  },
  {
    name: 'Ally Savings',
    type: 'savings',
    institution: 'Ally Bank',
    mask: '9214',
  },
  {
    name: 'Capital One Venture',
    type: 'credit_card',
    institution: 'Capital One',
    mask: '3347',
  },
  {
    name: 'Vanguard Brokerage',
    type: 'investment',
    institution: 'Vanguard',
    mask: '6671',
  },
  {
    name: 'SoFi Checking',
    type: 'checking',
    institution: 'SoFi',
    mask: '2290',
  },
  {
    name: 'Auto Loan',
    type: 'loan',
    institution: 'Capital One Auto',
    mask: '5512',
  },
];

const MERCHANTS = [
  'Whole Foods Market',
  'Amazon.com',
  'Starbucks',
  'Shell Gas Station',
  'Netflix',
  'Spotify',
  'Target',
  'Walmart',
  "Trader Joe's",
  'Uber',
  'Lyft',
  'DoorDash',
  'Costco',
  'Home Depot',
  'CVS Pharmacy',
  'Chipotle',
  'Apple',
  'Google Cloud',
  'Electric Company',
  'Water Utility',
];

const CATEGORIES = [
  'groceries',
  'food_and_drink',
  'transportation',
  'shopping',
  'entertainment',
  'utilities',
  'healthcare',
  'subscriptions',
  'housing',
  'income',
  'transfer',
];

// ---------------------------------------------------------------------------
// MockProvider
// ---------------------------------------------------------------------------

/**
 * A mock banking provider that generates realistic fake data.
 *
 * Use this for development, demos, and automated testing.
 *
 * ```ts
 * const mock = new MockProvider({ seed: 123, accountCount: 2 });
 * const session = await mock.initializeConnection({});
 * const conn = await mock.completeConnection(session.sessionId);
 * const accounts = await mock.getAccounts(conn.id);
 * ```
 */
export class MockProvider implements BankConnectionProvider {
  readonly id = 'mock';
  readonly name = 'Mock Provider';
  readonly supportedCountries: readonly string[] = ['US', 'GB', 'CA', 'AU'];
  readonly features: ProviderFeatures = {
    realTimeBalance: true,
    transactionWebhooks: true,
    investmentAccounts: true,
    creditCards: true,
    loans: true,
    bnpl: false,
    crypto: false,
    internationalBanks: true,
  };

  private readonly config: Required<
    Pick<MockProviderConfig, 'seed' | 'accountCount' | 'transactionsPerAccount'>
  >;
  private simulateError: string | undefined;
  private readonly connections = new Map<
    string,
    {
      connection: BankConnection;
      accounts: BankAccount[];
      transactions: BankTransaction[];
    }
  >();

  constructor(config?: MockProviderConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      accountCount: config?.accountCount ?? 3,
      transactionsPerAccount: config?.transactionsPerAccount ?? 25,
    };
    this.simulateError = config?.simulateError;
  }

  /** Initialize a mock connection session. */
  async initializeConnection(_config: ConnectionConfig): Promise<ConnectionSession> {
    this.maybeThrow();
    const sessionId = this.deterministicId('session');
    return { sessionId, expiresInSeconds: 3600 };
  }

  /** Complete the mock connection and generate fake data. */
  async completeConnection(sessionId: string): Promise<BankConnection> {
    this.maybeThrow();

    const rng = createRng(this.config.seed);
    const connectionId = this.deterministicId('conn');

    // Generate accounts
    const accounts: BankAccount[] = [];
    for (let i = 0; i < this.config.accountCount; i++) {
      const template = ACCOUNT_TEMPLATES[i % ACCOUNT_TEMPLATES.length];
      accounts.push({
        id: this.deterministicId(`acct-${i}`),
        providerAccountId: `mock-acct-${i}`,
        name: template.name,
        type: template.type,
        currency: 'USD',
        institution: template.institution,
        mask: template.mask,
      });
    }

    // Generate transactions
    const transactions: BankTransaction[] = [];
    const baseDate = new Date('2024-01-15');

    for (const account of accounts) {
      for (let t = 0; t < this.config.transactionsPerAccount; t++) {
        const dayOffset = Math.floor(rng() * 365);
        const date = new Date(baseDate);
        date.setDate(date.getDate() + dayOffset);

        const isIncome = rng() < 0.15;
        const amountDollars = isIncome ? 500 + rng() * 4500 : -(1 + rng() * 200);
        const amountCents = Math.round(amountDollars * 100);

        const merchantIdx = Math.floor(rng() * MERCHANTS.length);
        const categoryIdx = isIncome
          ? CATEGORIES.indexOf('income')
          : Math.floor(rng() * (CATEGORIES.length - 2)); // Exclude income/transfer mostly

        transactions.push({
          id: this.deterministicId(`tx-${account.id}-${t}`),
          providerTransactionId: `mock-tx-${account.id}-${t}`,
          accountId: account.id,
          date: date.toISOString().slice(0, 10),
          amountCents,
          description: MERCHANTS[merchantIdx],
          category: CATEGORIES[categoryIdx >= 0 ? categoryIdx : 0],
          merchant: MERCHANTS[merchantIdx],
          pending: rng() < 0.05,
        });
      }
    }

    const connection: BankConnection = {
      id: connectionId,
      providerId: this.id,
      providerConnectionId: `mock-provider-conn-${sessionId}`,
      institutionName: 'Mock Bank',
      status: 'active',
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.connections.set(connectionId, { connection, accounts, transactions });
    return connection;
  }

  /** Simulate a refresh. */
  async refreshConnection(connectionId: string): Promise<RefreshResult> {
    this.maybeThrow();
    return { connectionId, success: true, newTransactions: 0 };
  }

  /** Remove mock connection data. */
  async removeConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  /** Return mock accounts. */
  async getAccounts(connectionId: string): Promise<BankAccount[]> {
    return this.connections.get(connectionId)?.accounts ?? [];
  }

  /** Return mock transactions filtered by date range. */
  async getTransactions(connectionId: string, dateRange: DateRange): Promise<BankTransaction[]> {
    const all = this.connections.get(connectionId)?.transactions ?? [];
    return all
      .filter((tx) => tx.date >= dateRange.from && tx.date <= dateRange.to)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Return mock balances. */
  async getBalances(connectionId: string): Promise<AccountBalance[]> {
    const rng = createRng(this.config.seed + 999);
    const accounts = this.connections.get(connectionId)?.accounts ?? [];
    return accounts.map((a) => ({
      accountId: a.id,
      currentCents: Math.round(rng() * 1000000),
      availableCents: Math.round(rng() * 1000000),
      currency: a.currency,
      asOf: new Date().toISOString(),
    }));
  }

  /** Return mock connection status. */
  async getConnectionStatus(_connectionId: string): Promise<ConnectionStatus> {
    return { status: 'active', message: 'Mock connection is healthy.' };
  }

  /** Return mock provider health. */
  async getProviderHealth(): Promise<ProviderHealth> {
    return {
      isHealthy: true,
      latencyMs: 12,
      message: 'Mock provider is always healthy.',
      checkedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a deterministic ID from a label and the configured seed.
   * @internal
   */
  private deterministicId(label: string): string {
    // Simple deterministic string — good enough for tests
    const hash = `${this.config.seed}-${label}`;
    return `mock-${hash}`;
  }

  /**
   * Throw if error simulation is configured (then reset).
   * @internal
   */
  private maybeThrow(): void {
    if (this.simulateError) {
      const msg = this.simulateError;
      this.simulateError = undefined;
      throw new Error(msg);
    }
  }
}
