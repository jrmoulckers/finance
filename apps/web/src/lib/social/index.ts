// SPDX-License-Identifier: BUSL-1.1

/**
 * Social spending benchmarks, contextual insights, and transaction notes.
 *
 * Barrel export for `apps/web/src/lib/social/`.
 *
 * References: #1817, #1634, #1626
 */

// ---------------------------------------------------------------------------
// Types (#1817, #1634, #1626)
// ---------------------------------------------------------------------------

export type {
  AgeRange,
  AnonymizedSpendingSummary,
  AttachmentFileType,
  AttachmentMetadata,
  BenchmarkCategory,
  BenchmarkComparison,
  BenchmarkData,
  BlsTableEntry,
  CardState,
  ConflictResolution,
  ConflictStrategy,
  CreateNoteInput,
  IncomeBracket,
  Insight,
  InsightCard,
  InsightSeverity,
  InsightType,
  NoteSearchFilters,
  NoteSearchResult,
  PeerGroup,
  PercentileResult,
  ScoringWeights,
  TransactionNote,
  UpdateNoteInput,
} from './types';

// ---------------------------------------------------------------------------
// Benchmarks (#1817)
// ---------------------------------------------------------------------------

export {
  bankersRound,
  buildBenchmarkData,
  compareCategorySpending,
  computeMean,
  computeMedian,
  computePercentile,
  computeSpendingEfficiencyScore,
} from './benchmarks';

// ---------------------------------------------------------------------------
// Anonymization (#1817)
// ---------------------------------------------------------------------------

export {
  addNoise,
  anonymizeBatch,
  anonymizeSpending,
  consumeBudget,
  createPrivacyBudget,
  generateLaplaceNoise,
  remainingBudget,
  roundToNearest50Dollars,
} from './anonymization';
export type { PrivacyBudget, RawCategorySpend } from './anonymization';

// ---------------------------------------------------------------------------
// Insights (#1634)
// ---------------------------------------------------------------------------

export {
  createInsight,
  detectBudgetOnTrack,
  detectCategoryShifts,
  detectGoalProgress,
  detectRecurringTransactions,
  detectSavingsOpportunities,
  detectSpendingSpikes,
  detectUnusualMerchants,
  generateAllInsights,
} from './insights';
export type { BudgetContext, CategoryAggregate, GoalContext, InsightTransaction } from './insights';

// ---------------------------------------------------------------------------
// Scoring (#1634)
// ---------------------------------------------------------------------------

export {
  computeCompositeScore,
  DEFAULT_SCORING_WEIGHTS,
  deduplicateByContext,
  deduplicateInsights,
  scoreActionability,
  scoreMagnitude,
  scoreNovelty,
  scoreRecency,
  sortByRelevance,
} from './scoring';

// ---------------------------------------------------------------------------
// Cards (#1634)
// ---------------------------------------------------------------------------

export {
  countByState,
  createCard,
  createCardQueue,
  dismissCard,
  getActiveCards,
  getDismissedCards,
  getSnoozedCards,
  mergeNewInsights,
  purgeDismissed,
  reactivateExpiredSnoozes,
  snoozeCard,
} from './cards';

// ---------------------------------------------------------------------------
// Notes (#1626)
// ---------------------------------------------------------------------------

export {
  computeAttachmentSize,
  createNote,
  findAttachmentsByNote,
  findNoteById,
  findNotesByTransaction,
  removeAttachment,
  removeNote,
  updateNote,
} from './notes';
export { storeReceiptAttachment } from './receipt-attachments';
export type { StoreReceiptAttachmentInput, StoredReceiptAttachment } from './receipt-attachments';

// ---------------------------------------------------------------------------
// Search (#1626)
// ---------------------------------------------------------------------------

export { computeKeywordRelevance, matchesDateRange, matchesTags, searchNotes } from './search';

// ---------------------------------------------------------------------------
// Storage Model (#1626)
// ---------------------------------------------------------------------------

export { resolveFieldMerge, resolveLastWriteWins } from './storage-model';
export type { AttachmentStorage, NoteStorage } from './storage-model';
