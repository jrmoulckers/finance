// SPDX-License-Identifier: BUSL-1.1

/** Crypto exchange/wallet connector abstraction and deterministic manual provider. References: issue #2655 */
export type CryptoConnectionKind = 'exchange' | 'wallet' | 'csv' | 'manual' | 'indexer';
export type CryptoCapability = 'balances' | 'transactions' | 'positions' | 'rewards' | 'chains';
export type CryptoConnectionHealth = 'healthy' | 'stale' | 'needs-attention' | 'failed' | 'manual';

export interface CryptoAccount {
  readonly id: string;
  readonly providerId: string;
  readonly kind: CryptoConnectionKind;
  readonly label: string;
  readonly exchange?: string;
  readonly chain?: string;
  readonly address?: string;
  readonly health: CryptoConnectionHealth;
  readonly lastSyncAt?: string;
}

export interface CryptoBalance {
  readonly accountId: string;
  readonly asset: string;
  readonly quantity: number;
  readonly valueCents?: number;
  readonly currency?: string;
  readonly asOf: string;
}

export interface CryptoTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly occurredAt: string;
  readonly asset: string;
  readonly quantity: number;
  readonly feeAsset?: string;
  readonly feeQuantity?: number;
  readonly txHash?: string;
}

export interface CryptoConnectionProvider {
  readonly id: string;
  readonly label: string;
  readonly kind: CryptoConnectionKind;
  readonly capabilities: readonly CryptoCapability[];
  readonly supportedChains: readonly string[];
  listAccounts(): Promise<readonly CryptoAccount[]>;
  getBalances(accountId: string): Promise<readonly CryptoBalance[]>;
  getTransactions(accountId: string): Promise<readonly CryptoTransaction[]>;
}

export class ManualCryptoConnectionProvider implements CryptoConnectionProvider {
  readonly id = 'manual-crypto';
  readonly label = 'Manual crypto entries';
  readonly kind = 'manual' as const;
  readonly capabilities = ['balances', 'transactions', 'chains'] as const;
  readonly supportedChains: readonly string[];
  private readonly accounts: readonly CryptoAccount[];
  private readonly balances: readonly CryptoBalance[];
  private readonly transactions: readonly CryptoTransaction[];

  constructor(input: {
    readonly accounts: readonly CryptoAccount[];
    readonly balances?: readonly CryptoBalance[];
    readonly transactions?: readonly CryptoTransaction[];
    readonly supportedChains?: readonly string[];
  }) {
    this.accounts = input.accounts;
    this.balances = input.balances ?? [];
    this.transactions = input.transactions ?? [];
    this.supportedChains = input.supportedChains ?? ['bitcoin', 'ethereum', 'solana'];
  }

  async listAccounts(): Promise<readonly CryptoAccount[]> {
    return this.accounts;
  }

  async getBalances(accountId: string): Promise<readonly CryptoBalance[]> {
    return this.balances.filter((balance) => balance.accountId === accountId);
  }

  async getTransactions(accountId: string): Promise<readonly CryptoTransaction[]> {
    return this.transactions.filter((transaction) => transaction.accountId === accountId);
  }
}

export function summarizeConnectionHealth(
  accounts: readonly CryptoAccount[],
  staleAfterMs: number,
  now: string,
): CryptoConnectionHealth {
  if (accounts.length === 0) return 'needs-attention';
  if (accounts.some((account) => account.health === 'failed')) return 'failed';
  if (accounts.some((account) => account.health === 'needs-attention')) return 'needs-attention';
  const nowMs = new Date(now).getTime();
  if (
    accounts.some(
      (account) =>
        account.lastSyncAt && nowMs - new Date(account.lastSyncAt).getTime() > staleAfterMs,
    )
  )
    return 'stale';
  if (accounts.every((account) => account.health === 'manual')) return 'manual';
  return 'healthy';
}
