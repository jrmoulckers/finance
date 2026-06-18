// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildPeerBenchmarkDatasetGovernanceReport } from './peer-benchmark-dataset-governance';

describe('buildPeerBenchmarkDatasetGovernanceReport', () => {
  it('surfaces version, sources, confidence, fallback defaults, and stale review warnings', () => {
    const report = buildPeerBenchmarkDatasetGovernanceReport({
      asOfDate: '2026-01-15',
      dataset: {
        version: '2025.04',
        reviewedAt: '2025-04-01',
        reviewCadenceDays: 180,
        definitions: [
          {
            key: 'housing-midwest',
            label: 'Housing',
            aliases: ['rent'],
            peerMonthlyPercentP25: 25,
            peerMonthlyPercentP50: 30,
            peerMonthlyPercentP75: 35,
            confidence: 'low',
            source: 'Curated beta cohort',
            cohort: { householdSize: 2, region: 'Midwest' },
          },
        ],
        fallbackDefinitions: [
          {
            key: 'housing-default',
            label: 'Housing',
            aliases: ['rent'],
            peerMonthlyPercentP25: 25,
            peerMonthlyPercentP50: 30,
            peerMonthlyPercentP75: 35,
            confidence: 'medium',
            source: 'Default 50/30/20 baseline',
          },
        ],
      },
    });

    expect(report.version).toBe('2025.04');
    expect(report.isStale).toBe(true);
    expect(report.sourceRows[0]).toMatchObject({
      source: 'Curated beta cohort',
      confidence: 'low',
      cohortLabel: '2-person • Midwest',
    });
    expect(report.lowConfidenceKeys).toEqual(['housing-midwest']);
    expect(report.fallbackDefinitionKeys).toEqual(['housing-default']);
    expect(report.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Fallback defaults available')]),
    );
  });
});
