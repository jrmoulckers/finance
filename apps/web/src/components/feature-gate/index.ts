// SPDX-License-Identifier: BUSL-1.1

export { FeatureGateProvider, useFeatureGate } from './FeatureGateProvider';
export type { FeatureGateProviderProps } from './FeatureGateProvider';
export { FeatureGate } from './FeatureGate';
export type { FeatureGateProps } from './FeatureGate';
export { UpgradePrompt } from './UpgradePrompt';
export type { UpgradePromptProps } from './UpgradePrompt';
export { LimitBanner } from './LimitBanner';
export type { LimitBannerProps } from './LimitBanner';
export {
  checkFeatureAccess,
  getAvailableFeatures,
  getPremiumFeatures,
  loadSubscriptionState,
  saveSubscriptionState,
  FEATURE_DEFINITIONS,
} from './feature-gate-engine';
export type {
  FeatureId,
  FeatureDefinition,
  FeatureAccessResult,
  FeatureUsage,
  SubscriptionTier,
  SubscriptionState,
} from './feature-gate-engine';
