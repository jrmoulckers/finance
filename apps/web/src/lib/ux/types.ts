// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for UX improvements and accessibility engines.
 *
 * All monetary values are represented as integer cents to avoid
 * floating-point errors inherent in IEEE 754 arithmetic.
 *
 * References: issues #1607, #1664, #1669, #1674, #1703, #1708,
 *             #1713, #1718, #1747, #1762
 */

// ---------------------------------------------------------------------------
// Digest / reporting types
// ---------------------------------------------------------------------------

/** Time period for a spending digest. */
export type DigestPeriod = 'daily' | 'weekly' | 'monthly';

/** A single category's spending within a digest period. */
export interface DigestCategorySpending {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly categoryName: string;
  /** Total spent in cents during the period. */
  readonly spentCents: number;
  /** Budget allocated in cents (0 if no budget set). */
  readonly budgetCents: number;
  /** Percentage of budget used (0–Infinity; 0 when no budget). */
  readonly budgetUsedPercent: number;
}

/** The largest individual transaction in a digest. */
export interface DigestTopTransaction {
  /** Transaction identifier. */
  readonly transactionId: string;
  /** Description / merchant name. */
  readonly description: string;
  /** Amount in cents. */
  readonly amountCents: number;
  /** Category name. */
  readonly categoryName: string;
  /** ISO 8601 date string. */
  readonly date: string;
}

/** Comparison metrics against a prior period. */
export interface PeriodComparison {
  /** Prior period total spending in cents. */
  readonly priorTotalCents: number;
  /** Current period total spending in cents. */
  readonly currentTotalCents: number;
  /** Signed change in cents (current − prior). */
  readonly changeCents: number;
  /** Signed percentage change (−100 to +∞). */
  readonly changePercent: number;
}

/** Per-category comparison to prior period. */
export interface CategoryComparison {
  /** Category identifier. */
  readonly categoryId: string;
  /** Display name. */
  readonly categoryName: string;
  /** Prior period amount in cents. */
  readonly priorCents: number;
  /** Current period amount in cents. */
  readonly currentCents: number;
  /** Signed change in cents. */
  readonly changeCents: number;
  /** Signed percentage change. */
  readonly changePercent: number;
}

/** Full spending digest for a period. */
export interface SpendingDigest {
  /** Digest period type. */
  readonly period: DigestPeriod;
  /** ISO 8601 start date of the period. */
  readonly startDate: string;
  /** ISO 8601 end date of the period. */
  readonly endDate: string;
  /** Total spending in cents. */
  readonly totalSpentCents: number;
  /** Top spending categories, sorted by amount descending. */
  readonly topCategories: readonly DigestCategorySpending[];
  /** Largest transactions in the period. */
  readonly topTransactions: readonly DigestTopTransaction[];
  /** Comparison to the immediately prior period. */
  readonly comparison: PeriodComparison;
  /** Per-category comparisons to the prior period. */
  readonly categoryComparisons: readonly CategoryComparison[];
  /** Narrative summary lines (human-readable insights). */
  readonly narratives: readonly string[];
}

// ---------------------------------------------------------------------------
// Quiet hours / focus mode types
// ---------------------------------------------------------------------------

/** Configuration for quiet hours notification suppression. */
export interface QuietHoursConfig {
  /** Whether quiet hours are enabled. */
  readonly enabled: boolean;
  /** Start time as "HH:MM" (24-hour format). */
  readonly startTime: string;
  /** End time as "HH:MM" (24-hour format). */
  readonly endTime: string;
  /** Days of the week quiet hours are active (0 = Sunday, 6 = Saturday). */
  readonly activeDays: readonly number[];
  /** Whether focus mode is currently active (manual toggle). */
  readonly focusModeActive: boolean;
}

/** A notification that was queued during quiet hours. */
export interface QueuedNotification {
  /** Unique identifier. */
  readonly id: string;
  /** Notification title. */
  readonly title: string;
  /** Notification body text. */
  readonly body: string;
  /** Priority level. */
  readonly priority: 'low' | 'normal' | 'high' | 'critical';
  /** ISO 8601 timestamp when the notification was originally triggered. */
  readonly triggeredAt: string;
}

// ---------------------------------------------------------------------------
// Cognitive simplification types
// ---------------------------------------------------------------------------

/** Level of interface simplification. */
export type SimplificationLevel = 'standard' | 'simplified' | 'minimal';

/** Feature visibility rules for a simplification level. */
export interface FeatureVisibility {
  /** Whether advanced charts/graphs are shown. */
  readonly showAdvancedCharts: boolean;
  /** Whether detailed transaction metadata is shown. */
  readonly showTransactionDetails: boolean;
  /** Whether budget analytics are shown. */
  readonly showBudgetAnalytics: boolean;
  /** Whether investment tracking is shown. */
  readonly showInvestments: boolean;
  /** Whether debt management tools are shown. */
  readonly showDebtTools: boolean;
  /** Whether multi-account views are shown. */
  readonly showMultiAccount: boolean;
  /** Maximum number of menu items visible. */
  readonly maxMenuItems: number;
  /** Whether tooltips are auto-shown for new features. */
  readonly autoShowTooltips: boolean;
}

/** CSS-level simplification overrides. */
export interface SimplificationStyles {
  /** Minimum touch target size in pixels. */
  readonly minTouchTargetPx: number;
  /** Base font size multiplier (1.0 = default). */
  readonly fontSizeMultiplier: number;
  /** Whether to reduce information density (more whitespace). */
  readonly reducedDensity: boolean;
  /** Maximum items shown in lists before "Show more". */
  readonly maxListItems: number;
}

// ---------------------------------------------------------------------------
// Accessibility preferences types
// ---------------------------------------------------------------------------

/** Font size preference for the UI. */
export type FontSizePreference = 'small' | 'medium' | 'large' | 'x-large';

/** User accessibility preferences. */
export interface A11yPreferences {
  /** Font size preference. */
  readonly fontSize: FontSizePreference;
  /** Whether high contrast mode is enabled. */
  readonly highContrast: boolean;
  /** Whether reduced motion is enabled. */
  readonly reducedMotion: boolean;
  /** Whether screen reader optimisations are enabled. */
  readonly screenReaderOptimised: boolean;
  /** Whether to show focus indicators more prominently. */
  readonly enhancedFocus: boolean;
  /** Cognitive simplification level. */
  readonly simplificationLevel: SimplificationLevel;
}

/** Mapping from preference key to CSS custom property changes. */
export interface A11yCssMapping {
  /** CSS custom property name. */
  readonly property: string;
  /** Value to set. */
  readonly value: string;
}

// ---------------------------------------------------------------------------
// Contextual tooltip types
// ---------------------------------------------------------------------------

/** A contextual tooltip configuration. */
export interface TooltipConfig {
  /** Unique tooltip identifier. */
  readonly id: string;
  /** Feature or element this tooltip is attached to. */
  readonly targetFeature: string;
  /** Title text. */
  readonly title: string;
  /** Body text (progressive disclosure content). */
  readonly body: string;
  /** Display order (lower = shown first). */
  readonly order: number;
  /** Whether this tooltip should only be shown once. */
  readonly showOnce: boolean;
  /** Optional link for "Learn more". */
  readonly learnMoreUrl?: string;
}

/** Tracking state for tooltip dismissals. */
export interface TooltipState {
  /** Map of tooltip ID → whether it has been dismissed. */
  readonly dismissed: Readonly<Record<string, boolean>>;
  /** Map of tooltip ID → number of times shown. */
  readonly showCounts: Readonly<Record<string, number>>;
  /** Map of feature → whether the user has encountered (visited) it. */
  readonly encounteredFeatures: Readonly<Record<string, boolean>>;
}

// ---------------------------------------------------------------------------
// Starter template types
// ---------------------------------------------------------------------------

/** Starter budget template identifier. */
export type TemplateId = 'basic' | 'student' | 'family' | 'single-income';

/** A recommended category within a starter template. */
export interface TemplateCategory {
  /** Category name. */
  readonly name: string;
  /** Suggested monthly allocation in cents. */
  readonly suggestedCents: number;
  /** Whether this category is considered essential. */
  readonly isEssential: boolean;
}

/** A complete starter budget template. */
export interface StarterTemplate {
  /** Template identifier. */
  readonly id: TemplateId;
  /** Display name. */
  readonly displayName: string;
  /** Short description of who this template is for. */
  readonly description: string;
  /** Recommended budget categories with suggested allocations. */
  readonly categories: readonly TemplateCategory[];
  /** Total of all suggested allocations in cents. */
  readonly totalSuggestedCents: number;
  /** Suggested monthly income in cents (for guidance). */
  readonly suggestedIncomeCents: number;
}

/** Progress through the guided setup flow. */
export interface GuidedSetupProgress {
  /** Current step index (0-based). */
  readonly currentStep: number;
  /** Total number of steps. */
  readonly totalSteps: number;
  /** Whether the setup is complete. */
  readonly isComplete: boolean;
  /** Selected template (null if not yet chosen). */
  readonly selectedTemplate: TemplateId | null;
  /** User-adjusted category allocations in cents. */
  readonly adjustedAllocations: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Undo / redo types
// ---------------------------------------------------------------------------

/** Type of undoable action. */
export type UndoActionType =
  | 'transaction_edit'
  | 'transaction_delete'
  | 'category_change'
  | 'budget_modify'
  | 'account_edit'
  | 'account_delete';

/** A single undoable action stored in the undo stack. */
export interface UndoAction<T = unknown> {
  /** Unique action identifier. */
  readonly id: string;
  /** Type of action that was performed. */
  readonly type: UndoActionType;
  /** Human-readable description of the action. */
  readonly description: string;
  /** State before the action (for undo). */
  readonly previousState: T;
  /** State after the action (for redo). */
  readonly nextState: T;
  /** ISO 8601 timestamp when the action was performed. */
  readonly timestamp: string;
  /** Time-to-live in milliseconds (actions expire after this duration). */
  readonly ttlMs: number;
}

/** Current state of the undo/redo engine. */
export interface UndoEngineState<T = unknown> {
  /** Stack of past actions (most recent last). */
  readonly undoStack: readonly UndoAction<T>[];
  /** Stack of undone actions available for redo (most recent last). */
  readonly redoStack: readonly UndoAction<T>[];
  /** Maximum depth of the undo stack. */
  readonly maxDepth: number;
  /** Whether an undo operation is available. */
  readonly canUndo: boolean;
  /** Whether a redo operation is available. */
  readonly canRedo: boolean;
}
