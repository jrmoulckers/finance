// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for financial wellness, education, and life-planning tools.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Dates use ISO 8601 strings (YYYY-MM-DD) for calendar dates.
 *
 * References: #1765, #1770, #1773, #1774, #1777
 */

// ---------------------------------------------------------------------------
// Scholarship & Financial Aid types (#1765)
// ---------------------------------------------------------------------------

/** Application status for a scholarship. */
export type ScholarshipStatus =
  | 'researching'
  | 'in_progress'
  | 'submitted'
  | 'awarded'
  | 'rejected'
  | 'waitlisted';

/** A scholarship application entry. */
export interface Scholarship {
  /** Unique identifier. */
  readonly id: string;
  /** Scholarship name. */
  readonly name: string;
  /** Scholarship provider/organization. */
  readonly provider: string;
  /** Award amount in cents. */
  readonly amountCents: number;
  /** Application deadline (ISO date string). */
  readonly deadline: string;
  /** Current application status. */
  readonly status: ScholarshipStatus;
  /** Whether this is renewable. */
  readonly renewable: boolean;
  /** Renewal period in years (if renewable). */
  readonly renewalYears: number;
  /** Notes or requirements. */
  readonly notes: string;
}

/** Type of financial aid component. */
export type AidType = 'grant' | 'scholarship' | 'loan' | 'work_study';

/** A single component of a financial aid package. */
export interface AidComponent {
  /** Unique identifier. */
  readonly id: string;
  /** Component name (e.g., "Pell Grant", "Federal Direct Loan"). */
  readonly name: string;
  /** Type of aid. */
  readonly type: AidType;
  /** Amount in cents. */
  readonly amountCents: number;
  /** Whether this must be repaid. */
  readonly requiresRepayment: boolean;
}

/** A financial aid package from an institution. */
export interface FinancialAidPackage {
  /** Unique identifier. */
  readonly id: string;
  /** Institution name. */
  readonly institution: string;
  /** Total cost of attendance in cents. */
  readonly totalCostCents: number;
  /** Tuition and fees in cents. */
  readonly tuitionCents: number;
  /** Room and board in cents. */
  readonly roomBoardCents: number;
  /** Books and supplies in cents. */
  readonly booksCents: number;
  /** Other expenses in cents. */
  readonly otherExpensesCents: number;
  /** Aid components offered. */
  readonly aidComponents: readonly AidComponent[];
}

/** Summary of a financial aid package comparison. */
export interface AidPackageSummary {
  /** Institution name. */
  readonly institution: string;
  /** Total aid in cents. */
  readonly totalAidCents: number;
  /** Total grants (free money) in cents. */
  readonly totalGrantsCents: number;
  /** Total loans in cents. */
  readonly totalLoansCents: number;
  /** Total work-study in cents. */
  readonly totalWorkStudyCents: number;
  /** Net cost (total cost - total aid) in cents. */
  readonly netCostCents: number;
  /** Net cost after removing loans (true out-of-pocket) in cents. */
  readonly outOfPocketCents: number;
}

/** Deadline calendar entry. */
export interface DeadlineEntry {
  /** Scholarship ID. */
  readonly scholarshipId: string;
  /** Scholarship name. */
  readonly scholarshipName: string;
  /** Deadline date (ISO date string). */
  readonly deadline: string;
  /** Days remaining until deadline. */
  readonly daysRemaining: number;
  /** Current status. */
  readonly status: ScholarshipStatus;
  /** Whether this deadline is urgent (≤ 7 days). */
  readonly isUrgent: boolean;
}

// ---------------------------------------------------------------------------
// Financial Education types (#1770)
// ---------------------------------------------------------------------------

/** Difficulty level for educational content. */
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

/** A financial term in the glossary. */
export interface FinancialTerm {
  /** Unique slug identifier. */
  readonly id: string;
  /** Display term. */
  readonly term: string;
  /** Plain-language definition. */
  readonly definition: string;
  /** Difficulty level. */
  readonly difficulty: DifficultyLevel;
  /** Related term IDs for cross-linking. */
  readonly relatedTermIds: readonly string[];
  /** Category for grouping (e.g., "investing", "credit", "budgeting"). */
  readonly category: string;
}

/** Contextual "explain this" content keyed by a financial concept. */
export interface EducationContent {
  /** Unique identifier. */
  readonly id: string;
  /** Concept key (e.g., "compound_interest", "apr_vs_apy"). */
  readonly conceptKey: string;
  /** Display title. */
  readonly title: string;
  /** Short explanation (1-2 sentences). */
  readonly shortExplanation: string;
  /** Full explanation with examples. */
  readonly fullExplanation: string;
  /** Practical example relevant to personal finance. */
  readonly example: string;
  /** Difficulty level. */
  readonly difficulty: DifficultyLevel;
  /** Related term IDs. */
  readonly relatedTermIds: readonly string[];
}

/** Tracks user completion of educational content. */
export interface ContentCompletion {
  /** Content ID. */
  readonly contentId: string;
  /** Whether the user has viewed this content. */
  readonly viewed: boolean;
  /** Date first viewed (ISO date string, or null). */
  readonly viewedDate: string | null;
  /** Whether the user marked it as understood. */
  readonly understood: boolean;
}

/** Summary of education progress. */
export interface EducationProgress {
  /** Total content items available. */
  readonly totalItems: number;
  /** Number viewed. */
  readonly viewedCount: number;
  /** Number marked understood. */
  readonly understoodCount: number;
  /** Completion percentage (0-100). */
  readonly completionPercent: number;
  /** Breakdown by difficulty. */
  readonly byDifficulty: Record<DifficultyLevel, { total: number; viewed: number }>;
}

// ---------------------------------------------------------------------------
// Mood & Emotional Spending types (#1773)
// ---------------------------------------------------------------------------

/** Mood tags for transactions. */
export type MoodTag = 'happy' | 'stressed' | 'impulsive' | 'planned' | 'guilty' | 'proud';

/** A mood journal entry linked to a transaction. */
export interface MoodEntry {
  /** Unique identifier. */
  readonly id: string;
  /** Associated transaction ID. */
  readonly transactionId: string;
  /** Mood tag. */
  readonly mood: MoodTag;
  /** Optional journal note. */
  readonly note: string;
  /** Transaction amount in cents. */
  readonly amountCents: number;
  /** Transaction category. */
  readonly category: string;
  /** Entry date (ISO date string). */
  readonly date: string;
}

/** Correlation between a mood and spending patterns. */
export interface SpendingMoodCorrelation {
  /** Mood tag. */
  readonly mood: MoodTag;
  /** Number of transactions tagged with this mood. */
  readonly transactionCount: number;
  /** Total spending in cents for this mood. */
  readonly totalSpendingCents: number;
  /** Average spending per transaction in cents. */
  readonly averageSpendingCents: number;
  /** Percentage of total tagged spending. */
  readonly spendingPercent: number;
}

/** Mood frequency summary over a time period. */
export interface MoodFrequency {
  /** Mood tag. */
  readonly mood: MoodTag;
  /** Count of entries. */
  readonly count: number;
  /** Percentage of all entries. */
  readonly percent: number;
}

/** Mood trend data point for a time period. */
export interface MoodTrendPoint {
  /** Period label (e.g., "2024-W01", "2024-01"). */
  readonly period: string;
  /** Mood frequencies in this period. */
  readonly frequencies: readonly MoodFrequency[];
  /** Total spending in this period in cents. */
  readonly totalSpendingCents: number;
}

/** Configuration for wellness feature opt-in. */
export interface WellnessConfig {
  /** Whether basic mood tagging is enabled (default: true). */
  readonly moodTaggingEnabled: boolean;
  /** Whether full wellness correlation is enabled (experimental opt-in). */
  readonly fullCorrelationEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Estate & End-of-Life Financial Inventory types (#1774)
// ---------------------------------------------------------------------------

/** Type of estate asset. */
export type EstateAssetType =
  | 'bank_account'
  | 'investment'
  | 'retirement'
  | 'real_estate'
  | 'vehicle'
  | 'insurance'
  | 'digital_asset'
  | 'personal_property'
  | 'business'
  | 'other';

/** Type of estate document. */
export type EstateDocumentType =
  | 'will'
  | 'trust'
  | 'power_of_attorney'
  | 'healthcare_directive'
  | 'insurance_policy'
  | 'deed'
  | 'title'
  | 'beneficiary_designation'
  | 'other';

/** An item in the estate inventory. */
export interface EstateItem {
  /** Unique identifier. */
  readonly id: string;
  /** Asset name/description. */
  readonly name: string;
  /** Asset type. */
  readonly type: EstateAssetType;
  /** Estimated value in cents. */
  readonly estimatedValueCents: number;
  /** Institution or holder name. */
  readonly institution: string;
  /** Account number (last 4 digits only for security). */
  readonly accountLast4: string;
  /** Contact information for the institution. */
  readonly contactInfo: string;
  /** Assigned beneficiary IDs. */
  readonly beneficiaryIds: readonly string[];
  /** Notes. */
  readonly notes: string;
}

/** A beneficiary for estate planning. */
export interface Beneficiary {
  /** Unique identifier. */
  readonly id: string;
  /** Full name. */
  readonly name: string;
  /** Relationship to the account holder. */
  readonly relationship: string;
  /** Contact information. */
  readonly contactInfo: string;
  /** Percentage allocation (0-100). */
  readonly allocationPercent: number;
}

/** A document record in the estate inventory. */
export interface EstateDocument {
  /** Unique identifier. */
  readonly id: string;
  /** Document type. */
  readonly type: EstateDocumentType;
  /** Document name/title. */
  readonly name: string;
  /** Physical location of the document. */
  readonly physicalLocation: string;
  /** Whether a digital copy exists. */
  readonly hasDigitalCopy: boolean;
  /** Date last updated (ISO date string). */
  readonly lastUpdated: string;
  /** Notes. */
  readonly notes: string;
}

/** The complete estate inventory. */
export interface EstateInventory {
  /** All estate items/assets. */
  readonly items: readonly EstateItem[];
  /** All beneficiaries. */
  readonly beneficiaries: readonly Beneficiary[];
  /** All documents. */
  readonly documents: readonly EstateDocument[];
  /** Last updated timestamp (ISO date string). */
  readonly lastUpdated: string;
}

/** Estate value summary by asset type. */
export interface EstateValueSummary {
  /** Total estimated value in cents. */
  readonly totalValueCents: number;
  /** Breakdown by asset type. */
  readonly byType: ReadonlyArray<{
    readonly type: EstateAssetType;
    readonly count: number;
    readonly totalValueCents: number;
    readonly percent: number;
  }>;
  /** Number of items without beneficiary assignments. */
  readonly unassignedCount: number;
  /** Number of items total. */
  readonly totalItemCount: number;
}

// ---------------------------------------------------------------------------
// Accountability Partner & Group Challenge types (#1777)
// ---------------------------------------------------------------------------

/** An accountability partner. */
export interface AccountabilityPartner {
  /** Unique identifier. */
  readonly id: string;
  /** Display name. */
  readonly displayName: string;
  /** Whether this partner has accepted the invitation. */
  readonly accepted: boolean;
  /** Date joined (ISO date string). */
  readonly joinedDate: string;
  /** Current streak in days. */
  readonly streakDays: number;
}

/** Challenge type. */
export type ChallengeType = 'no_spend' | 'savings_target' | 'budget_under' | 'custom';

/** A group financial challenge. */
export interface Challenge {
  /** Unique identifier. */
  readonly id: string;
  /** Challenge name. */
  readonly name: string;
  /** Challenge type. */
  readonly type: ChallengeType;
  /** Description. */
  readonly description: string;
  /** Start date (ISO date string). */
  readonly startDate: string;
  /** End date (ISO date string). */
  readonly endDate: string;
  /** Target value (interpretation depends on type; e.g., cents for savings, days for no-spend). */
  readonly targetValue: number;
  /** Participant IDs. */
  readonly participantIds: readonly string[];
}

/** Progress for a participant in a challenge. */
export interface ChallengeProgress {
  /** Challenge ID. */
  readonly challengeId: string;
  /** Participant ID. */
  readonly participantId: string;
  /** Display name. */
  readonly displayName: string;
  /** Progress percentage (0-100). */
  readonly progressPercent: number;
  /** Current streak in days. */
  readonly streakDays: number;
  /** Whether the challenge goal is completed. */
  readonly completed: boolean;
  /** Completion date (ISO date string, or null). */
  readonly completedDate: string | null;
}

/** Leaderboard entry for privacy-safe display. */
export interface LeaderboardEntry {
  /** Participant display name. */
  readonly displayName: string;
  /** Progress percentage (0-100). NO dollar amounts. */
  readonly progressPercent: number;
  /** Streak in days. */
  readonly streakDays: number;
  /** Rank (1-indexed). */
  readonly rank: number;
  /** Whether this participant has completed the challenge. */
  readonly completed: boolean;
}

/** Privacy-safe data export for sharing. */
export interface PrivacySafeExport {
  /** Challenge name. */
  readonly challengeName: string;
  /** Progress percentage only — no dollar amounts. */
  readonly progressPercent: number;
  /** Categories of spending (no amounts). */
  readonly categories: readonly string[];
  /** Streak in days. */
  readonly streakDays: number;
  /** Time period. */
  readonly periodStart: string;
  /** Time period end. */
  readonly periodEnd: string;
}

// ---------------------------------------------------------------------------
// Financial Wellness Insights types (#1656)
// ---------------------------------------------------------------------------

/** Wellness-specific mood states derived from optional transaction mood tags. */
export type MoodState = 'calm' | 'neutral' | 'anxious' | 'stressed' | 'celebratory' | 'fatigued';

/** Severity used for anxiety and stress alerting. */
export type StressLevel = 'low' | 'moderate' | 'high' | 'severe';

/** Five-part breakdown for the 0-100 anxiety score. Lower is better. */
export interface AnxietyScoreBreakdown {
  readonly overdraftProximity: number;
  readonly spendingVolatility: number;
  readonly billStress: number;
  readonly debtPressure: number;
  readonly savingsTrajectory: number;
}

/** Raw metrics that explain how the anxiety score was computed. */
export interface AnxietyScoreMetrics {
  readonly liquidBufferDays: number;
  readonly spendingVolatilityRatio: number;
  readonly billCoverageRatio: number | null;
  readonly minimumPaymentRatio: number;
  readonly savingsRateChange: number;
  readonly overdueBills: number;
}

/** Composite financial anxiety score and supporting detail. */
export interface AnxietyScoreResult {
  readonly score: number;
  readonly level: StressLevel;
  readonly summary: string;
  readonly breakdown: AnxietyScoreBreakdown;
  readonly metrics: AnxietyScoreMetrics;
}

/** Single chart point combining mood state and spending behavior for a day. */
export interface MoodSpendingPoint {
  readonly date: string;
  readonly label: string;
  readonly spending: number;
  readonly baseline: number;
  readonly moodState: MoodState;
  readonly moodLabel: string;
  readonly moodScore: number;
  readonly transactionCount: number;
  readonly isSpike: boolean;
  readonly isDrop: boolean;
}

/** Interpreted emotional spending pattern detected from tagged spending. */
export interface EmotionalSpendingPattern {
  readonly id: string;
  readonly moodState: MoodState;
  readonly direction: 'spike' | 'drop' | 'habit';
  readonly title: string;
  readonly description: string;
  readonly intensity: StressLevel;
  readonly averageSpending: number;
  readonly occurrences: number;
}

/** Summary of mood-to-spending correlation for the dashboard. */
export interface MoodCorrelationSummary {
  readonly hasEnoughData: boolean;
  readonly summary: string;
  readonly entriesTagged: number;
  readonly correlation: number;
  readonly dominantMoodState: MoodState | null;
  readonly averageTaggedSpending: number;
  readonly spikeCount: number;
  readonly dropCount: number;
  readonly chart: readonly MoodSpendingPoint[];
  readonly patterns: readonly EmotionalSpendingPattern[];
}

/** Stress signals shown as gentle alerts in the wellness dashboard. */
export type StressIndicatorKind =
  | 'declining-savings'
  | 'debt-pressure'
  | 'irregular-income'
  | 'bill-crunch';

/** A single detected financial stress signal. */
export interface StressIndicator {
  readonly kind: StressIndicatorKind;
  readonly level: StressLevel;
  readonly signal: number;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string;
}

/** Collection of stress indicators and a plain-language summary. */
export interface StressIndicatorSummary {
  readonly highestLevel: StressLevel;
  readonly summary: string;
  readonly indicators: readonly StressIndicator[];
}

/** Combined wellness snapshot used by the insights dashboard. */
export interface FinancialWellnessSnapshot {
  readonly currencyCode: string;
  readonly generatedAt: string;
  readonly anxietyScore: AnxietyScoreResult;
  readonly moodCorrelation: MoodCorrelationSummary;
  readonly stressIndicators: StressIndicatorSummary;
}
