// SPDX-License-Identifier: BUSL-1.1

export type HouseholdOwner = 'mine' | 'yours' | 'ours';
export type HouseholdVisibility = HouseholdOwner | 'summary-only' | 'hidden';

export interface HouseholdLineItem {
  readonly id: string;
  readonly owner: HouseholdOwner;
  readonly visibility: HouseholdVisibility;
  readonly description: string;
  readonly amountCents: number;
}

export interface PrivacyValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface PrivacySafeAggregate {
  readonly totalCents: number;
  readonly visibleItems: readonly HouseholdLineItem[];
  readonly summaryOnlyCents: number;
}

export function validateHouseholdVisibility(items: readonly HouseholdLineItem[]): PrivacyValidationResult {
  const errors = items
    .filter((item) => (item.visibility === 'summary-only' || item.visibility === 'hidden') && item.description.trim().length > 0)
    .map((item) => `${item.id}:line-item-leakage`);
  return { valid: errors.length === 0, errors };
}

export function buildPrivacySafeAggregate(
  items: readonly HouseholdLineItem[],
  viewer: 'mine' | 'yours',
): PrivacySafeAggregate {
  const visibleItems = items.filter((item) => {
    if (item.visibility === 'hidden' || item.visibility === 'summary-only') return false;
    return item.visibility === 'ours' || item.visibility === viewer;
  });
  const summaryOnlyCents = items
    .filter((item) => item.visibility === 'summary-only')
    .reduce((sum, item) => sum + item.amountCents, 0);
  return {
    totalCents: visibleItems.reduce((sum, item) => sum + item.amountCents, 0) + summaryOnlyCents,
    visibleItems,
    summaryOnlyCents,
  };
}
