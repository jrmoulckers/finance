// SPDX-License-Identifier: BUSL-1.1

export type PeerBenchmarkConfidence = 'low' | 'medium' | 'high';
export type PeerBenchmarkStatus =
  | 'below-peer-range'
  | 'within-peer-range'
  | 'above-peer-range'
  | 'no-data';

export interface PeerBenchmarkProfile {
  readonly optedIn: boolean;
  readonly householdSize?: number;
  readonly incomeBand?: string;
  readonly region?: string;
  readonly lifeStage?: string;
}

export interface PeerBenchmarkCategoryInput {
  readonly categoryName: string;
  readonly amountCents: number;
}

export interface PeerBenchmarkDefinition {
  readonly key: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly peerMonthlyPercentP25: number;
  readonly peerMonthlyPercentP50: number;
  readonly peerMonthlyPercentP75: number;
  readonly confidence: PeerBenchmarkConfidence;
  readonly source: string;
  readonly cohort?: {
    readonly householdSize?: number;
    readonly incomeBand?: string;
    readonly region?: string;
    readonly lifeStage?: string;
  };
}

export interface PeerBenchmarkComparison {
  readonly key: string;
  readonly label: string;
  readonly amountCents: number;
  readonly userMonthlyPercent: number;
  readonly peerRangeLabel: string;
  readonly peerMedianPercent: number;
  readonly status: PeerBenchmarkStatus;
  readonly confidence: PeerBenchmarkConfidence;
  readonly source: string;
  readonly guidance: string;
}

export interface PeerBenchmarkReport {
  readonly optedIn: boolean;
  readonly cohortDescription: string;
  readonly dataUseDisclosure: string;
  readonly comparisons: readonly PeerBenchmarkComparison[];
  readonly clearProfileActionLabel: string;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function confidenceRank(confidence: PeerBenchmarkConfidence): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function getCohortMatchScore(
  definition: PeerBenchmarkDefinition,
  profile: PeerBenchmarkProfile,
): number {
  const cohort = definition.cohort;
  if (!cohort) return 0;

  let score = 0;
  if (cohort.householdSize !== undefined) {
    if (profile.householdSize !== cohort.householdSize) return -1;
    score += 1;
  }
  if (cohort.incomeBand !== undefined) {
    if (profile.incomeBand !== cohort.incomeBand) return -1;
    score += 1;
  }
  if (cohort.region !== undefined) {
    if (profile.region !== cohort.region) return -1;
    score += 1;
  }
  if (cohort.lifeStage !== undefined) {
    if (profile.lifeStage !== cohort.lifeStage) return -1;
    score += 1;
  }
  return score;
}

function categoryMatches(definition: PeerBenchmarkDefinition, categoryName: string): boolean {
  const normalizedCategory = normalize(categoryName);
  return [definition.label, ...definition.aliases].some(
    (alias) => normalize(alias) === normalizedCategory,
  );
}

function selectDefinition(
  categoryName: string,
  profile: PeerBenchmarkProfile,
  definitions: readonly PeerBenchmarkDefinition[],
): PeerBenchmarkDefinition | null {
  return (
    definitions
      .filter((definition) => categoryMatches(definition, categoryName))
      .map((definition) => ({ definition, score: getCohortMatchScore(definition, profile) }))
      .filter((candidate) => candidate.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          confidenceRank(b.definition.confidence) - confidenceRank(a.definition.confidence) ||
          a.definition.label.localeCompare(b.definition.label),
      )[0]?.definition ?? null
  );
}

function comparisonStatus(
  percent: number,
  definition: PeerBenchmarkDefinition,
): PeerBenchmarkStatus {
  if (percent === 0) return 'no-data';
  if (percent < definition.peerMonthlyPercentP25) return 'below-peer-range';
  if (percent > definition.peerMonthlyPercentP75) return 'above-peer-range';
  return 'within-peer-range';
}

function buildGuidance(
  label: string,
  status: PeerBenchmarkStatus,
  percent: number,
  definition: PeerBenchmarkDefinition,
): string {
  const range = `${definition.peerMonthlyPercentP25}-${definition.peerMonthlyPercentP75}%`;
  if (status === 'above-peer-range') {
    return `${label} is ${percent}% of income, above the ${range} peer range. If that supports your goals, keep it; otherwise review recent drivers and choose one small adjustment.`;
  }
  if (status === 'below-peer-range') {
    return `${label} is ${percent}% of income, below the ${range} peer range. That can be healthy when intentional; confirm it still matches your needs and goals.`;
  }
  if (status === 'within-peer-range') {
    return `${label} is ${percent}% of income, within the ${range} peer range for this cohort.`;
  }
  return `${label} does not have enough current spending data for a useful comparison yet.`;
}

function describeCohort(profile: PeerBenchmarkProfile): string {
  const parts = [
    profile.householdSize ? `${profile.householdSize}-person household` : null,
    profile.incomeBand ? `income ${profile.incomeBand}` : null,
    profile.region ?? null,
    profile.lifeStage ?? null,
  ].filter((part): part is string => part !== null && part.length > 0);
  return parts.length > 0 ? parts.join(' • ') : 'Default benchmark baseline';
}

export function clearPeerBenchmarkProfile(): PeerBenchmarkProfile {
  return { optedIn: false };
}

export function buildPeerBenchmarkReport(params: {
  readonly profile: PeerBenchmarkProfile;
  readonly categories: readonly PeerBenchmarkCategoryInput[];
  readonly monthlyIncomeCents: number;
  readonly definitions: readonly PeerBenchmarkDefinition[];
}): PeerBenchmarkReport {
  const dataUseDisclosure =
    'Peer benchmarks use only the cohort attributes you opt into here plus local category totals; clearing the profile removes cohort inputs.';

  if (!params.profile.optedIn) {
    return {
      optedIn: false,
      cohortDescription: 'Not opted in',
      dataUseDisclosure,
      comparisons: [],
      clearProfileActionLabel: 'Clear benchmark profile',
    };
  }

  const monthlyIncomeCents = Math.max(0, params.monthlyIncomeCents);
  const comparisons = params.categories
    .map((category): PeerBenchmarkComparison | null => {
      const definition = selectDefinition(
        category.categoryName,
        params.profile,
        params.definitions,
      );
      if (!definition) return null;
      const userMonthlyPercent =
        monthlyIncomeCents > 0
          ? roundTenth((Math.max(0, category.amountCents) / monthlyIncomeCents) * 100)
          : 0;
      const status =
        monthlyIncomeCents > 0 ? comparisonStatus(userMonthlyPercent, definition) : 'no-data';

      return {
        key: definition.key,
        label: definition.label,
        amountCents: category.amountCents,
        userMonthlyPercent,
        peerRangeLabel: `${definition.peerMonthlyPercentP25}-${definition.peerMonthlyPercentP75}%`,
        peerMedianPercent: definition.peerMonthlyPercentP50,
        status,
        confidence: definition.confidence,
        source: definition.source,
        guidance: buildGuidance(definition.label, status, userMonthlyPercent, definition),
      };
    })
    .filter((comparison): comparison is PeerBenchmarkComparison => comparison !== null)
    .sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label));

  return {
    optedIn: true,
    cohortDescription: describeCohort(params.profile),
    dataUseDisclosure,
    comparisons,
    clearProfileActionLabel: 'Clear benchmark profile',
  };
}
