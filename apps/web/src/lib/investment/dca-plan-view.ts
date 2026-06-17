// SPDX-License-Identifier: BUSL-1.1

/** Local-first DCA plan editor and dashboard helpers (#2477, #2478, #2479). */

import type { Investment, InvestmentLot } from '../../kmp/bridge';
import {
  analyzeDCAPlans,
  type DCACadence,
  type DCAPeriodStatus,
  type DCAPurchaseLot,
  type DCAPlan,
  type DCAPlanAnalysis,
  type DCAPlanAmountOverride,
} from './dca-tracking';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DCAPlanDraft {
  readonly id?: string;
  readonly symbol: string;
  readonly cadence: DCACadence;
  readonly targetAmountCents: number;
  readonly startDate: string;
  readonly pausedDate?: string | null;
  readonly amountOverrides?: readonly DCAPlanAmountOverride[];
}

export interface DCAPlanValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface DCAReminderRow {
  readonly planId: string;
  readonly symbol: string;
  readonly dueDate: string;
  readonly targetAmountCents: number;
  readonly status: 'upcoming' | 'overdue';
}

export interface DCADashboardRow {
  readonly planId: string;
  readonly symbol: string;
  readonly cadence: DCACadence;
  readonly totalContributedCents: number;
  readonly totalShares: number;
  readonly averagePurchasePriceCents: number;
  readonly currentValueCents: number | null;
  readonly gainLossCents: number | null;
  readonly nextContributionDate: string | null;
  readonly statusCounts: Readonly<Record<DCAPeriodStatus, number>>;
}

export interface DCADashboardViewModel {
  readonly rows: readonly DCADashboardRow[];
  readonly reminders: readonly DCAReminderRow[];
}

const STORAGE_KEY = 'finance.dcaPlans.v1';

function isCadence(value: unknown): value is DCACadence {
  return value === 'WEEKLY' || value === 'BIWEEKLY' || value === 'MONTHLY';
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function stablePlanId(symbol: string, cadence: DCACadence, startDate: string): string {
  return `${symbol.toLowerCase()}-${cadence.toLowerCase()}-${startDate}`;
}

export function validateDCAPlanDraft(draft: DCAPlanDraft): DCAPlanValidationResult {
  const errors: string[] = [];
  if (draft.symbol.trim().length === 0) errors.push('Symbol is required.');
  if (!isCadence(draft.cadence)) errors.push('Cadence must be weekly, biweekly, or monthly.');
  if (!Number.isFinite(draft.targetAmountCents) || draft.targetAmountCents <= 0) {
    errors.push('Target amount must be above zero.');
  }
  if (!isIsoDate(draft.startDate)) errors.push('Start date must be an ISO date.');
  if (draft.pausedDate && !isIsoDate(draft.pausedDate)) errors.push('Pause date must be an ISO date.');
  for (const override of draft.amountOverrides ?? []) {
    if (!isIsoDate(override.effectiveDate)) errors.push('Amount override date must be an ISO date.');
    if (!Number.isFinite(override.targetAmountCents) || override.targetAmountCents <= 0) {
      errors.push('Amount override target must be above zero.');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function buildDCAPlanFromDraft(draft: DCAPlanDraft): DCAPlan {
  const validation = validateDCAPlanDraft(draft);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const symbol = draft.symbol.trim().toUpperCase();
  return {
    id: draft.id ?? stablePlanId(symbol, draft.cadence, draft.startDate),
    symbol,
    cadence: draft.cadence,
    targetAmountCents: Math.round(draft.targetAmountCents),
    startDate: draft.startDate,
    pausedDate: draft.pausedDate ?? null,
    amountOverrides: [...(draft.amountOverrides ?? [])].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate),
    ),
  };
}

function isPlan(value: unknown): value is DCAPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as Partial<DCAPlan>;
  return (
    typeof plan.id === 'string' &&
    typeof plan.symbol === 'string' &&
    isCadence(plan.cadence) &&
    typeof plan.targetAmountCents === 'number' &&
    typeof plan.startDate === 'string'
  );
}

export function loadDCAPlans(storage: StorageLike): readonly DCAPlan[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlan).map((plan) => buildDCAPlanFromDraft(plan));
  } catch {
    return [];
  }
}

export function saveDCAPlans(storage: StorageLike, plans: readonly DCAPlan[]): readonly DCAPlan[] {
  const normalized = plans.map((plan) => buildDCAPlanFromDraft(plan));
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function upsertDCAPlan(plans: readonly DCAPlan[], plan: DCAPlan): readonly DCAPlan[] {
  const remaining = plans.filter((existing) => existing.id !== plan.id);
  return [...remaining, plan].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function deleteDCAPlan(plans: readonly DCAPlan[], planId: string): readonly DCAPlan[] {
  return plans.filter((plan) => plan.id !== planId);
}

export function clearDCAPlans(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY);
}

export function mapInvestmentLotsToDCAPurchases(
  investments: readonly Investment[],
  lotsByInvestmentId: ReadonlyMap<string, readonly InvestmentLot[]>,
): readonly DCAPurchaseLot[] {
  const symbolByInvestmentId = new Map(investments.map((investment) => [investment.id, investment.symbol]));
  return [...lotsByInvestmentId.entries()].flatMap(([investmentId, lots]) => {
    const symbol = symbolByInvestmentId.get(investmentId);
    if (!symbol) return [];
    return lots.map((lot) => ({
      symbol,
      purchaseDate: lot.purchaseDate,
      shares: lot.shares,
      totalCostCents: lot.totalCost.amount,
    }));
  });
}

function statusCounts(analysis: DCAPlanAnalysis): Readonly<Record<DCAPeriodStatus, number>> {
  const counts: Record<DCAPeriodStatus, number> = {
    COMPLETED: 0,
    PARTIAL: 0,
    MISSED: 0,
    UPCOMING: 0,
    PAUSED: 0,
  };
  for (const period of analysis.periods) counts[period.status] += 1;
  return counts;
}

function reminderStatus(dueDate: string, asOfDate: string): DCAReminderRow['status'] {
  return dueDate < asOfDate ? 'overdue' : 'upcoming';
}

export function buildDCADashboardViewModel(
  plans: readonly DCAPlan[],
  lots: readonly DCAPurchaseLot[],
  asOfDate: string,
  currentPricesCents: ReadonlyMap<string, number> = new Map(),
): DCADashboardViewModel {
  const analyses = analyzeDCAPlans(plans, lots, asOfDate, currentPricesCents);
  return {
    rows: analyses.map((analysis) => ({
      planId: analysis.planId,
      symbol: analysis.symbol,
      cadence: plans.find((plan) => plan.id === analysis.planId)?.cadence ?? 'MONTHLY',
      totalContributedCents: analysis.totalContributedCents,
      totalShares: analysis.totalShares,
      averagePurchasePriceCents: analysis.averagePurchasePriceCents,
      currentValueCents: analysis.currentValueCents,
      gainLossCents: analysis.gainLossCents,
      nextContributionDate: analysis.nextContributionDate,
      statusCounts: statusCounts(analysis),
    })),
    reminders: analyses.flatMap((analysis) =>
      analysis.periods
        .filter(
          (period) =>
            period.status === 'UPCOMING' || period.status === 'MISSED' || period.status === 'PARTIAL',
        )
        .map((period) => ({
          planId: analysis.planId,
          symbol: analysis.symbol,
          dueDate: period.periodStart,
          targetAmountCents: period.targetAmountCents,
          status: reminderStatus(period.periodStart, asOfDate),
        })),
    ),
  };
}
