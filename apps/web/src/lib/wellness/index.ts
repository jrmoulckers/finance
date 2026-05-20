// SPDX-License-Identifier: BUSL-1.1

/**
 * Wellness library barrel export.
 *
 * Re-exports all wellness, education, and life-planning modules.
 *
 * References: #1765, #1770, #1773, #1774, #1777
 */

// Types
export type {
  ScholarshipStatus,
  Scholarship,
  AidType,
  AidComponent,
  FinancialAidPackage,
  AidPackageSummary,
  DeadlineEntry,
  DifficultyLevel,
  FinancialTerm,
  EducationContent,
  ContentCompletion,
  EducationProgress,
  MoodTag,
  MoodEntry,
  SpendingMoodCorrelation,
  MoodFrequency,
  MoodTrendPoint,
  WellnessConfig,
  EstateAssetType,
  EstateDocumentType,
  EstateItem,
  Beneficiary,
  EstateDocument,
  EstateInventory,
  EstateValueSummary,
  AccountabilityPartner,
  ChallengeType,
  Challenge,
  ChallengeProgress,
  LeaderboardEntry,
  PrivacySafeExport,
} from './types';

// Scholarship tracker (#1765)
export {
  filterByStatus,
  totalAwardedCents,
  totalPotentialCents,
  totalRenewableValueCents,
  summarizeAidPackage,
  compareAidPackages,
  calculateNetCost,
  averageAidPerComponent,
  buildDeadlineCalendar,
  upcomingDeadlines,
  overdueDeadlines,
  totalAidSummary,
} from './scholarship-tracker';

// Education content (#1770)
export {
  FINANCIAL_GLOSSARY,
  EDUCATION_CONTENT,
  lookupTerm,
  searchGlossary,
  filterByDifficulty,
  filterByCategory,
  getRelatedTerms,
  getContentByConceptKey,
  filterContentByDifficulty,
  markViewed,
  markUnderstood,
  calculateEducationProgress,
} from './education-content';

// Mood journal (#1773)
export {
  ALL_MOOD_TAGS,
  DEFAULT_WELLNESS_CONFIG,
  createMoodEntry,
  filterByMood,
  filterByDateRange,
  calculateSpendingCorrelation,
  calculateMoodFrequency,
  spendingByMood,
  averageSpendingForMood,
  calculateMoodTrend,
  monthPeriod,
  weekPeriod,
} from './mood-journal';

// Estate inventory (#1774)
export {
  ESTATE_LEGAL_DISCLAIMER,
  ALL_ASSET_TYPES,
  ALL_DOCUMENT_TYPES,
  filterItemsByType,
  unassignedItems,
  itemsForBeneficiary,
  validateBeneficiaryAllocations,
  totalAllocationPercent,
  filterDocumentsByType,
  documentsWithoutDigitalCopy,
  checkEssentialDocuments,
  calculateEstateValueSummary,
  beneficiaryEstateValue,
  buildEstateInventory,
} from './estate-inventory';

// Accountability (#1777)
export {
  createPartner,
  acceptPartner,
  updateStreak,
  createChallenge,
  addParticipant,
  removeParticipant,
  challengeDurationDays,
  calculateProgress,
  shareGoalProgress,
  buildLeaderboard,
  calculateStreak,
  createPrivacySafeExport,
} from './accountability';
