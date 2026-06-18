// SPDX-License-Identifier: BUSL-1.1

import type { ExchangeRateProvider } from './exchange-rate-types';
import { STATIC_USD_RATES } from './static-rates';

export const LOCAL_RATE_TABLE_KEY = 'finance-local-exchange-rate-table';

export interface LocalRateTable {
  readonly baseCurrency: string;
  readonly rates: Record<string, number>;
  readonly updatedAt: string;
  readonly source: string;
}

function readLocalRateTable(): LocalRateTable | null {
  try {
    const raw = localStorage.getItem(LOCAL_RATE_TABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalRateTable;
    if (!parsed.baseCurrency || typeof parsed.rates !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function deriveRates(
  baseCurrency: string,
  usdRates: Record<string, number>,
): Record<string, number> {
  const baseRate = usdRates[baseCurrency];
  if (baseRate === undefined) {
    throw new Error(`Unsupported currency: ${baseCurrency}`);
  }

  const rates: Record<string, number> = {};
  for (const [code, usdRate] of Object.entries(usdRates)) {
    if (code !== baseCurrency) {
      rates[code] = usdRate / baseRate;
    }
  }
  return rates;
}

export function saveLocalRateTable(table: LocalRateTable): void {
  localStorage.setItem(LOCAL_RATE_TABLE_KEY, JSON.stringify(table));
}

/**
 * Exchange-rate provider backed by a locally stored beta rate table.
 * This avoids a network dependency while exercising the same provider path a
 * production live provider uses, and falls back to a packaged market snapshot.
 */
export class LocalStoredRateProvider implements ExchangeRateProvider {
  readonly name = 'Stored Exchange Rates';

  async fetchRates(baseCurrency: string): Promise<Record<string, number>> {
    const stored = readLocalRateTable();
    if (stored?.baseCurrency === baseCurrency) {
      return stored.rates;
    }

    if (stored && stored.rates[baseCurrency] !== undefined) {
      const usdRates = { ...STATIC_USD_RATES, ...stored.rates, [stored.baseCurrency]: 1 };
      return deriveRates(baseCurrency, usdRates);
    }

    return deriveRates(baseCurrency, STATIC_USD_RATES);
  }

  async fetchRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    const rates = await this.fetchRates(from);
    const rate = rates[to];
    if (rate === undefined) {
      throw new Error(`Unsupported currency: ${to}`);
    }
    return rate;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
