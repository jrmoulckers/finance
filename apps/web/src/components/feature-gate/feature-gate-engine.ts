// SPDX-License-Identifier: BUSL-1.1

/**
 * Local capability registry.
 *
 * Entitlement tier/feature allocation does not belong in the Web client. The
 * minimized shared contract currently allocates only bank-connection capacity;
 * all capabilities listed here are local UX and remain available regardless of
 * entitlement state. Server actions authorize independently on the server.
 */

import type { EntitlementTier } from '../../entitlements';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compatibility name for UI that displays the shared logical tier. */
export type SubscriptionTier = EntitlementTier;

/** Feature identifiers for gating. */
export type FeatureId =
  | 'unlimited_accounts'
  | 'unlimited_budgets'
  | 'unlimited_goals'
  | 'data_export'
  | 'insights_dashboard'
  | 'achievements'
  | 'custom_categories'
  | 'recurring_transactions'
  | 'multi_currency'
  | 'receipt_capture'
  | 'advanced_charts'
  | 'priority_support';

/** Feature definition with tier requirements and limits. */
export interface FeatureDefinition {
  /** Unique feature identifier. */
  readonly id: FeatureId;
  /** Human-readable feature name. */
  readonly name: string;
  /** Description of the feature. */
  readonly description: string;
  /** These capabilities are processed locally and are never paid gates. */
  readonly localOnly: true;
}

/** Result of checking feature access. */
export interface FeatureAccessResult {
  /** Whether the feature is accessible at the current tier. */
  readonly allowed: boolean;
  /** Whether the user has reached the limit for this feature. */
  readonly atLimit: boolean;
  /** Current usage count (if applicable). */
  readonly currentCount: number;
  /** Maximum allowed count at current tier (null = unlimited). */
  readonly maxCount: number | null;
  /** Message to show when feature is gated. */
  readonly gateMessage: string;
  /** Always null: the Web client does not allocate these capabilities by tier. */
  readonly requiredTier: null;
}

/** Usage counts for features with limits. */
export interface FeatureUsage {
  readonly accountCount: number;
  readonly budgetCount: number;
  readonly goalCount: number;
  readonly categoryCount: number;
}

// ---------------------------------------------------------------------------
// Feature definitions
// ---------------------------------------------------------------------------

export const FEATURE_DEFINITIONS: Record<FeatureId, FeatureDefinition> = {
  unlimited_accounts: {
    id: 'unlimited_accounts',
    name: 'Unlimited Accounts',
    description: 'Track all your financial accounts in one place',
    localOnly: true,
  },
  unlimited_budgets: {
    id: 'unlimited_budgets',
    name: 'Unlimited Budgets',
    description: 'Create budgets for every spending category',
    localOnly: true,
  },
  unlimited_goals: {
    id: 'unlimited_goals',
    name: 'Unlimited Goals',
    description: 'Set as many savings goals as you need',
    localOnly: true,
  },
  data_export: {
    id: 'data_export',
    name: 'Data Export',
    description: 'Export your financial data in CSV and PDF formats',
    localOnly: true,
  },
  insights_dashboard: {
    id: 'insights_dashboard',
    name: 'Financial Insights',
    description: 'Advanced spending analytics and recommendations',
    localOnly: true,
  },
  achievements: {
    id: 'achievements',
    name: 'Achievements & Gamification',
    description: 'Earn badges and track streaks for financial milestones',
    localOnly: true,
  },
  custom_categories: {
    id: 'custom_categories',
    name: 'Custom Categories',
    description: 'Create your own transaction categories',
    localOnly: true,
  },
  recurring_transactions: {
    id: 'recurring_transactions',
    name: 'Recurring Transactions',
    description: 'Automatically log recurring income and expenses',
    localOnly: true,
  },
  multi_currency: {
    id: 'multi_currency',
    name: 'Multi-Currency Support',
    description: 'Track accounts and transactions in different currencies',
    localOnly: true,
  },
  receipt_capture: {
    id: 'receipt_capture',
    name: 'Receipt Capture',
    description: 'Scan and attach receipts to transactions',
    localOnly: true,
  },
  advanced_charts: {
    id: 'advanced_charts',
    name: 'Advanced Charts',
    description: 'Detailed financial visualizations and trend analysis',
    localOnly: true,
  },
  priority_support: {
    id: 'priority_support',
    name: 'Priority Support',
    description: 'Get faster responses from our support team',
    localOnly: true,
  },
};

// ---------------------------------------------------------------------------
// Access checking
// ---------------------------------------------------------------------------

/**
 * Check whether a feature is accessible for the given tier and usage.
 */
export function checkFeatureAccess(
  featureId: FeatureId,
  _tier?: SubscriptionTier,
  _usage?: FeatureUsage,
): FeatureAccessResult {
  void FEATURE_DEFINITIONS[featureId];
  return {
    allowed: true,
    atLimit: false,
    currentCount: 0,
    maxCount: null,
    gateMessage: '',
    requiredTier: null,
  };
}

/**
 * Get all features available for a tier.
 */
export function getAvailableFeatures(_tier?: SubscriptionTier): FeatureDefinition[] {
  return Object.values(FEATURE_DEFINITIONS);
}

/**
 * Get all premium-only features (for upgrade prompts).
 */
export function getPremiumFeatures(): FeatureDefinition[] {
  return [];
}
