// SPDX-License-Identifier: BUSL-1.1

/** Local-first view helpers for net-worth projection controls (#2466, #2467, #2469). */

import type { NetWorthDataPoint, NetWorthMilestone } from '../analytics/net-worth';
import {
  deriveProjectionScenarios,
  projectNetWorthGrowth,
  type NetWorthProjectionInput,
  type NetWorthProjectionMilestone,
  type NetWorthProjectionPoint,
  type NetWorthProjectionResult,
  type NetWorthProjectionScenario,
} from './net-worth-projections';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NetWorthProjectionAssumptions {
  readonly monthlyContributionCents: number;
  readonly monthlyDebtPaymentCents: number;
  readonly annualAssetReturnPercent: number;
  readonly annualInflationPercent: number;
  readonly horizonMonths: number;
}

export interface NetWorthProjectionTableRow {
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  readonly month: number;
  readonly label: string;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly netWorthCents: number;
  readonly realNetWorthCents: number;
}

export interface ProjectedMilestoneRow {
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  readonly milestoneId: string;
  readonly milestoneLabel: string;
  readonly reachedLabel: string | null;
  readonly reachable: boolean;
  readonly message: string;
}

const STORAGE_KEY = 'finance.netWorthProjection.assumptions.v1';

export const DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS: NetWorthProjectionAssumptions = {
  monthlyContributionCents: 1_000_00,
  monthlyDebtPaymentCents: 250_00,
  annualAssetReturnPercent: 6,
  annualInflationPercent: 3,
  horizonMonths: 120,
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeNetWorthProjectionAssumptions(
  value: Partial<NetWorthProjectionAssumptions>,
): NetWorthProjectionAssumptions {
  return {
    monthlyContributionCents: Math.round(
      Math.max(
        0,
        finiteNumber(
          value.monthlyContributionCents,
          DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS.monthlyContributionCents,
        ),
      ),
    ),
    monthlyDebtPaymentCents: Math.round(
      Math.max(
        0,
        finiteNumber(
          value.monthlyDebtPaymentCents,
          DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS.monthlyDebtPaymentCents,
        ),
      ),
    ),
    annualAssetReturnPercent: clamp(
      finiteNumber(
        value.annualAssetReturnPercent,
        DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS.annualAssetReturnPercent,
      ),
      -25,
      25,
    ),
    annualInflationPercent: clamp(
      finiteNumber(
        value.annualInflationPercent,
        DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS.annualInflationPercent,
      ),
      -10,
      20,
    ),
    horizonMonths: Math.round(
      clamp(
        finiteNumber(value.horizonMonths, DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS.horizonMonths),
        0,
        600,
      ),
    ),
  };
}

export function loadNetWorthProjectionAssumptions(
  storage: StorageLike,
): NetWorthProjectionAssumptions {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS;

  try {
    return normalizeNetWorthProjectionAssumptions(
      JSON.parse(raw) as Partial<NetWorthProjectionAssumptions>,
    );
  } catch {
    return DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS;
  }
}

export function saveNetWorthProjectionAssumptions(
  storage: StorageLike,
  assumptions: Partial<NetWorthProjectionAssumptions>,
): NetWorthProjectionAssumptions {
  const normalized = normalizeNetWorthProjectionAssumptions(assumptions);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetNetWorthProjectionAssumptions(
  storage: StorageLike,
): NetWorthProjectionAssumptions {
  storage.removeItem(STORAGE_KEY);
  return DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS;
}

export function toProjectionMilestones(
  milestones: readonly NetWorthMilestone[],
): readonly NetWorthProjectionMilestone[] {
  return milestones.map((milestone) => ({
    id: milestone.id,
    label: milestone.label,
    thresholdCents: milestone.thresholdCents,
  }));
}

export function buildNetWorthProjectionInput(
  currentNetWorth: NetWorthDataPoint,
  assumptions: Partial<NetWorthProjectionAssumptions>,
  milestones: readonly NetWorthMilestone[] = [],
  startMonth = currentNetWorth.label.slice(0, 7),
): NetWorthProjectionInput {
  const normalized = normalizeNetWorthProjectionAssumptions(assumptions);
  return {
    currentAssetsCents: currentNetWorth.assets,
    currentLiabilitiesCents: currentNetWorth.liabilities,
    monthlyContributionCents: normalized.monthlyContributionCents,
    monthlyDebtPaymentCents: normalized.monthlyDebtPaymentCents,
    annualAssetReturnPercent: normalized.annualAssetReturnPercent,
    annualInflationPercent: normalized.annualInflationPercent,
    horizonMonths: normalized.horizonMonths,
    startMonth,
    milestones: toProjectionMilestones(milestones),
  };
}

export function buildNetWorthProjectionResults(
  input: NetWorthProjectionInput,
  spreadPercent = 2,
): readonly NetWorthProjectionResult[] {
  return projectNetWorthGrowth(
    input,
    deriveProjectionScenarios(input.annualAssetReturnPercent, spreadPercent),
  );
}

export function buildProjectionTableRows(
  results: readonly NetWorthProjectionResult[],
): readonly NetWorthProjectionTableRow[] {
  return results.flatMap((result) =>
    result.points.map((point) => ({
      scenarioId: result.scenario.id,
      scenarioLabel: result.scenario.label,
      month: point.month,
      label: point.label,
      assetsCents: point.assetsCents,
      liabilitiesCents: point.liabilitiesCents,
      netWorthCents: point.netWorthCents,
      realNetWorthCents: point.realNetWorthCents,
    })),
  );
}

function isDebtFreeMilestone(milestone: NetWorthProjectionMilestone): boolean {
  return (
    milestone.id.toLowerCase().includes('debt') || milestone.label.toLowerCase() === 'debt-free'
  );
}

function firstReachedPoint(
  scenario: NetWorthProjectionScenario,
  points: readonly NetWorthProjectionPoint[],
  milestone: NetWorthProjectionMilestone,
): NetWorthProjectionPoint | undefined {
  if (isDebtFreeMilestone(milestone)) return points.find((point) => point.liabilitiesCents === 0);

  return points.find(
    (point) => point.scenarioId === scenario.id && point.netWorthCents >= milestone.thresholdCents,
  );
}

export function buildProjectedMilestoneRows(
  results: readonly NetWorthProjectionResult[],
  milestones: readonly NetWorthProjectionMilestone[],
): readonly ProjectedMilestoneRow[] {
  return results.flatMap((result) =>
    milestones.map((milestone) => {
      const reached = firstReachedPoint(result.scenario, result.points, milestone);
      return {
        scenarioId: result.scenario.id,
        scenarioLabel: result.scenario.label,
        milestoneId: milestone.id,
        milestoneLabel: milestone.label,
        reachedLabel: reached?.label ?? null,
        reachable: reached !== undefined,
        message: reached
          ? `${milestone.label} projected in ${reached.label} (${result.scenario.label})`
          : `${milestone.label} is not reached within this horizon (${result.scenario.label})`,
      };
    }),
  );
}
