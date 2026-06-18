// SPDX-License-Identifier: BUSL-1.1

import type { PeerBenchmarkDefinition } from './peer-benchmarks';

/** Versioned peer benchmark dataset governance helpers (#2632). */

export interface VersionedPeerBenchmarkDataset {
  readonly version: string;
  readonly reviewedAt: string;
  readonly reviewCadenceDays: number;
  readonly definitions: readonly PeerBenchmarkDefinition[];
  readonly fallbackDefinitions: readonly PeerBenchmarkDefinition[];
}

export interface PeerBenchmarkSourceRow {
  readonly key: string;
  readonly label: string;
  readonly source: string;
  readonly confidence: PeerBenchmarkDefinition['confidence'];
  readonly cohortLabel: string;
}

export interface PeerBenchmarkDatasetGovernanceReport {
  readonly version: string;
  readonly isStale: boolean;
  readonly nextReviewDueDate: string;
  readonly sourceRows: readonly PeerBenchmarkSourceRow[];
  readonly lowConfidenceKeys: readonly string[];
  readonly fallbackDefinitionKeys: readonly string[];
  readonly warnings: readonly string[];
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function cohortLabel(definition: PeerBenchmarkDefinition): string {
  const cohort = definition.cohort;
  if (!cohort) return 'Default baseline';
  const parts = [
    cohort.householdSize ? `${cohort.householdSize}-person` : null,
    cohort.incomeBand ? `income ${cohort.incomeBand}` : null,
    cohort.region ?? null,
    cohort.lifeStage ?? null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' • ') : 'Default baseline';
}

export function buildPeerBenchmarkDatasetGovernanceReport(params: {
  readonly dataset: VersionedPeerBenchmarkDataset;
  readonly asOfDate: string;
}): PeerBenchmarkDatasetGovernanceReport {
  const nextReviewDueDate = addDays(params.dataset.reviewedAt, params.dataset.reviewCadenceDays);
  const isStale = nextReviewDueDate < params.asOfDate;
  const sourceRows = [...params.dataset.definitions, ...params.dataset.fallbackDefinitions].map(
    (definition) => ({
      key: definition.key,
      label: definition.label,
      source: definition.source,
      confidence: definition.confidence,
      cohortLabel: cohortLabel(definition),
    }),
  );
  const lowConfidenceKeys = sourceRows
    .filter((row) => row.confidence === 'low')
    .map((row) => row.key)
    .sort();
  const fallbackDefinitionKeys = params.dataset.fallbackDefinitions
    .map((definition) => definition.key)
    .sort();
  const warnings = [
    isStale
      ? `Benchmark dataset ${params.dataset.version} is past its ${nextReviewDueDate} review date.`
      : null,
    lowConfidenceKeys.length > 0
      ? `Low-confidence benchmark ranges need review: ${lowConfidenceKeys.join(', ')}.`
      : null,
    fallbackDefinitionKeys.length > 0
      ? `Fallback defaults available when no cohort matches: ${fallbackDefinitionKeys.join(', ')}.`
      : null,
  ].filter((warning): warning is string => warning !== null);

  return {
    version: params.dataset.version,
    isStale,
    nextReviewDueDate,
    sourceRows,
    lowConfidenceKeys,
    fallbackDefinitionKeys,
    warnings,
  };
}
