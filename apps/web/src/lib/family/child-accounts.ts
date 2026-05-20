// SPDX-License-Identifier: BUSL-1.1

/**
 * Child & teen sub-account engine.
 *
 * Pure functions for creating and managing sub-accounts with role-based
 * feature gating, parent linking, and transaction visibility controls.
 * All monetary values in integer cents.
 *
 * References: #1796
 */

import type { ChildAccount, FamilyMember, ParentalRole } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum age for teen features. */
const TEEN_MIN_AGE = 13;

/** Minimum age for child account creation. */
const CHILD_MIN_AGE = 5;

/** Maximum age for dependent accounts. */
const DEPENDENT_MAX_AGE = 17;

// ---------------------------------------------------------------------------
// Feature gating
// ---------------------------------------------------------------------------

/** Features that can be gated by age/role. */
export type AccountFeature =
  | 'view-balance'
  | 'view-transactions'
  | 'request-spending'
  | 'set-goals'
  | 'category-spending'
  | 'transfer-to-goal'
  | 'view-education';

/**
 * Returns the set of features available for a given age.
 *
 * @param age - Member's age in years
 * @returns Array of enabled features for this age
 */
export function getAvailableFeatures(age: number): readonly AccountFeature[] {
  if (age < CHILD_MIN_AGE) {
    return ['view-balance'];
  }
  if (age < TEEN_MIN_AGE) {
    return ['view-balance', 'set-goals', 'view-education'];
  }
  // Teen (13-17)
  return [
    'view-balance',
    'view-transactions',
    'request-spending',
    'set-goals',
    'category-spending',
    'transfer-to-goal',
    'view-education',
  ];
}

/**
 * Determines the appropriate role based on age.
 *
 * @param age - Member's age in years
 * @returns The parental role for this age
 */
export function roleForAge(age: number): ParentalRole {
  if (age >= 18) return 'parent';
  if (age >= TEEN_MIN_AGE) return 'teen';
  return 'child';
}

/**
 * Checks whether a member has access to a specific feature.
 *
 * @param age - Member's age in years
 * @param feature - Feature to check
 * @returns True if the feature is available
 */
export function hasFeature(age: number, feature: AccountFeature): boolean {
  return getAvailableFeatures(age).includes(feature);
}

// ---------------------------------------------------------------------------
// Account creation & management
// ---------------------------------------------------------------------------

/**
 * Creates a new child/teen sub-account.
 *
 * @param params - Account creation parameters
 * @returns A new ChildAccount object
 * @throws If age is outside valid range for dependent accounts
 */
export function createChildAccount(params: {
  readonly id: string;
  readonly memberId: string;
  readonly parentAccountId: string;
  readonly name: string;
  readonly age: number;
  readonly now: string;
}): ChildAccount {
  const { id, memberId, parentAccountId, name, age, now } = params;

  if (age < CHILD_MIN_AGE || age > DEPENDENT_MAX_AGE) {
    throw new RangeError(
      `Age ${age} is outside valid range (${CHILD_MIN_AGE}-${DEPENDENT_MAX_AGE}) for dependent accounts`,
    );
  }

  const role = age >= TEEN_MIN_AGE ? 'teen' : 'child';
  const canViewTransactions = hasFeature(age, 'view-transactions');

  return {
    id,
    memberId,
    parentAccountId,
    name,
    role,
    balanceCents: 0,
    canViewTransactions,
    createdAt: now,
  };
}

/**
 * Creates a new family member record.
 *
 * @param params - Member creation parameters
 * @returns A new FamilyMember object
 */
export function createFamilyMember(params: {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly parentId: string | null;
  readonly now: string;
}): FamilyMember {
  const { id, name, age, parentId, now } = params;
  return {
    id,
    name,
    role: roleForAge(age),
    age,
    parentId,
    createdAt: now,
  };
}

/**
 * Applies a balance change to a child account (immutable update).
 *
 * @param account - The current child account
 * @param deltaCents - Amount to add (positive) or subtract (negative) in cents
 * @returns Updated account with new balance
 * @throws If resulting balance would be negative
 */
export function adjustBalance(account: ChildAccount, deltaCents: number): ChildAccount {
  const newBalance = account.balanceCents + deltaCents;
  if (newBalance < 0) {
    throw new RangeError(
      `Insufficient balance: ${account.balanceCents} cents + ${deltaCents} cents = ${newBalance} cents`,
    );
  }
  return { ...account, balanceCents: newBalance };
}

/**
 * Updates transaction visibility for an account based on age.
 *
 * @param account - The current child account
 * @param age - Current age of the member
 * @returns Updated account with correct visibility setting
 */
export function updateVisibility(account: ChildAccount, age: number): ChildAccount {
  const canView = hasFeature(age, 'view-transactions');
  if (account.canViewTransactions === canView) return account;
  return { ...account, canViewTransactions: canView };
}

/**
 * Checks if a member's account is linked to a given parent.
 *
 * @param account - The child account to check
 * @param parentAccountId - The parent account ID
 * @returns True if the account is linked to this parent
 */
export function isLinkedToParent(account: ChildAccount, parentAccountId: string): boolean {
  return account.parentAccountId === parentAccountId;
}
