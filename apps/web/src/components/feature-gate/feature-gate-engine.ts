// SPDX-License-Identifier: BUSL-1.1

/**
 * Feature gating system for freemium tier management.
 *
 * Defines available features, their tier requirements, and limits.
 * This is a client-side enforcement layer — the server should also
 * validate access on any synced operations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subscription tier levels. */
export type SubscriptionTier = 'free' | 'premium';

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
  /** Minimum tier required to access. */
  readonly requiredTier: SubscriptionTier;
  /** For free tier: maximum count allowed (null = unlimited). */
  readonly freeLimit: number | null;
  /** For premium tier: maximum count allowed (null = unlimited). */
  readonly premiumLimit: number | null;
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
  /** The tier required to unlock this feature. */
  readonly requiredTier: SubscriptionTier;
}

/** User's current subscription state. */
export interface SubscriptionState {
  /** Current subscription tier. */
  readonly tier: SubscriptionTier;
  /** Whether the subscription is active (not expired). */
  readonly isActive: boolean;
  /** ISO date string when the current period ends (null for free). */
  readonly periodEnd: string | null;
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
    requiredTier: 'free',
    freeLimit: 3,
    premiumLimit: null,
  },
  unlimited_budgets: {
    id: 'unlimited_budgets',
    name: 'Unlimited Budgets',
    description: 'Create budgets for every spending category',
    requiredTier: 'free',
    freeLimit: 3,
    premiumLimit: null,
  },
  unlimited_goals: {
    id: 'unlimited_goals',
    name: 'Unlimited Goals',
    description: 'Set as many savings goals as you need',
    requiredTier: 'free',
    freeLimit: 2,
    premiumLimit: null,
  },
  data_export: {
    id: 'data_export',
    name: 'Data Export',
    description: 'Export your financial data in CSV and PDF formats',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
  },
  insights_dashboard: {
    id: 'insights_dashboard',
    name: 'Financial Insights',
    description: 'Advanced spending analytics and recommendations',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
  },
  achievements: {
    id: 'achievements',
    name: 'Achievements & Gamification',
    description: 'Earn badges and track streaks for financial milestones',
    requiredTier: 'free',
    freeLimit: null,
    premiumLimit: null,
  },
  custom_categories: {
    id: 'custom_categories',
    name: 'Custom Categories',
    description: 'Create your own transaction categories',
    requiredTier: 'free',
    freeLimit: 5,
    premiumLimit: null,
  },
  recurring_transactions: {
    id: 'recurring_transactions',
    name: 'Recurring Transactions',
    description: 'Automatically log recurring income and expenses',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
  },
  multi_currency: {
    id: 'multi_currency',
    name: 'Multi-Currency Support',
    description: 'Track accounts and transactions in different currencies',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
  },
  receipt_capture: {
    id: 'receipt_capture',
    name: 'Receipt Capture',
    description: 'Scan and attach receipts to transactions',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
  },
  advanced_charts: {
    id: 'advanced_charts',
    name: 'Advanced Charts',
    description: 'Detailed financial visualizations and trend analysis',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
  },
  priority_support: {
    id: 'priority_support',
    name: 'Priority Support',
    description: 'Get faster responses from our support team',
    requiredTier: 'premium',
    freeLimit: null,
    premiumLimit: null,
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
  tier: SubscriptionTier,
  usage?: FeatureUsage,
): FeatureAccessResult {
  const feature = FEATURE_DEFINITIONS[featureId];

  // Premium features are blocked for free users
  if (feature.requiredTier === 'premium' && tier === 'free') {
    return {
      allowed: false,
      atLimit: false,
      currentCount: 0,
      maxCount: null,
      gateMessage: `${feature.name} is a premium feature. Upgrade to unlock.`,
      requiredTier: 'premium',
    };
  }

  // Check limits for features with count-based restrictions
  const limit = tier === 'free' ? feature.freeLimit : feature.premiumLimit;
  if (limit !== null && usage) {
    const currentCount = getUsageCount(featureId, usage);
    const atLimit = currentCount >= limit;

    return {
      allowed: true,
      atLimit,
      currentCount,
      maxCount: limit,
      gateMessage: atLimit
        ? `You've reached the free tier limit of ${limit} ${feature.name.toLowerCase()}. Upgrade to premium for unlimited access.`
        : '',
      requiredTier: feature.requiredTier,
    };
  }

  return {
    allowed: true,
    atLimit: false,
    currentCount: 0,
    maxCount: limit,
    gateMessage: '',
    requiredTier: feature.requiredTier,
  };
}

/**
 * Get all features available for a tier.
 */
export function getAvailableFeatures(tier: SubscriptionTier): FeatureDefinition[] {
  return Object.values(FEATURE_DEFINITIONS).filter(
    (feature) => feature.requiredTier === 'free' || tier === 'premium',
  );
}

/**
 * Get all premium-only features (for upgrade prompts).
 */
export function getPremiumFeatures(): FeatureDefinition[] {
  return Object.values(FEATURE_DEFINITIONS).filter((feature) => feature.requiredTier === 'premium');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUsageCount(featureId: FeatureId, usage: FeatureUsage): number {
  switch (featureId) {
    case 'unlimited_accounts':
      return usage.accountCount;
    case 'unlimited_budgets':
      return usage.budgetCount;
    case 'unlimited_goals':
      return usage.goalCount;
    case 'custom_categories':
      return usage.categoryCount;
    default:
      return 0;
  }
}

/**
 * Load subscription state from localStorage.
 * In production, this would come from a server/auth provider.
 */
export function loadSubscriptionState(): SubscriptionState {
  try {
    const stored = localStorage.getItem('finance_subscription');
    if (stored) {
      return JSON.parse(stored) as SubscriptionState;
    }
  } catch {
    // Fall through to default
  }

  return {
    tier: 'free',
    isActive: true,
    periodEnd: null,
  };
}

/**
 * Save subscription state to localStorage.
 * In production, this would be managed by the server.
 */
export function saveSubscriptionState(state: SubscriptionState): void {
  try {
    localStorage.setItem('finance_subscription', JSON.stringify(state));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}
