// SPDX-License-Identifier: BUSL-1.1

/** Dollar-cost-averaging tracking helpers for investment lots (#2245). */

import { bankersRound } from './rebalancing';

export type DCACadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type DCAPeriodStatus = 'COMPLETED' | 'PARTIAL' | 'MISSED' | 'UPCOMING' | 'PAUSED';

export interface DCAPlanAmountOverride {
  readonly effectiveDate: string;
  readonly targetAmountCents: number;
}

export interface DCAPlan {
  readonly id: string;
  readonly symbol: string;
  readonly cadence: DCACadence;
  readonly targetAmountCents: number;
  readonly startDate: string;
  readonly pausedDate?: string | null;
  readonly amountOverrides?: readonly DCAPlanAmountOverride[];
}

export interface DCAPurchaseLot {
  readonly symbol: string;
  readonly purchaseDate: string;
  readonly shares: number;
  readonly totalCostCents: number;
}

export interface DCAPeriodProgress {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly targetAmountCents: number;
  readonly contributedCents: number;
  readonly shares: number;
  readonly status: DCAPeriodStatus;
}

export interface DCAPlanAnalysis {
  readonly planId: string;
  readonly symbol: string;
  readonly periods: readonly DCAPeriodProgress[];
  readonly totalContributedCents: number;
  readonly totalShares: number;
  readonly averagePurchasePriceCents: number;
  readonly currentValueCents: number | null;
  readonly gainLossCents: number | null;
  readonly completedPeriods: number;
  readonly missedPeriods: number;
  readonly nextContributionDate: string | null;
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCadence(date: Date, cadence: DCACadence): Date {
  const next = new Date(date);
  if (cadence === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1);
  if (cadence === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
  if (cadence === 'BIWEEKLY') next.setUTCDate(next.getUTCDate() + 14);
  return next;
}

function targetForDate(plan: DCAPlan, date: string): number {
  const overrides = [...(plan.amountOverrides ?? [])]
    .filter((override) => override.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return overrides[0]?.targetAmountCents ?? plan.targetAmountCents;
}

function statusForPeriod(
  contributedCents: number,
  targetAmountCents: number,
  periodStart: string,
  asOfDate: string,
  pausedDate?: string | null,
): DCAPeriodStatus {
  if (pausedDate && periodStart >= pausedDate) return 'PAUSED';
  if (periodStart > asOfDate) return 'UPCOMING';
  if (contributedCents >= targetAmountCents) return 'COMPLETED';
  if (contributedCents > 0) return 'PARTIAL';
  return 'MISSED';
}

export function analyzeDCAPlan(
  plan: DCAPlan,
  lots: readonly DCAPurchaseLot[],
  asOfDate: string,
  currentPriceCents?: number,
): DCAPlanAnalysis {
  const normalizedSymbol = plan.symbol.toUpperCase();
  const matchingLots = lots.filter(
    (lot) => lot.symbol.toUpperCase() === normalizedSymbol && lot.purchaseDate <= asOfDate,
  );
  const periods: DCAPeriodProgress[] = [];
  let start = parseDate(plan.startDate);

  while (formatDate(start) <= asOfDate) {
    const end = addCadence(start, plan.cadence);
    const periodStart = formatDate(start);
    const periodEnd = formatDate(end);
    const periodLots = matchingLots.filter(
      (lot) => lot.purchaseDate >= periodStart && lot.purchaseDate < periodEnd,
    );
    const contributedCents = periodLots.reduce((sum, lot) => sum + lot.totalCostCents, 0);
    const shares = periodLots.reduce((sum, lot) => sum + lot.shares, 0);
    const targetAmountCents = targetForDate(plan, periodStart);

    periods.push({
      periodStart,
      periodEnd,
      targetAmountCents,
      contributedCents,
      shares,
      status: statusForPeriod(
        contributedCents,
        targetAmountCents,
        periodStart,
        asOfDate,
        plan.pausedDate,
      ),
    });

    start = end;
  }

  const nextStart = formatDate(start);
  periods.push({
    periodStart: nextStart,
    periodEnd: formatDate(addCadence(start, plan.cadence)),
    targetAmountCents: targetForDate(plan, nextStart),
    contributedCents: 0,
    shares: 0,
    status: plan.pausedDate && nextStart >= plan.pausedDate ? 'PAUSED' : 'UPCOMING',
  });

  const totalContributedCents = matchingLots.reduce((sum, lot) => sum + lot.totalCostCents, 0);
  const totalShares = matchingLots.reduce((sum, lot) => sum + lot.shares, 0);
  const currentValueCents =
    currentPriceCents === undefined ? null : bankersRound(totalShares * currentPriceCents);

  return {
    planId: plan.id,
    symbol: plan.symbol,
    periods,
    totalContributedCents,
    totalShares,
    averagePurchasePriceCents: totalShares > 0 ? bankersRound(totalContributedCents / totalShares) : 0,
    currentValueCents,
    gainLossCents: currentValueCents === null ? null : currentValueCents - totalContributedCents,
    completedPeriods: periods.filter((period) => period.status === 'COMPLETED').length,
    missedPeriods: periods.filter((period) => period.status === 'MISSED').length,
    nextContributionDate:
      periods.find((period) => period.status === 'UPCOMING')?.periodStart ?? null,
  };
}

export function analyzeDCAPlans(
  plans: readonly DCAPlan[],
  lots: readonly DCAPurchaseLot[],
  asOfDate: string,
  currentPricesCents: ReadonlyMap<string, number> = new Map(),
): readonly DCAPlanAnalysis[] {
  return plans.map((plan) =>
    analyzeDCAPlan(plan, lots, asOfDate, currentPricesCents.get(plan.symbol.toUpperCase())),
  );
}
