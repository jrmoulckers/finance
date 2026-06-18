// SPDX-License-Identifier: BUSL-1.1

/**
 * DeFi tax audit-trail and export requirements built on normalized crypto events.
 *
 * The audit log preserves source event provenance, normalized event attributes,
 * lot matches, user overrides, and price-source evidence for preparer review.
 * References: issue #2677.
 */

import type {
  CryptoTaxDisposition,
  CryptoTaxEngineResult,
  CryptoTaxEvent,
} from './crypto-tax-events';

export interface DefiPriceSource {
  readonly eventId: string;
  readonly sourceName: string;
  readonly observedAt: string;
  readonly priceCents: number;
}

export interface DefiUserOverride {
  readonly eventId: string;
  readonly field: string;
  readonly oldValue: string | number | null;
  readonly newValue: string | number;
  readonly reason: string;
}

export interface DefiTaxAuditLogEntry {
  readonly eventId: string;
  readonly sourceEvent: CryptoTaxEvent;
  readonly normalizedEvent: Readonly<Record<string, string | number | undefined>>;
  readonly lotMatches: readonly {
    readonly lotId: string;
    readonly quantity: number;
    readonly costBasisCents: number;
  }[];
  readonly userOverrides: readonly DefiUserOverride[];
  readonly priceSource?: DefiPriceSource;
}

export interface DefiForm8949Row {
  readonly asset: string;
  readonly dateAcquired: string;
  readonly dateSold: string;
  readonly proceedsCents: number;
  readonly costBasisCents: number;
  readonly gainLossCents: number;
  readonly sourceEventId: string;
  readonly lotIds: string;
}

export interface DefiOrdinaryIncomeSummaryRow {
  readonly incomeType: 'staking_reward' | 'airdrop' | 'mining' | 'income_receipt';
  readonly amountCents: number;
  readonly eventCount: number;
}

export interface DefiTaxExportRequirements {
  readonly requiredFiles: readonly string[];
  readonly form8949Columns: readonly (keyof DefiForm8949Row)[];
  readonly ordinaryIncomeColumns: readonly (keyof DefiOrdinaryIncomeSummaryRow)[];
  readonly requiredFixtureTypes: readonly CryptoTaxEvent['type'][];
  readonly disclaimer: string;
}

function dispositionByEvent(result: CryptoTaxEngineResult): Map<string, CryptoTaxDisposition> {
  return new Map(result.dispositions.map((disposition) => [disposition.eventId, disposition]));
}

export function buildDefiTaxAuditTrail(input: {
  readonly sourceEvents: readonly CryptoTaxEvent[];
  readonly result: CryptoTaxEngineResult;
  readonly userOverrides?: readonly DefiUserOverride[];
  readonly priceSources?: readonly DefiPriceSource[];
}): DefiTaxAuditLogEntry[] {
  const dispositions = dispositionByEvent(input.result);
  const overridesByEvent = new Map<string, DefiUserOverride[]>();
  for (const override of input.userOverrides ?? []) {
    overridesByEvent.set(override.eventId, [
      ...(overridesByEvent.get(override.eventId) ?? []),
      override,
    ]);
  }
  const priceByEvent = new Map(
    (input.priceSources ?? []).map((source) => [source.eventId, source]),
  );

  return input.sourceEvents.map((event) => {
    const disposition = dispositions.get(event.id);
    return {
      eventId: event.id,
      sourceEvent: event,
      normalizedEvent: {
        type: event.type,
        asset: event.asset.toUpperCase(),
        quantity: event.quantity,
        chain: event.chain,
        walletAddress: event.walletAddress,
        txHash: event.txHash,
        provenance: event.provenance,
      },
      lotMatches: disposition?.lotMatches ?? [],
      userOverrides: overridesByEvent.get(event.id) ?? [],
      priceSource: priceByEvent.get(event.id),
    };
  });
}

export function exportDefiForm8949Rows(
  result: CryptoTaxEngineResult,
  events: readonly CryptoTaxEvent[],
): DefiForm8949Row[] {
  const eventDates = new Map(events.map((event) => [event.id, event.timestamp.slice(0, 10)]));
  return result.dispositions.map((disposition) => ({
    asset: disposition.asset,
    dateAcquired: 'various',
    dateSold: eventDates.get(disposition.eventId) ?? '',
    proceedsCents: disposition.proceedsCents,
    costBasisCents: disposition.costBasisCents,
    gainLossCents: disposition.gainLossCents,
    sourceEventId: disposition.eventId,
    lotIds: disposition.lotMatches.map((match) => match.lotId).join('|'),
  }));
}

export function summarizeDefiOrdinaryIncome(
  events: readonly CryptoTaxEvent[],
): DefiOrdinaryIncomeSummaryRow[] {
  const incomeTypes: DefiOrdinaryIncomeSummaryRow['incomeType'][] = [
    'staking_reward',
    'airdrop',
    'mining',
    'income_receipt',
  ];
  return incomeTypes
    .map((incomeType) => {
      const matching = events.filter((event) => event.type === incomeType);
      return {
        incomeType,
        amountCents: matching.reduce(
          (sum, event) =>
            sum + (event.totalValueCents ?? (event.fairMarketValueCents ?? 0) * event.quantity),
          0,
        ),
        eventCount: matching.length,
      };
    })
    .filter((row) => row.eventCount > 0);
}

export function getDefiTaxExportRequirements(): DefiTaxExportRequirements {
  return {
    requiredFiles: [
      'audit-log.json',
      'form-8949-style.csv',
      'ordinary-income-summary.csv',
      'price-sources.csv',
    ],
    form8949Columns: [
      'asset',
      'dateAcquired',
      'dateSold',
      'proceedsCents',
      'costBasisCents',
      'gainLossCents',
      'sourceEventId',
      'lotIds',
    ],
    ordinaryIncomeColumns: ['incomeType', 'amountCents', 'eventCount'],
    requiredFixtureTypes: ['airdrop', 'staking_reward', 'bridge', 'swap'],
    disclaimer:
      'DeFi exports are planning records for tax-preparer review and are not official IRS forms or tax advice.',
  };
}
