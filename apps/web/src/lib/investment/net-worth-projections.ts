// SPDX-License-Identifier: BUSL-1.1

/** Net-worth growth projection engine for web beta planning (#2236). */

import { bankersRound } from './rebalancing';

export interface NetWorthProjectionMilestone {
  readonly id: string;
  readonly label: string;
  readonly thresholdCents: number;
}

export interface NetWorthProjectionScenario {
  readonly id: string;
  readonly label: string;
  readonly annualReturnPercent: number;
}

export interface NetWorthProjectionInput {
  readonly currentAssetsCents: number;
  readonly currentLiabilitiesCents: number;
  readonly monthlyContributionCents: number;
  readonly monthlyDebtPaymentCents: number;
  readonly annualAssetReturnPercent: number;
  readonly annualInflationPercent: number;
  readonly horizonMonths: number;
  readonly startMonth?: string;
  readonly milestones?: readonly NetWorthProjectionMilestone[];
}

export interface NetWorthProjectionPoint {
  readonly scenarioId: string;
  readonly month: number;
  readonly label: string;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly netWorthCents: number;
  readonly realNetWorthCents: number;
}

export interface ProjectedMilestone {
  readonly id: string;
  readonly label: string;
  readonly thresholdCents: number;
  readonly reachedMonth: number | null;
  readonly reachedLabel: string | null;
  readonly reachable: boolean;
}

export interface NetWorthProjectionResult {
  readonly scenario: NetWorthProjectionScenario;
  readonly points: readonly NetWorthProjectionPoint[];
  readonly milestones: readonly ProjectedMilestone[];
}

export const DEFAULT_NET_WORTH_PROJECTION_SCENARIOS: readonly NetWorthProjectionScenario[] = [
  { id: 'conservative', label: 'Conservative', annualReturnPercent: 3 },
  { id: 'base', label: 'Base', annualReturnPercent: 6 },
  { id: 'optimistic', label: 'Optimistic', annualReturnPercent: 8 },
];

function monthLabel(startMonth: string, offset: number): string {
  const [yearText, monthText] = startMonth.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function defaultStartMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthlyRate(annualPercent: number): number {
  return Math.pow(1 + annualPercent / 100, 1 / 12) - 1;
}

function buildMilestones(
  points: readonly NetWorthProjectionPoint[],
  milestones: readonly NetWorthProjectionMilestone[],
): readonly ProjectedMilestone[] {
  return milestones.map((milestone) => {
    const first = points.find((point) => point.netWorthCents >= milestone.thresholdCents);
    return {
      ...milestone,
      reachedMonth: first?.month ?? null,
      reachedLabel: first?.label ?? null,
      reachable: first !== undefined,
    };
  });
}

export function projectNetWorthGrowth(
  input: NetWorthProjectionInput,
  scenarios: readonly NetWorthProjectionScenario[] = DEFAULT_NET_WORTH_PROJECTION_SCENARIOS,
): readonly NetWorthProjectionResult[] {
  const horizonMonths = Math.max(0, Math.floor(input.horizonMonths));
  const startMonth = input.startMonth ?? defaultStartMonth();
  const milestones = input.milestones ?? [];
  const initialAssets = input.currentAssetsCents;
  const initialLiabilities = Math.max(0, input.currentLiabilitiesCents);
  const inflationRate = monthlyRate(input.annualInflationPercent);

  return scenarios.map((scenario) => {
    const growthRate = monthlyRate(scenario.annualReturnPercent);
    let assets = initialAssets;
    let liabilities = initialLiabilities;
    const points: NetWorthProjectionPoint[] = [];

    for (let month = 0; month <= horizonMonths; month += 1) {
      if (month > 0) {
        assets = (assets + input.monthlyContributionCents) * (1 + growthRate);
        liabilities = Math.max(0, liabilities - Math.max(0, input.monthlyDebtPaymentCents));
      }

      const netWorthCents = bankersRound(assets - liabilities);
      points.push({
        scenarioId: scenario.id,
        month,
        label: monthLabel(startMonth, month),
        assetsCents: bankersRound(assets),
        liabilitiesCents: bankersRound(liabilities),
        netWorthCents,
        realNetWorthCents: bankersRound(netWorthCents / Math.pow(1 + inflationRate, month)),
      });
    }

    return {
      scenario,
      points,
      milestones: buildMilestones(points, milestones),
    };
  });
}

export function deriveProjectionScenarios(
  baseAnnualReturnPercent: number,
  spreadPercent = 2,
): readonly NetWorthProjectionScenario[] {
  return [
    {
      id: 'conservative',
      label: 'Conservative',
      annualReturnPercent: baseAnnualReturnPercent - spreadPercent,
    },
    { id: 'base', label: 'Base', annualReturnPercent: baseAnnualReturnPercent },
    {
      id: 'optimistic',
      label: 'Optimistic',
      annualReturnPercent: baseAnnualReturnPercent + spreadPercent,
    },
  ];
}
