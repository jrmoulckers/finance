// SPDX-License-Identifier: BUSL-1.1

/**
 * Concrete aggregator provider implementations (#3854).
 *
 * Each provider is a thin {@link BaseAggregatorProvider} subclass that supplies
 * only its identity and capability surface — all connection-lifecycle behaviour
 * is inherited from the edge-backed base. Provider `id`s intentionally match the
 * `name` column of the synced `aggregator_provider` directory so the
 * {@link ProviderRouter} can align each registered implementation with its live
 * operational metadata (status/priority/enabled/regions).
 *
 * Routing eligibility is governed entirely by that synced directory: TrueLayer
 * and Finicity ship as **disabled placeholders** (see the Phase 3 seed) and are
 * therefore never selected until their backend adapters and credentials land.
 * Plaid and MX both have live backend adapters.
 *
 * @module lib/banking/aggregator-providers
 */

import {
  BaseAggregatorProvider,
  type EdgeTransport,
  type SyncedBankDataSource,
} from './base-aggregator-provider';
import type { ProviderFeatures } from './types';

/** Capability surface shared by the full-coverage US/CA aggregators. */
const AGGREGATOR_FEATURES: ProviderFeatures = {
  realTimeBalance: true,
  transactionWebhooks: true,
  investmentAccounts: true,
  creditCards: true,
  loans: true,
  bnpl: false,
  crypto: false,
  internationalBanks: false,
};

/**
 * Plaid — primary aggregator (broad North-American + European coverage,
 * real backend implementation).
 */
export class PlaidProvider extends BaseAggregatorProvider {
  /**
   * @param transport - Edge transport for the banking functions.
   * @param dataSource - Optional synced local read path for accounts/transactions.
   */
  constructor(transport: EdgeTransport, dataSource?: SyncedBankDataSource) {
    super({
      id: 'plaid',
      name: 'Plaid',
      supportedCountries: ['US', 'CA', 'GB', 'IE', 'FR', 'ES', 'NL'],
      features: { ...AGGREGATOR_FEATURES, internationalBanks: true },
      transport,
      dataSource,
    });
  }
}

/** MX — secondary US/CA aggregator (live via the MX Platform API). */
export class MxProvider extends BaseAggregatorProvider {
  /**
   * @param transport - Edge transport for the banking functions.
   * @param dataSource - Optional synced local read path for accounts/transactions.
   */
  constructor(transport: EdgeTransport, dataSource?: SyncedBankDataSource) {
    super({
      id: 'mx',
      name: 'MX',
      supportedCountries: ['US', 'CA'],
      features: { ...AGGREGATOR_FEATURES, investmentAccounts: true },
      transport,
      dataSource,
    });
  }
}

/** TrueLayer — European open-banking provider (disabled placeholder). */
export class TrueLayerProvider extends BaseAggregatorProvider {
  /**
   * @param transport - Edge transport for the banking functions.
   * @param dataSource - Optional synced local read path for accounts/transactions.
   */
  constructor(transport: EdgeTransport, dataSource?: SyncedBankDataSource) {
    super({
      id: 'truelayer',
      name: 'TrueLayer',
      supportedCountries: ['GB', 'IE', 'FR', 'ES', 'IT', 'DE', 'PT', 'NL', 'LT'],
      features: {
        ...AGGREGATOR_FEATURES,
        investmentAccounts: false,
        loans: false,
        internationalBanks: true,
      },
      transport,
      dataSource,
    });
  }
}

/** Finicity (Mastercard) — US/CA aggregator (disabled placeholder). */
export class FinicityProvider extends BaseAggregatorProvider {
  /**
   * @param transport - Edge transport for the banking functions.
   * @param dataSource - Optional synced local read path for accounts/transactions.
   */
  constructor(transport: EdgeTransport, dataSource?: SyncedBankDataSource) {
    super({
      id: 'finicity',
      name: 'Finicity (Mastercard)',
      supportedCountries: ['US', 'CA'],
      features: AGGREGATOR_FEATURES,
      transport,
      dataSource,
    });
  }
}

/**
 * Instantiate every concrete aggregator provider, in directory-priority order
 * (Plaid, MX, TrueLayer, Finicity).
 *
 * @param transport - Edge transport shared by all providers.
 * @param dataSource - Optional synced local read path injected into each provider.
 * @returns The four aggregator provider instances.
 */
export function createAggregatorProviders(
  transport: EdgeTransport,
  dataSource?: SyncedBankDataSource,
): BaseAggregatorProvider[] {
  return [
    new PlaidProvider(transport, dataSource),
    new MxProvider(transport, dataSource),
    new TrueLayerProvider(transport, dataSource),
    new FinicityProvider(transport, dataSource),
  ];
}
