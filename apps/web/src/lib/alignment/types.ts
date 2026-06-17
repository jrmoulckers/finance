// SPDX-License-Identifier: BUSL-1.1

export type AlignmentValueId =
  | 'security'
  | 'experiences'
  | 'generosity'
  | 'growth'
  | 'freedom'
  | 'family'
  | 'health'
  | 'education';

export type AlignmentAlertTarget = AlignmentValueId | 'coverage';

export interface AlignmentValueDefinition {
  readonly id: AlignmentValueId;
  readonly label: string;
  readonly description: string;
  readonly iconName: string;
  readonly exampleCategories: readonly string[];
}

export interface UserValuePreference {
  readonly valueId: AlignmentValueId;
  readonly weight: number;
}

export interface AlignmentValueAllocation {
  readonly valueId: AlignmentValueId;
  readonly weight: number;
}

export interface AlignmentSpendingCategory {
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly amount: number;
  readonly source: 'expense' | 'savings';
  readonly allocations: readonly AlignmentValueAllocation[];
}

export interface AlignmentSpendingSnapshot {
  readonly categories: readonly AlignmentSpendingCategory[];
  readonly totalInputAmount: number;
  readonly totalMappedAmount: number;
  readonly unmappedAmount: number;
}

export interface ValueAlignmentBreakdown {
  readonly valueId: AlignmentValueId;
  readonly label: string;
  readonly priorityRank: number | null;
  readonly preferenceWeight: number;
  readonly targetShare: number;
  readonly actualShare: number;
  readonly actualAmount: number;
  readonly targetAmount: number;
  readonly gapShare: number;
}

export interface AlignmentScoreResult {
  readonly score: number;
  readonly label: 'Highly aligned' | 'Mostly aligned' | 'Mixed alignment' | 'Needs attention';
  readonly mappedCoverage: number;
  readonly totalConsideredAmount: number;
  readonly breakdown: readonly ValueAlignmentBreakdown[];
}

export interface MisalignmentAlert {
  readonly id: string;
  readonly valueId: AlignmentAlertTarget;
  readonly severity: 'gentle' | 'warning';
  readonly title: string;
  readonly description: string;
  readonly actualShare?: number;
  readonly targetShare?: number;
}
