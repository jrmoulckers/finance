// SPDX-License-Identifier: BUSL-1.1

/**
 * KMP Bridge - TypeScript interface definitions mirroring the KMP shared models.
 *
 * These types are the web-side contract for data flowing from the Kotlin/JS
 * compiled module. When the KMP build produces a JS/WASM artifact, the bridge
 * adapter (see README.md) maps those Kotlin objects into these TypeScript types.
 *
 * All monetary values use `Cents` (integer arithmetic) to avoid floating-point
 * precision errors - matching the KMP `Cents` value class.
 *
 * @see {@link file://../../packages/models/src/commonMain/kotlin/com/finance/models}
 */

// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

/**
 * Monetary amount in the smallest currency unit (e.g., cents for USD).
 * Maps to KMP `com.finance.models.types.Cents`.
 */
export interface Cents {
  readonly amount: number; // int53 safe range for JS
}

/**
 * ISO 4217 currency code (3-letter uppercase).
 * Maps to KMP `com.finance.models.types.Currency`.
 */
export interface Currency {
  readonly code: string;
  readonly decimalPlaces: number;
}

/** Pre-defined currency constants matching KMP companions. */
export const Currencies = {
  USD: { code: "USD", decimalPlaces: 2 } as Currency,
  EUR: { code: "EUR", decimalPlaces: 2 } as Currency,
  GBP: { code: "GBP", decimalPlaces: 2 } as Currency,
  JPY: { code: "JPY", decimalPlaces: 0 } as Currency,
  CAD: { code: "CAD", decimalPlaces: 2 } as Currency,
} as const;

/**
 * Opaque sync-safe identifier (UUID string).
 * Maps to KMP `com.finance.models.types.SyncId`.
 */
export type SyncId = string;

/** ISO-8601 instant string (e.g. "2024-01-15T10:30:00Z"). */
export type Instant = string;

/** ISO-8601 local date string (e.g. "2024-01-15"). */
export type LocalDate = string;

// ---------------------------------------------------------------------------
// Sync metadata - shared by all sync-enabled entities
// ---------------------------------------------------------------------------

export interface SyncMetadata {
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly deletedAt: Instant | null;
  readonly syncVersion: number;
  readonly isSynced: boolean;
}

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

/** Maps to KMP `com.finance.models.AccountType`. */
export type AccountType =
  | "CHECKING"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "CASH"
  | "INVESTMENT"
  | "LOAN"
  | "OTHER";

/** Maps to KMP `com.finance.models.Account`. */
export interface Account extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: Currency;
  readonly currentBalance: Cents;
  readonly isArchived: boolean;
  readonly sortOrder: number;
  readonly icon: string | null;
  readonly color: string | null;
}

/** Maps to KMP `com.finance.models.TransactionType`. */
export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER";

/** Maps to KMP `com.finance.models.TransactionStatus`. */
export type TransactionStatus = "PENDING" | "CLEARED" | "RECONCILED" | "VOID";

/** Maps to KMP `com.finance.models.Transaction`. */
export interface Transaction extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly accountId: SyncId;
  readonly categoryId: SyncId | null;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amount: Cents;
  readonly currency: Currency;
  readonly payee: string | null;
  readonly note: string | null;
  readonly date: LocalDate;
  readonly transferAccountId: SyncId | null;
  readonly transferTransactionId: SyncId | null;
  readonly isRecurring: boolean;
  readonly recurringRuleId: SyncId | null;
  readonly tags: readonly string[];
}

/** Maps to KMP `com.finance.models.BudgetPeriod`. */
export type BudgetPeriod =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY";

/** Maps to KMP `com.finance.models.Budget`. */
export interface Budget extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly categoryId: SyncId;
  readonly name: string;
  readonly amount: Cents;
  readonly currency: Currency;
  readonly period: BudgetPeriod;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate | null;
  readonly isRollover: boolean;
}

/** Maps to KMP `com.finance.models.GoalStatus`. */
export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

/** Maps to KMP `com.finance.models.Goal`. */
export interface Goal extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly name: string;
  readonly targetAmount: Cents;
  readonly currentAmount: Cents;
  readonly currency: Currency;
  readonly targetDate: LocalDate | null;
  readonly status: GoalStatus;
  readonly icon: string | null;
  readonly color: string | null;
  readonly accountId: SyncId | null;
}

/** Maps to KMP `com.finance.models.Category`. */
export interface Category extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly parentId: SyncId | null;
  readonly isIncome: boolean;
  readonly isSystem: boolean;
  readonly sortOrder: number;
}

/** Maps to KMP `com.finance.models.User`. */
export interface User extends SyncMetadata {
  readonly id: SyncId;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly defaultCurrency: Currency;
}

/** Maps to KMP `com.finance.models.Household`. */
export interface Household extends SyncMetadata {
  readonly id: SyncId;
  readonly name: string;
  readonly ownerId: SyncId;
}

/** Maps to KMP `com.finance.models.HouseholdRole`. */
export type HouseholdRole = "OWNER" | "PARTNER" | "MEMBER" | "VIEWER";

/** Maps to KMP `com.finance.models.HouseholdMember`. */
export interface HouseholdMember extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly userId: SyncId;
  readonly role: HouseholdRole;
  readonly joinedAt: Instant;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Create a Cents value from a raw integer. */
export function cents(amount: number): Cents {
  return { amount: Math.trunc(amount) };
}

/** Convert a dollar amount to Cents (for display/input conversion only). */
export function centsFromDollars(dollars: number): Cents {
  return { amount: Math.round(dollars * 100) };
}

/** Format Cents for display using the given Currency. */
export function formatCents(value: Cents, currency: Currency): string {
  const divisor = Math.pow(10, currency.decimalPlaces);
  const formatted = (value.amount / divisor).toFixed(currency.decimalPlaces);
  return `${formatted} ${currency.code}`;
}