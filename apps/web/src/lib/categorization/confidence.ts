// SPDX-License-Identifier: BUSL-1.1

import type { ConfidenceLevel, MatchKind } from './types';

export const CONFIDENCE_BY_MATCH: Readonly<Record<MatchKind, number>> = {
  exact: 0.95,
  substring: 0.75,
  'amount-range': 0.5,
};

export function getConfidence(matchKind: MatchKind): number {
  return CONFIDENCE_BY_MATCH[matchKind];
}

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) {
    return 'high';
  }

  if (confidence >= 0.7) {
    return 'medium';
  }

  return 'low';
}

export function meetsConfidenceThreshold(confidence: number, threshold: number): boolean {
  return confidence >= threshold;
}
