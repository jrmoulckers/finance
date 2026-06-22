// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure aggregation helpers for a collection of remittance records.
 *
 * Kept separate from the React hook so the summary math is unit-testable
 * without a DOM or localStorage. Amounts are grouped *per currency* (sent/fees
 * in their source currency, received in the destination currency) so multi-
 * currency histories never get naively summed across currencies — reusing the
 * same grouping discipline as `currency-utils.ts`.
 *
 * References: issue #2170
 */

import { quoteRemittance } from './remittance-math';
import type { RemittanceRecord } from './remittance-types';

export interface RemittanceSummary {
  /** Number of remittances in the collection. */
  readonly count: number;
  /** Total sent (the converted principal's source value), grouped by source currency. */
  readonly sentByCurrency: Record<string, number>;
  /** Total fees paid, grouped by source currency. */
  readonly feesByCurrency: Record<string, number>;
  /** Total received, grouped by destination currency. */
  readonly receivedByCurrency: Record<string, number>;
  /**
   * Total cost (fee + FX margin) grouped by source currency. Only records that
   * carry a reference rate contribute; records without one fall back to their
   * explicit fee so the figure is never an under-count.
   */
  readonly totalCostByCurrency: Record<string, number>;
  /** Distinct destination countries seen (deduped, in first-seen order). */
  readonly destinationCountries: readonly string[];
}

function addTo(map: Record<string, number>, key: string, amount: number): void {
  map[key] = (map[key] ?? 0) + amount;
}

/**
 * Build a {@link RemittanceSummary} from a list of records.
 *
 * Each record is re-quoted with {@link quoteRemittance} so the summary reflects
 * the same deterministic rounding as the per-row display.
 */
export function summarizeRemittances(records: readonly RemittanceRecord[]): RemittanceSummary {
  const sentByCurrency: Record<string, number> = {};
  const feesByCurrency: Record<string, number> = {};
  const receivedByCurrency: Record<string, number> = {};
  const totalCostByCurrency: Record<string, number> = {};
  const countries: string[] = [];
  const seenCountries = new Set<string>();

  for (const record of records) {
    const quote = quoteRemittance({
      sendAmountMinor: record.sendAmountMinor,
      feeMinor: record.feeMinor,
      fxRate: record.fxRate,
      feeModel: record.feeModel,
      sourceCurrency: record.sourceCurrency,
      destCurrency: record.destCurrency,
      referenceRate: record.referenceRate ?? undefined,
    });

    addTo(sentByCurrency, record.sourceCurrency, quote.totalPaidMinor);
    addTo(feesByCurrency, record.sourceCurrency, quote.feeMinor);
    addTo(receivedByCurrency, record.destCurrency, quote.receivedMinor);
    addTo(totalCostByCurrency, record.sourceCurrency, quote.totalCostMinor ?? quote.feeMinor);

    const country = record.recipient.country.trim();
    if (country && !seenCountries.has(country)) {
      seenCountries.add(country);
      countries.push(country);
    }
  }

  return {
    count: records.length,
    sentByCurrency,
    feesByCurrency,
    receivedByCurrency,
    totalCostByCurrency,
    destinationCountries: countries,
  };
}
