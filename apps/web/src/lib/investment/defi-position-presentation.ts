// SPDX-License-Identifier: BUSL-1.1

/** DeFi portfolio presentation model separating spot, locked, rewards, and borrow exposure (#2694). */

export type DefiExposureKind = 'SPOT' | 'LOCKED' | 'PENDING_REWARD' | 'BORROW';
export type DefiValuationStatus = 'FRESH' | 'STALE' | 'UNPRICED';

export interface DefiPositionInput {
  readonly id: string;
  readonly protocol: string;
  readonly assetSymbol: string;
  readonly kind: DefiExposureKind;
  readonly quantity: number;
  readonly valueCents: number | null;
  readonly apyPercent?: number;
  readonly lockUntil?: string;
  readonly valuationAsOf?: string;
  readonly protocolRiskLabel?: string;
  readonly includeInNetWorth?: boolean;
}

export interface DefiExposureRow {
  readonly id: string;
  readonly protocol: string;
  readonly assetSymbol: string;
  readonly kind: DefiExposureKind;
  readonly quantity: number;
  readonly valueCents: number | null;
  readonly netWorthContributionCents: number;
  readonly valuationStatus: DefiValuationStatus;
  readonly label: string;
  readonly accessibilityText: string;
  readonly riskCopy: string;
}

export interface DefiPortfolioPresentation {
  readonly spotHoldings: readonly DefiExposureRow[];
  readonly lockedPositions: readonly DefiExposureRow[];
  readonly pendingRewards: readonly DefiExposureRow[];
  readonly borrowExposure: readonly DefiExposureRow[];
  readonly netWorthContributionCents: number;
  readonly staleValuationCount: number;
  readonly inclusionRulesCopy: string;
}

function valuationStatus(
  position: DefiPositionInput,
  staleAfterDate?: string,
): DefiValuationStatus {
  if (position.valueCents === null) return 'UNPRICED';
  if (staleAfterDate && (!position.valuationAsOf || position.valuationAsOf < staleAfterDate))
    return 'STALE';
  return 'FRESH';
}

function rowLabel(kind: DefiExposureKind): string {
  if (kind === 'SPOT') return 'Spot holding';
  if (kind === 'LOCKED') return 'Locked contract position';
  if (kind === 'PENDING_REWARD') return 'Pending reward';
  return 'Borrow exposure';
}

function netWorthContribution(position: DefiPositionInput, status: DefiValuationStatus): number {
  if (position.includeInNetWorth === false || status === 'UNPRICED') return 0;
  const valueCents = Math.abs(Math.round(position.valueCents ?? 0));
  if (position.kind === 'BORROW') return -valueCents;
  if (position.kind === 'PENDING_REWARD' && position.includeInNetWorth !== true) return 0;
  return valueCents;
}

function accessibilityText(
  position: DefiPositionInput,
  status: DefiValuationStatus,
  contributionCents: number,
): string {
  const apy =
    position.apyPercent === undefined ? 'APY not provided' : `${position.apyPercent}% APY`;
  const lock = position.lockUntil ? `locked until ${position.lockUntil}` : 'no lock date';
  const valuation =
    status === 'FRESH'
      ? 'valuation is current'
      : status === 'STALE'
        ? 'valuation may be stale'
        : 'valuation unavailable';
  return `${rowLabel(position.kind)}: ${position.quantity} ${position.assetSymbol} on ${position.protocol}, ${apy}, ${lock}, ${valuation}, net-worth contribution ${contributionCents} cents.`;
}

function buildRow(position: DefiPositionInput, staleAfterDate?: string): DefiExposureRow {
  const status = valuationStatus(position, staleAfterDate);
  const contribution = netWorthContribution(position, status);
  return {
    id: position.id,
    protocol: position.protocol,
    assetSymbol: position.assetSymbol,
    kind: position.kind,
    quantity: position.quantity,
    valueCents: position.valueCents,
    netWorthContributionCents: contribution,
    valuationStatus: status,
    label: rowLabel(position.kind),
    accessibilityText: accessibilityText(position, status, contribution),
    riskCopy:
      position.protocolRiskLabel ??
      'Protocol, smart-contract, liquidity, and oracle risks can affect this DeFi position.',
  };
}

export function buildDefiPortfolioPresentation(params: {
  readonly positions: readonly DefiPositionInput[];
  readonly staleAfterDate?: string;
}): DefiPortfolioPresentation {
  const rows = params.positions.map((position) => buildRow(position, params.staleAfterDate));
  return {
    spotHoldings: rows.filter((row) => row.kind === 'SPOT'),
    lockedPositions: rows.filter((row) => row.kind === 'LOCKED'),
    pendingRewards: rows.filter((row) => row.kind === 'PENDING_REWARD'),
    borrowExposure: rows.filter((row) => row.kind === 'BORROW'),
    netWorthContributionCents: rows.reduce((sum, row) => sum + row.netWorthContributionCents, 0),
    staleValuationCount: rows.filter((row) => row.valuationStatus !== 'FRESH').length,
    inclusionRulesCopy:
      'Spot and locked positions contribute when priced and not excluded; borrow exposure subtracts from net worth; pending rewards are excluded until explicitly included or claimed.',
  };
}
