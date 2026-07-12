// SPDX-License-Identifier: BUSL-1.1

/**
 * Banking connection abstraction layer — barrel export.
 *
 * Re-exports all public types, classes, and utilities from the banking
 * module. Consumers should import from `lib/banking` rather than reaching
 * into individual files.
 *
 * @module banking
 */

// Types
export type {
  AccountBalance,
  BankAccount,
  BankAccountType,
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

// Provider registry
export { ProviderRegistry, defaultRegistry } from './provider-registry';

// Connection manager
export { ConnectionManager, categorizeError } from './connection-manager';
export type { RetryConfig } from './connection-manager';

// Transaction normalizer
export {
  normalizeTransaction,
  normalizeAccount,
  deduplicateTransactions,
  dollarsToCents,
  bankersRound,
  mapCategory,
  mapAccountType,
  normalizeDate,
} from './transaction-normalizer';
export type { RawProviderTransaction, RawProviderAccount } from './transaction-normalizer';

// Manual provider
export { ManualImportProvider } from './manual-provider';
export type { ImportFormat } from './manual-provider';

// Crypto provider (Web3 wallets & exchanges — #2164)
export { CryptoBankProvider } from './crypto-provider';

// Default provider bootstrap
export { registerDefaultProviders } from './register-default-providers';

// Mock provider
export { MockProvider } from './mock-provider';
export type { MockProviderConfig } from './mock-provider';
