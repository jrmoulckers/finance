// SPDX-License-Identifier: BUSL-1.1

/**
 * Data-source agnostic crypto taxable-event and cost-basis engine.
 *
 * Amounts are integer cents. This local model represents DeFi events before any
 * chain indexer integration exists. US references: IRS Notice 2014-21 and Rev.
 * Rul. 2019-24 treat convertible virtual-currency rewards/income as ordinary
 * income at fair market value; capital gain/loss is determined on disposal.
 * This is educational planning logic only, not tax advice. References: #2671.
 */

export type CryptoTaxEventType =
  | 'buy'
  | 'sell'
  | 'swap'
  | 'bridge'
  | 'wrap'
  | 'unwrap'
  | 'gas_fee'
  | 'staking_reward'
  | 'airdrop'
  | 'mining'
  | 'income_receipt';
export type CryptoLotMatchingMethod = 'FIFO' | 'HIFO';
export type CryptoGasFeePolicy = 'CAPITALIZE' | 'EXPENSE';

export interface CryptoTaxEvent {
  readonly id: string;
  readonly type: CryptoTaxEventType;
  readonly timestamp: string;
  readonly asset: string;
  readonly quantity: number;
  readonly totalValueCents?: number;
  readonly fairMarketValueCents?: number;
  readonly feeCents?: number;
  readonly toAsset?: string;
  readonly toQuantity?: number;
  readonly chain?: string;
  readonly walletAddress?: string;
  readonly txHash?: string;
  readonly lotId?: string;
  readonly provenance?: string;
}

export interface CryptoTaxLot {
  readonly id: string;
  readonly asset: string;
  readonly acquiredAt: string;
  readonly quantity: number;
  readonly costBasisCents: number;
  readonly sourceEventId: string;
  readonly chain?: string;
  readonly walletAddress?: string;
  readonly txHash?: string;
  readonly provenance?: string;
}

export interface CryptoTaxDisposition {
  readonly eventId: string;
  readonly asset: string;
  readonly disposedQuantity: number;
  readonly proceedsCents: number;
  readonly costBasisCents: number;
  readonly gainLossCents: number;
  readonly lotMatches: readonly { readonly lotId: string; readonly quantity: number; readonly costBasisCents: number }[];
}

export interface CryptoTaxEngineResult {
  readonly openLots: readonly CryptoTaxLot[];
  readonly dispositions: readonly CryptoTaxDisposition[];
  readonly ordinaryIncomeCents: number;
  readonly capitalizedGasFeesCents: number;
  readonly deductibleGasExpenseCents: number;
  readonly missingFairMarketValueEventIds: readonly string[];
  readonly warnings: readonly string[];
}

interface MutableCryptoLot {
  id: string;
  asset: string;
  acquiredAt: string;
  quantity: number;
  costBasisCents: number;
  sourceEventId: string;
  chain?: string;
  walletAddress?: string;
  txHash?: string;
  provenance?: string;
}

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

function roundCents(value: number): number {
  return Math.round(value);
}

function eventValue(event: CryptoTaxEvent): number | null {
  if (event.totalValueCents !== undefined) return roundCents(event.totalValueCents);
  if (event.fairMarketValueCents !== undefined) return roundCents(event.fairMarketValueCents * event.quantity);
  return null;
}

function lotUnitBasis(lot: MutableCryptoLot): number {
  return lot.quantity === 0 ? 0 : lot.costBasisCents / lot.quantity;
}

function toPublicLot(lot: MutableCryptoLot): CryptoTaxLot {
  return { ...lot };
}

function addLot(lots: MutableCryptoLot[], event: CryptoTaxEvent, quantity: number, basisCents: number, asset = event.asset): void {
  if (quantity <= 0) return;
  lots.push({
    id: event.lotId ?? `${event.id}:lot`,
    asset: normalizeAsset(asset),
    acquiredAt: event.timestamp,
    quantity,
    costBasisCents: roundCents(basisCents),
    sourceEventId: event.id,
    chain: event.chain,
    walletAddress: event.walletAddress,
    txHash: event.txHash,
    provenance: event.provenance,
  });
}

function orderedLots(lots: readonly MutableCryptoLot[], asset: string, method: CryptoLotMatchingMethod): MutableCryptoLot[] {
  const candidates = lots.filter((lot) => lot.asset === normalizeAsset(asset) && lot.quantity > 0);
  return candidates.sort((a, b) => {
    if (method === 'HIFO') {
      const unitDiff = lotUnitBasis(b) - lotUnitBasis(a);
      if (unitDiff !== 0) return unitDiff;
    }
    const dateDiff = a.acquiredAt.localeCompare(b.acquiredAt);
    return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
  });
}

function disposeLots(input: {
  readonly lots: MutableCryptoLot[];
  readonly event: CryptoTaxEvent;
  readonly proceedsCents: number;
  readonly method: CryptoLotMatchingMethod;
}): CryptoTaxDisposition {
  const matches: { lotId: string; quantity: number; costBasisCents: number }[] = [];
  let remainingQuantity = input.event.quantity;
  let costBasisCents = 0;

  for (const lot of orderedLots(input.lots, input.event.asset, input.method)) {
    if (remainingQuantity <= 1e-10) break;
    const quantity = Math.min(remainingQuantity, lot.quantity);
    const basis = roundCents(lotUnitBasis(lot) * quantity);
    lot.quantity -= quantity;
    lot.costBasisCents = roundCents(lot.costBasisCents - basis);
    remainingQuantity -= quantity;
    costBasisCents += basis;
    matches.push({ lotId: lot.id, quantity, costBasisCents: basis });
  }

  return {
    eventId: input.event.id,
    asset: normalizeAsset(input.event.asset),
    disposedQuantity: input.event.quantity - Math.max(0, remainingQuantity),
    proceedsCents: input.proceedsCents,
    costBasisCents,
    gainLossCents: input.proceedsCents - costBasisCents,
    lotMatches: matches,
  };
}

export function processCryptoTaxEvents(input: {
  readonly events: readonly CryptoTaxEvent[];
  readonly matchingMethod?: CryptoLotMatchingMethod;
  readonly gasFeePolicy?: CryptoGasFeePolicy;
}): CryptoTaxEngineResult {
  const matchingMethod = input.matchingMethod ?? 'FIFO';
  const gasFeePolicy = input.gasFeePolicy ?? 'CAPITALIZE';
  const lots: MutableCryptoLot[] = [];
  const dispositions: CryptoTaxDisposition[] = [];
  const missingFairMarketValueEventIds: string[] = [];
  const warnings: string[] = [];
  let ordinaryIncomeCents = 0;
  let capitalizedGasFeesCents = 0;
  let deductibleGasExpenseCents = 0;

  for (const event of [...input.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const value = eventValue(event);

    if (event.type === 'gas_fee') {
      if (value === null) {
        missingFairMarketValueEventIds.push(event.id);
        warnings.push(`Missing fair-market value for gas fee ${event.id}.`);
      } else if (gasFeePolicy === 'CAPITALIZE') {
        capitalizedGasFeesCents += value;
      } else {
        deductibleGasExpenseCents += value;
      }
      continue;
    }

    if (value === null && !['bridge', 'wrap', 'unwrap'].includes(event.type)) {
      missingFairMarketValueEventIds.push(event.id);
      warnings.push(`Missing fair-market value for ${event.type} event ${event.id}.`);
      continue;
    }

    if (event.type === 'buy') {
      const fee = event.feeCents ?? 0;
      addLot(lots, event, event.quantity, (value ?? 0) + (gasFeePolicy === 'CAPITALIZE' ? fee : 0));
      if (gasFeePolicy === 'EXPENSE') deductibleGasExpenseCents += fee;
      continue;
    }

    if (event.type === 'staking_reward' || event.type === 'airdrop' || event.type === 'mining' || event.type === 'income_receipt') {
      ordinaryIncomeCents += value ?? 0;
      addLot(lots, event, event.quantity, value ?? 0);
      continue;
    }

    if (event.type === 'sell' || event.type === 'swap') {
      const fee = event.feeCents ?? 0;
      const proceeds = Math.max(0, (value ?? 0) - (gasFeePolicy === 'CAPITALIZE' ? fee : 0));
      if (gasFeePolicy === 'EXPENSE') deductibleGasExpenseCents += fee;
      dispositions.push(disposeLots({ lots, event, proceedsCents: proceeds, method: matchingMethod }));
      if (event.type === 'swap' && event.toAsset !== undefined && event.toQuantity !== undefined) {
        addLot(lots, event, event.toQuantity, value ?? 0, event.toAsset);
      }
      continue;
    }

    if (event.type === 'bridge' || event.type === 'wrap' || event.type === 'unwrap') {
      warnings.push(`${event.type} event ${event.id} is represented as a non-taxable transfer/wrapper event; retain source provenance for review.`);
    }
  }

  return {
    openLots: lots.filter((lot) => lot.quantity > 1e-10).map(toPublicLot),
    dispositions,
    ordinaryIncomeCents,
    capitalizedGasFeesCents,
    deductibleGasExpenseCents,
    missingFairMarketValueEventIds,
    warnings,
  };
}
