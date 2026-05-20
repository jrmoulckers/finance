/**
 * Shared types for security and UX enhancement engines.
 * All monetary values are in integer cents.
 * @module enhancements/types
 */

// ─── Subscription Lifecycle (#1604) ─────────────────────────────────────────

/** Possible states in a subscription's lifecycle */
export type SubscriptionState = 'active' | 'paused' | 'cancelled' | 'archived';

/** A transition record in the subscription's history */
export interface SubscriptionStateTransition {
  readonly from: SubscriptionState;
  readonly to: SubscriptionState;
  readonly timestamp: string; // ISO-8601
  readonly reason?: string;
}

/** A subscription with lifecycle tracking */
export interface SubscriptionLifecycle {
  readonly id: string;
  readonly name: string;
  /** Monthly cost in integer cents */
  readonly monthlyCostCents: number;
  readonly state: SubscriptionState;
  /** ISO-8601 date when a paused subscription should resume */
  readonly resumeDate?: string;
  /** ISO-8601 date when the subscription was archived */
  readonly archivedDate?: string;
  /** How long (days) to retain archived data before purging */
  readonly retentionDays?: number;
  readonly history: readonly SubscriptionStateTransition[];
}

// ─── Warranty Tracker (#1620) ────────────────────────────────────────────────

/** A warranty or return-window item linked to a receipt */
export interface WarrantyItem {
  readonly id: string;
  readonly productName: string;
  /** ISO-8601 purchase date */
  readonly purchaseDate: string;
  /** ISO-8601 warranty expiry date */
  readonly warrantyExpiry: string;
  /** ISO-8601 return-window expiry (may differ from warranty) */
  readonly returnWindowExpiry?: string;
  /** Linked receipt identifier */
  readonly receiptId?: string;
  /** Cost in integer cents */
  readonly costCents: number;
}

/** Reminder urgency level */
export type ReminderUrgency = 'low' | 'medium' | 'high';

/** A generated warranty/return reminder */
export interface WarrantyReminder {
  readonly warrantyItemId: string;
  readonly productName: string;
  readonly type: 'warranty' | 'return_window';
  readonly daysRemaining: number;
  readonly urgency: ReminderUrgency;
  /** ISO-8601 expiry date */
  readonly expiryDate: string;
  readonly message: string;
}

// ─── Watchlists (#1638) ──────────────────────────────────────────────────────

/** Category of items that can be tracked */
export type WatchlistCategory = 'stocks' | 'goals' | 'accounts' | 'custom';

/** A single item in a watchlist */
export interface WatchlistItem {
  readonly id: string;
  readonly label: string;
  readonly position: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** An ordered watchlist */
export interface Watchlist {
  readonly id: string;
  readonly name: string;
  readonly category: WatchlistCategory;
  readonly items: readonly WatchlistItem[];
}

// ─── Privacy Mode (#1643) ────────────────────────────────────────────────────

/** Privacy mode intensity */
export type PrivacyLevel = 'off' | 'partial' | 'full';

/** Per-screen privacy override */
export interface ScreenPrivacyOverride {
  readonly screenId: string;
  readonly level: PrivacyLevel;
}

/** Privacy mode configuration */
export interface PrivacyModeConfig {
  readonly level: PrivacyLevel;
  readonly overrides: readonly ScreenPrivacyOverride[];
  /** Whether quick-toggle is available in toolbar */
  readonly quickToggleEnabled: boolean;
}

// ─── Milestone Notifications (#1651) ─────────────────────────────────────────

/** Type of milestone reached */
export type MilestoneType = 'net_worth' | 'goal_completion' | 'streak';

/** A milestone notification */
export interface MilestoneNotification {
  readonly id: string;
  readonly type: MilestoneType;
  /** Threshold in integer cents (for monetary milestones) */
  readonly thresholdCents?: number;
  /** Number of consecutive days/periods (for streaks) */
  readonly streakCount?: number;
  readonly title: string;
  readonly message: string;
  /** ISO-8601 */
  readonly timestamp: string;
  readonly dismissed: boolean;
  /** ISO-8601 snooze-until date */
  readonly snoozedUntil?: string;
}

// ─── Encryption Info (#1697) ─────────────────────────────────────────────────

/** Category of encryption documentation */
export type EncryptionCategory = 'at_rest' | 'in_transit' | 'key_derivation';

/** A single encryption detail entry */
export interface EncryptionDetail {
  readonly category: EncryptionCategory;
  readonly algorithm: string;
  readonly description: string;
  readonly standard?: string;
}

/** Full encryption info for the info center */
export interface EncryptionInfo {
  readonly details: readonly EncryptionDetail[];
  readonly complianceItems: readonly ComplianceChecklistItem[];
  /** ISO-8601 */
  readonly lastAuditDate?: string;
}

/** A single compliance checklist entry */
export interface ComplianceChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly satisfied: boolean;
  readonly notes?: string;
}

// ─── Biometric Categories (#1719) ────────────────────────────────────────────

/** Sensitivity level for transaction categories */
export type SensitivityLevel = 'normal' | 'sensitive' | 'biometric_required';

/** A category with its protection level */
export interface BiometricCategory {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly sensitivityLevel: SensitivityLevel;
}

/** An access attempt record */
export interface AccessAttempt {
  readonly categoryId: string;
  /** ISO-8601 */
  readonly timestamp: string;
  readonly granted: boolean;
  readonly method: 'biometric' | 'pin' | 'none';
}

/** A time-limited unlock */
export interface TemporaryUnlock {
  readonly categoryId: string;
  /** ISO-8601 unlock start */
  readonly unlockedAt: string;
  /** Duration in seconds */
  readonly durationSeconds: number;
}

// ─── Elder / Caregiver Mode (#1732) ──────────────────────────────────────────

/** Simplified accessibility profile */
export interface AccessibilityProfile {
  readonly enabled: boolean;
  /** Minimum touch target size in px */
  readonly minTouchTargetPx: number;
  /** Base font size in px */
  readonly baseFontSizePx: number;
  readonly highContrast: boolean;
  /** Max number of top-level nav items */
  readonly maxNavItems: number;
  readonly essentialFeaturesOnly: boolean;
  readonly emergencyContact?: EmergencyContact;
  readonly caregiverNotifications: boolean;
}

/** Emergency contact info */
export interface EmergencyContact {
  readonly name: string;
  readonly phone: string;
  readonly relationship: string;
}

// ─── Drag-Drop Recategorization (#1764) ──────────────────────────────────────

/** A drag-drop recategorization operation */
export interface DragDropOperation {
  readonly id: string;
  readonly transactionIds: readonly string[];
  readonly fromCategoryId: string;
  readonly toCategoryId: string;
  /** ISO-8601 */
  readonly timestamp: string;
  readonly undone: boolean;
}

/** A category drop zone descriptor */
export interface CategoryDropZone {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly acceptsTransactions: boolean;
}

// ─── Differential Privacy (#1778) ────────────────────────────────────────────

/** Data categories eligible for anonymous benchmarking */
export type PrivacyDataCategory =
  | 'spending_by_category'
  | 'savings_rate'
  | 'income_bracket'
  | 'debt_ratio';

/** Differential privacy configuration */
export interface DifferentialPrivacyConfig {
  readonly optedIn: boolean;
  /** Privacy loss budget (ε) */
  readonly epsilon: number;
  /** Failure probability budget (δ) */
  readonly delta: number;
  readonly eligibleCategories: readonly PrivacyDataCategory[];
  /** ISO-8601 consent date */
  readonly consentDate?: string;
}

/** Result of adding noise to a value */
export interface NoisyValue {
  readonly original: number;
  readonly noised: number;
  readonly epsilonUsed: number;
}
