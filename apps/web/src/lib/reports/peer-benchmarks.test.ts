// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildPeerBenchmarkReport,
  clearPeerBenchmarkProfile,
  type PeerBenchmarkDefinition,
} from './peer-benchmarks';

const definitions: PeerBenchmarkDefinition[] = [
  {
    key: 'housing-default',
    label: 'Housing',
    aliases: ['rent', 'mortgage'],
    peerMonthlyPercentP25: 25,
    peerMonthlyPercentP50: 30,
    peerMonthlyPercentP75: 35,
    confidence: 'medium',
    source: 'Default 50/30/20 baseline',
  },
  {
    key: 'housing-cohort',
    label: 'Housing',
    aliases: ['rent', 'mortgage'],
    peerMonthlyPercentP25: 28,
    peerMonthlyPercentP50: 33,
    peerMonthlyPercentP75: 38,
    confidence: 'high',
    source: 'Opt-in peer cohort beta sample',
    cohort: { householdSize: 2, incomeBand: '75k-100k', region: 'Midwest' },
  },
  {
    key: 'food',
    label: 'Food',
    aliases: ['groceries', 'dining'],
    peerMonthlyPercentP25: 9,
    peerMonthlyPercentP50: 12,
    peerMonthlyPercentP75: 16,
    confidence: 'medium',
    source: 'Default benchmark baseline',
  },
];

describe('peer benchmarks', () => {
  it('requires opt-in before returning comparisons', () => {
    const report = buildPeerBenchmarkReport({
      profile: { optedIn: false, householdSize: 2 },
      categories: [{ categoryName: 'Housing', amountCents: 320000 }],
      monthlyIncomeCents: 800000,
      definitions,
    });

    expect(report.optedIn).toBe(false);
    expect(report.comparisons).toEqual([]);
    expect(report.dataUseDisclosure).toContain('opt into');
  });

  it('selects the best matching cohort and produces neutral guidance', () => {
    const report = buildPeerBenchmarkReport({
      profile: { optedIn: true, householdSize: 2, incomeBand: '75k-100k', region: 'Midwest' },
      categories: [
        { categoryName: 'Housing', amountCents: 320000 },
        { categoryName: 'Food', amountCents: 90000 },
      ],
      monthlyIncomeCents: 800000,
      definitions,
    });

    expect(report.cohortDescription).toContain('2-person household');
    expect(report.comparisons[0]).toMatchObject({
      key: 'housing-cohort',
      userMonthlyPercent: 40,
      peerRangeLabel: '28-38%',
      status: 'above-peer-range',
      confidence: 'high',
    });
    expect(report.comparisons[0].guidance).toContain('If that supports your goals');
  });

  it('clears profile data locally', () => {
    expect(clearPeerBenchmarkProfile()).toEqual({ optedIn: false });
  });
});
