// SPDX-License-Identifier: BUSL-1.1

/**
 * Broker Form 1099-B import mapping and reconciliation against Tax Center lots.
 *
 * This maps broker-provided rows into the existing annual report shape without
 * duplicating lot matching or wash-sale logic. References: issue #2712.
 */

import type { ReportClosedTaxLot } from './capital-gains-reporting';

export interface Broker1099BFieldMapping {
  readonly saleId?: string;
  readonly symbol: string;
  readonly lotId?: string;
  readonly acquiredDate: string;
  readonly soldDate: string;
  readonly shares: string;
  readonly proceedsCents: string;
  readonly costBasisCents: string;
  readonly feesCents?: string;
  readonly covered?: string;
  readonly washSaleAdjustmentCents?: string;
}

export interface Broker1099BLotRow {
  readonly saleId?: string;
  readonly symbol: string;
  readonly lotId?: string;
  readonly acquiredDate: string;
  readonly soldDate: string;
  readonly shares: number;
  readonly proceedsCents: number;
  readonly costBasisCents: number;
  readonly feesCents: number;
  readonly covered: boolean | null;
  readonly washSaleAdjustmentCents: number;
}

export interface Broker1099BReconciliationDifference {
  readonly field:
    | 'proceedsCents'
    | 'costBasisCents'
    | 'feesCents'
    | 'washSaleAdjustmentCents'
    | 'shares';
  readonly appValue: number;
  readonly brokerValue: number;
  readonly variance: number;
}

export type Broker1099BReconciliationStatus =
  | 'match'
  | 'variance'
  | 'missing-in-app'
  | 'missing-in-broker';

export interface Broker1099BReconciliationRow {
  readonly key: string;
  readonly status: Broker1099BReconciliationStatus;
  readonly appLot?: ReportClosedTaxLot;
  readonly brokerLot?: Broker1099BLotRow;
  readonly differences: readonly Broker1099BReconciliationDifference[];
}

function parseMoneyCents(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 0;
  const normalized = value.replaceAll('$', '').replaceAll(',', '').trim();
  if (normalized.includes('.')) return Math.round(Number(normalized) * 100);
  return Math.round(Number(normalized));
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined || value.trim() === '') return null;
  return ['true', 'yes', 'y', 'covered'].includes(value.trim().toLowerCase());
}

function rowKey(input: {
  readonly saleId?: string;
  readonly lotId?: string;
  readonly symbol: string;
  readonly acquiredDate: string;
  readonly soldDate: string;
  readonly shares: number;
}): string {
  if (input.saleId !== undefined && input.lotId !== undefined)
    return `${input.saleId}:${input.lotId}`;
  if (input.lotId !== undefined) return `lot:${input.lotId}`;
  return `${input.symbol.toUpperCase()}:${input.acquiredDate}:${input.soldDate}:${input.shares}`;
}

function appKey(lot: ReportClosedTaxLot): string {
  return rowKey({
    saleId: lot.saleId,
    lotId: lot.lotId,
    symbol: lot.symbol,
    acquiredDate: lot.acquiredDate,
    soldDate: lot.soldDate,
    shares: lot.shares,
  });
}

export function mapBroker1099BRows(
  rows: readonly Readonly<Record<string, string>>[],
  mapping: Broker1099BFieldMapping,
): Broker1099BLotRow[] {
  return rows.map((row) => ({
    saleId: mapping.saleId === undefined ? undefined : row[mapping.saleId],
    symbol: row[mapping.symbol].trim().toUpperCase(),
    lotId:
      mapping.lotId === undefined || row[mapping.lotId] === '' ? undefined : row[mapping.lotId],
    acquiredDate: row[mapping.acquiredDate],
    soldDate: row[mapping.soldDate],
    shares: Number(row[mapping.shares]),
    proceedsCents: parseMoneyCents(row[mapping.proceedsCents]),
    costBasisCents: parseMoneyCents(row[mapping.costBasisCents]),
    feesCents: parseMoneyCents(
      mapping.feesCents === undefined ? undefined : row[mapping.feesCents],
    ),
    covered: parseBoolean(mapping.covered === undefined ? undefined : row[mapping.covered]),
    washSaleAdjustmentCents: parseMoneyCents(
      mapping.washSaleAdjustmentCents === undefined
        ? undefined
        : row[mapping.washSaleAdjustmentCents],
    ),
  }));
}

function compare(
  appLot: ReportClosedTaxLot,
  brokerLot: Broker1099BLotRow,
): Broker1099BReconciliationDifference[] {
  const pairs: Broker1099BReconciliationDifference[] = [
    {
      field: 'proceedsCents',
      appValue: appLot.proceeds,
      brokerValue: brokerLot.proceedsCents,
      variance: brokerLot.proceedsCents - appLot.proceeds,
    },
    {
      field: 'costBasisCents',
      appValue: appLot.costBasis,
      brokerValue: brokerLot.costBasisCents,
      variance: brokerLot.costBasisCents - appLot.costBasis,
    },
    {
      field: 'feesCents',
      appValue: appLot.saleFeesAllocated,
      brokerValue: brokerLot.feesCents,
      variance: brokerLot.feesCents - appLot.saleFeesAllocated,
    },
    {
      field: 'washSaleAdjustmentCents',
      appValue: appLot.washSaleDisallowedLoss,
      brokerValue: brokerLot.washSaleAdjustmentCents,
      variance: brokerLot.washSaleAdjustmentCents - appLot.washSaleDisallowedLoss,
    },
    {
      field: 'shares',
      appValue: appLot.shares,
      brokerValue: brokerLot.shares,
      variance: brokerLot.shares - appLot.shares,
    },
  ];
  return pairs.filter((pair) => Math.abs(pair.variance) > 0.000001);
}

export function reconcileBroker1099B(input: {
  readonly appLots: readonly ReportClosedTaxLot[];
  readonly brokerLots: readonly Broker1099BLotRow[];
}): Broker1099BReconciliationRow[] {
  const appByKey = new Map(input.appLots.map((lot) => [appKey(lot), lot]));
  const brokerByKey = new Map(input.brokerLots.map((lot) => [rowKey(lot), lot]));
  const keys = [...new Set([...appByKey.keys(), ...brokerByKey.keys()])].sort();

  return keys.map((key) => {
    const appLot = appByKey.get(key);
    const brokerLot = brokerByKey.get(key);
    if (appLot === undefined) return { key, status: 'missing-in-app', brokerLot, differences: [] };
    if (brokerLot === undefined)
      return { key, status: 'missing-in-broker', appLot, differences: [] };
    const differences = compare(appLot, brokerLot);
    return {
      key,
      status: differences.length === 0 ? 'match' : 'variance',
      appLot,
      brokerLot,
      differences,
    };
  });
}
