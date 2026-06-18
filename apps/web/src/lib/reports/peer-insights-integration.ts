// SPDX-License-Identifier: BUSL-1.1

import {
  buildPeerBenchmarkReport,
  type PeerBenchmarkComparison,
  type PeerBenchmarkDefinition,
  type PeerBenchmarkProfile,
  type PeerBenchmarkReport,
} from './peer-benchmarks';

export interface InsightsPeerCategoryInput {
  readonly categoryName: string;
  readonly amount: number;
}

export interface PeerComparisonCard {
  readonly key: string;
  readonly title: string;
  readonly percentLabel: string;
  readonly rangeLabel: string;
  readonly status: PeerBenchmarkComparison['status'];
  readonly ariaLabel: string;
  readonly guidance: string;
}

export const DEFAULT_INSIGHTS_PEER_DEFINITIONS: readonly PeerBenchmarkDefinition[] = [
  {
    key: 'housing-default',
    label: 'Housing',
    aliases: ['housing', 'rent', 'mortgage', 'home'],
    peerMonthlyPercentP25: 25,
    peerMonthlyPercentP50: 30,
    peerMonthlyPercentP75: 35,
    confidence: 'medium',
    source: 'Default opt-in benchmark baseline',
  },
  {
    key: 'food-default',
    label: 'Food',
    aliases: ['food', 'food & dining', 'groceries', 'dining'],
    peerMonthlyPercentP25: 9,
    peerMonthlyPercentP50: 12,
    peerMonthlyPercentP75: 16,
    confidence: 'medium',
    source: 'Default opt-in benchmark baseline',
  },
  {
    key: 'transportation-default',
    label: 'Transportation',
    aliases: ['transportation', 'transport', 'car', 'transit'],
    peerMonthlyPercentP25: 8,
    peerMonthlyPercentP50: 12,
    peerMonthlyPercentP75: 15,
    confidence: 'medium',
    source: 'Default opt-in benchmark baseline',
  },
  {
    key: 'childcare-default',
    label: 'Childcare',
    aliases: ['childcare', 'kids', 'school', 'family'],
    peerMonthlyPercentP25: 6,
    peerMonthlyPercentP50: 10,
    peerMonthlyPercentP75: 18,
    confidence: 'low',
    source: 'Family expense peer baseline',
  },
];

export function buildInsightsPeerComparisonReport(params: {
  readonly profile: PeerBenchmarkProfile;
  readonly categorySpending: readonly InsightsPeerCategoryInput[];
  readonly monthlyIncomeCents: number;
  readonly definitions?: readonly PeerBenchmarkDefinition[];
}): PeerBenchmarkReport {
  return buildPeerBenchmarkReport({
    profile: params.profile,
    categories: params.categorySpending.map((category) => ({
      categoryName: category.categoryName,
      amountCents: category.amount,
    })),
    monthlyIncomeCents: params.monthlyIncomeCents,
    definitions: params.definitions ?? DEFAULT_INSIGHTS_PEER_DEFINITIONS,
  });
}

export function buildPeerComparisonCards(
  report: PeerBenchmarkReport,
): readonly PeerComparisonCard[] {
  return report.comparisons.map((comparison) => ({
    key: comparison.key,
    title: comparison.label,
    percentLabel: `${comparison.userMonthlyPercent}% of income`,
    rangeLabel: `Peer range ${comparison.peerRangeLabel}`,
    status: comparison.status,
    ariaLabel: `${comparison.label}: ${comparison.userMonthlyPercent}% of income, peer range ${comparison.peerRangeLabel}, ${comparison.status}.`,
    guidance: comparison.guidance,
  }));
}
