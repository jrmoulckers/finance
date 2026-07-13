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

// Aggregator metadata (routing inputs)
export { defaultMetaForProvider, isStatusRoutable } from './aggregator-metadata';
export type { AggregatorStatus, RoutableProviderMeta } from './aggregator-metadata';

// Provider router (app-routed selection + failover + override)
export { ProviderRouter, resolveRoute } from './provider-router';
export type {
  ProviderMetaSource,
  RoutingDecision,
  RoutingReason,
  RoutingRequest,
} from './provider-router';

// Bootstrap (startup wiring)
export { bootstrapBanking, getProviderRouter, resetBankingBootstrapForTests } from './bootstrap';
export type { BankingBootstrap } from './bootstrap';

// DB-backed provider metadata source (PowerSync-synced directory — #3852)
export { createDbProviderMetaSource } from './provider-meta-source';

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

// NOTE: the edge-backed aggregator layer (register-aggregator-providers, the
// concrete provider classes, and the edge transport) is intentionally NOT
// re-exported from this barrel. It is loaded exclusively through a dynamic
// import (see main.tsx / register-aggregator-providers.ts) so its
// implementation stays code-split into a lazy chunk and out of the eager
// `vendor-app` bundle (#3854). Import those modules directly where needed.

// Mock provider
export { MockProvider } from './mock-provider';
export type { MockProviderConfig } from './mock-provider';

// Base aggregator provider types (edge-backed base for real aggregators — #3849).
// NOTE: the BaseAggregatorProvider class and BankingProviderError value are
// intentionally NOT re-exported from this barrel — a static value re-export
// would pull the (otherwise lazily-loaded) provider implementation into the
// eager `vendor-app` chunk and breach the performance budget (#3854). Import
// them directly from './base-aggregator-provider' where needed.
export type {
  AggregatorProviderConfig,
  EdgeTransport,
  SyncedBankDataSource,
} from './base-aggregator-provider';
