// SPDX-License-Identifier: BUSL-1.1

import type { RecommendationCandidate, RecommendationPriority } from './types';

const PRIORITY_WEIGHTS: Readonly<Record<RecommendationPriority, number>> = {
  critical: 60,
  high: 48,
  medium: 36,
  low: 24,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreImpact(monthlySavingsCents: number | undefined): number {
  if (!monthlySavingsCents || monthlySavingsCents <= 0) {
    return 0;
  }

  return Math.min(20, Math.round(Math.sqrt(monthlySavingsCents / 100)));
}

export function scoreRecommendation(candidate: RecommendationCandidate): number {
  const { recommendation, signal } = candidate;

  const baseScore = PRIORITY_WEIGHTS[recommendation.priority];
  const urgencyScore = clamp(signal.urgency, 0, 1) * 18;
  const confidenceScore = clamp(signal.confidence, 0, 1) * 10;
  const specificityScore = clamp(signal.specificity, 0, 1) * 12;
  const impactScore = scoreImpact(
    signal.monthlySavingsCents ?? recommendation.impact?.monthlySavingsCents,
  );

  return clamp(
    Math.round(baseScore + urgencyScore + confidenceScore + specificityScore + impactScore),
    0,
    100,
  );
}
