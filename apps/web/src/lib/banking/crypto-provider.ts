// SPDX-License-Identifier: BUSL-1.1

/**
 * Crypto banking provider — bridges the `lib/crypto` connector abstraction into the
 * provider-agnostic {@link BankConnectionProvider} interface so that Web3 wallets and
 * custodial exchanges appear *alongside* traditional bank accounts (#2164).
 *
 * This provider is **watch-only / read-only**: it never holds live exchange credentials.
 * It wraps any {@link CryptoConnectionProvider} (by default the deterministic
 * {@link ManualCryptoConnectionProvider}) and normalizes its accounts, balances, and
 * movements into the shared banking types. Because crypto positions are quantity-based,
 * fiat transaction amounts are only reported when the underlying source supplies a
 * `valueCents`; otherwise `amountCents` is `0` and the asset/quantity is carried in the
 * description. Monetary values remain **integer cents**.
 *
 * @module banking/crypto-provider
 */

import {
  ManualCryptoConnectionProvider,
  type CryptoAccount,
  type CryptoConnectionProvider,
} from '../crypto/connector-abstraction';
import type {
  AccountBalance,
  BankAccount,
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

/** Deterministic id helper (crypto.randomUUID when available, else a stable fallback). */
function newId(prefix: string): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return `${prefix}-${webCrypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Trim an ISO-8601 timestamp to a `YYYY-MM-DD` date, defaulting to the epoch. */
function toDate(iso: string | undefined): string {
  if (!iso) return '1970-01-01';
  return iso.slice(0, 10);
}

/**
 * Banking provider that surfaces crypto wallets & exchanges via the crypto engine.
 *
 * Usage:
 * ```ts
 * const provider = new CryptoBankProvider(myCryptoSource);
 * const session = await provider.initializeConnection({});
 * const connection = await provider.completeConnection(session.sessionId);
 * const accounts = await provider.getAccounts(connection.id);
 * ```
 */
export class CryptoBankProvider implements BankConnectionProvider {
  readonly id = 'crypto';
  readonly name = 'Crypto Wallets & Exchanges';
  /** Crypto is borderless — no country restriction. */
  readonly supportedCountries: readonly string[] = [];
  readonly features: ProviderFeatures = {
    realTimeBalance: false,
    transactionWebhooks: false,
    investmentAccounts: true,
    creditCards: false,
    loans: false,
    bnpl: false,
    crypto: true,
    internationalBanks: true,
  };

  /** @internal underlying crypto connector abstraction. */
  private readonly source: CryptoConnectionProvider;

  /** @internal live connection ids (one per completed handshake). */
  private readonly connections = new Set<string>();

  constructor(source?: CryptoConnectionProvider) {
    this.source = source ?? new ManualCryptoConnectionProvider({ accounts: [] });
  }

  /** Begin a (no-op) watch-only handshake. */
  async initializeConnection(_config: ConnectionConfig): Promise<ConnectionSession> {
    return { sessionId: newId('crypto-session') };
  }

  /** Complete the handshake, registering a connection backed by the crypto source. */
  async completeConnection(sessionId: string): Promise<BankConnection> {
    const connectionId = newId('crypto-conn');
    this.connections.add(connectionId);
    return {
      id: connectionId,
      providerId: this.id,
      providerConnectionId: sessionId,
      institutionName: this.source.label,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /** Re-reading the source is cheap; report success with no new fiat transactions. */
  async refreshConnection(connectionId: string): Promise<RefreshResult> {
    return { connectionId, success: true, newTransactions: 0 };
  }

  /** Forget a connection. */
  async removeConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  /** Map crypto accounts (wallets & exchanges) into normalized bank accounts. */
  async getAccounts(_connectionId: string): Promise<BankAccount[]> {
    const accounts = await this.source.listAccounts();
    return accounts.map((account) => this.toBankAccount(account));
  }

  /** Map crypto movements into normalized transactions within the date range. */
  async getTransactions(_connectionId: string, dateRange: DateRange): Promise<BankTransaction[]> {
    const accounts = await this.source.listAccounts();
    const out: BankTransaction[] = [];
    for (const account of accounts) {
      const txs = await this.source.getTransactions(account.id);
      for (const tx of txs) {
        const date = toDate(tx.occurredAt);
        if (date < dateRange.from || date > dateRange.to) continue;
        out.push({
          id: newId('crypto-tx'),
          providerTransactionId: tx.id,
          accountId: account.id,
          date,
          // Crypto movements are quantity-based; no reliable fiat value without a price feed.
          amountCents: 0,
          description: `${tx.quantity} ${tx.asset}`.trim(),
          merchant: account.exchange ?? account.chain,
          pending: false,
        });
      }
    }
    return out;
  }

  /** Map crypto balances into normalized fiat-cents balances (0 when unpriced). */
  async getBalances(_connectionId: string): Promise<AccountBalance[]> {
    const accounts = await this.source.listAccounts();
    const balances: AccountBalance[] = [];
    for (const account of accounts) {
      const accountBalances = await this.source.getBalances(account.id);
      const currentCents = accountBalances.reduce((sum, b) => sum + (b.valueCents ?? 0), 0);
      const asOf =
        accountBalances.reduce<string | undefined>(
          (latest, b) => (!latest || b.asOf > latest ? b.asOf : latest),
          undefined,
        ) ?? new Date().toISOString();
      balances.push({
        accountId: account.id,
        currentCents,
        availableCents: currentCents,
        currency: accountBalances[0]?.currency ?? 'USD',
        asOf,
      });
    }
    return balances;
  }

  /** Watch-only connections are active while registered, else disconnected. */
  async getConnectionStatus(connectionId: string): Promise<ConnectionStatus> {
    return this.connections.has(connectionId)
      ? { status: 'active', message: 'Watch-only crypto connection.' }
      : { status: 'disconnected', message: 'No such crypto connection.' };
  }

  /** The provider has no external dependency of its own (source-dependent). */
  async getProviderHealth(): Promise<ProviderHealth> {
    return {
      isHealthy: true,
      message: 'Watch-only crypto provider (read-only; no live credentials).',
      checkedAt: new Date().toISOString(),
    };
  }

  /** @internal normalize a single crypto account to a bank account. */
  private toBankAccount(account: CryptoAccount): BankAccount {
    const institution = account.exchange ?? account.chain ?? 'Crypto';
    const mask = account.address ? account.address.slice(-4) : undefined;
    return {
      id: account.id,
      providerAccountId: account.id,
      name: account.label,
      type: 'crypto',
      currency: 'USD',
      institution,
      mask,
    };
  }
}
