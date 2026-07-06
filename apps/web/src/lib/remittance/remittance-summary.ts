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

/**
 * Per-recipient (per-supplier) rollup of a remittance history.
 *
 * A small-business owner who pays the same overseas suppliers every month needs
 * to see how much has gone to *each* supplier, not just a single global total.
 * Amounts stay grouped per currency — exactly like {@link RemittanceSummary} —
 * so a supplier paid in more than one corridor is never naively summed across
 * currencies.
 */
export interface RemittanceRecipientBreakdown {
  /** Recipient display name (user-entered, never translated). */
  readonly name: string;
  /** Recipient destination country (first non-empty value seen). */
  readonly country: string;
  /** Number of remittances sent to this recipient. */
  readonly count: number;
  /** Most recent send date for this recipient (`YYYY-MM-DD`). */
  readonly lastDate: string;
  /** Total paid (converted principal + fee), grouped by source currency. */
  readonly sentByCurrency: Record<string, number>;
  /** Total received, grouped by destination currency. */
  readonly receivedByCurrency: Record<string, number>;
  /** Total cost (fee + FX margin), grouped by source currency. */
  readonly totalCostByCurrency: Record<string, number>;
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

/**
 * Group a remittance history by recipient so per-supplier spend is visible.
 *
 * Records are grouped by trimmed recipient name and re-quoted with
 * {@link quoteRemittance} for the same rounding as the per-row display. The
 * result is sorted by transfer count (desc), then most recent date (desc), then
 * name — so the busiest supplier relationships surface first without ever
 * comparing amounts across currencies.
 */
export function summarizeByRecipient(
  records: readonly RemittanceRecord[],
): RemittanceRecipientBreakdown[] {
  const groups = new Map<
    string,
    {
      name: string;
      country: string;
      count: number;
      lastDate: string;
      sentByCurrency: Record<string, number>;
      receivedByCurrency: Record<string, number>;
      totalCostByCurrency: Record<string, number>;
    }
  >();

  for (const record of records) {
    const name = record.recipient.name.trim();
    let group = groups.get(name);
    if (!group) {
      group = {
        name,
        country: record.recipient.country.trim(),
        count: 0,
        lastDate: record.date,
        sentByCurrency: {},
        receivedByCurrency: {},
        totalCostByCurrency: {},
      };
      groups.set(name, group);
    }

    const quote = quoteRemittance({
      sendAmountMinor: record.sendAmountMinor,
      feeMinor: record.feeMinor,
      fxRate: record.fxRate,
      feeModel: record.feeModel,
      sourceCurrency: record.sourceCurrency,
      destCurrency: record.destCurrency,
      referenceRate: record.referenceRate ?? undefined,
    });

    group.count += 1;
    if (record.date > group.lastDate) {
      group.lastDate = record.date;
    }
    if (!group.country && record.recipient.country.trim()) {
      group.country = record.recipient.country.trim();
    }
    addTo(group.sentByCurrency, record.sourceCurrency, quote.totalPaidMinor);
    addTo(group.receivedByCurrency, record.destCurrency, quote.receivedMinor);
    addTo(group.totalCostByCurrency, record.sourceCurrency, quote.totalCostMinor ?? quote.feeMinor);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}
