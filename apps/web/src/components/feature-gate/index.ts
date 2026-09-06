// SPDX-License-Identifier: BUSL-1.1

export { FeatureGateProvider, useFeatureGate, useOptionalFeatureGate } from './FeatureGateProvider';
export type { FeatureGateContextValue, FeatureGateProviderProps } from './FeatureGateProvider';
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
  FEATURE_DEFINITIONS,
} from './feature-gate-engine';
export type {
  FeatureId,
  FeatureDefinition,
  FeatureAccessResult,
  FeatureUsage,
  SubscriptionTier,
} from './feature-gate-engine';
