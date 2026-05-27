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
  USD: { code: 'USD', decimalPlaces: 2 } as Currency,
  EUR: { code: 'EUR', decimalPlaces: 2 } as Currency,
  GBP: { code: 'GBP', decimalPlaces: 2 } as Currency,
  JPY: { code: 'JPY', decimalPlaces: 0 } as Currency,
  CAD: { code: 'CAD', decimalPlaces: 2 } as Currency,
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
  | 'CHECKING'
  | 'SAVINGS'
  | 'CREDIT_CARD'
  | 'CASH'
  | 'INVESTMENT'
  | 'LOAN'
  | 'OTHER';

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
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

/** Maps to KMP `com.finance.models.TransactionStatus`. */
export type TransactionStatus = 'PENDING' | 'CLEARED' | 'RECONCILED' | 'VOID';

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
  readonly moodTag?: string | null;

  // Merchant location (all optional)
  readonly merchantAddress: string | null;
  readonly merchantCity: string | null;
  readonly merchantState: string | null;
  readonly merchantZip: string | null;
  readonly merchantCountry: string | null;

  // Import metadata
  readonly externalReferenceId: string | null;
  readonly statementDescription: string | null;

  // Flexible fields
  readonly customFields: Readonly<Record<string, string>> | null;
  readonly extraNotes: string | null;

  /** Counterparty name (e.g. "Walgreens", "Microsoft"). */
  readonly counterpartyName: string | null;
  /** UUID of an internal account for transfer counterparties. */
  readonly counterpartyAccountId: SyncId | null;
}

/** Maps to KMP `com.finance.models.LiabilityType`. */
export type LiabilityType = 'BNPL' | 'LOAN' | 'CREDIT_LINE' | 'OTHER';

/** Maps to KMP `com.finance.models.LiabilityStatus`. */
export type LiabilityStatus = 'ACTIVE' | 'CLOSED' | 'CANCELLED' | 'DEFAULTED';

/** Maps to KMP `com.finance.models.LiabilityInstallmentStatus`. */
export type LiabilityInstallmentStatus = 'DUE' | 'PAID' | 'SKIPPED' | 'VOID';

/** Maps to KMP `com.finance.models.Liability`. */
export interface Liability extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly ownerId: SyncId;
  readonly type: LiabilityType;
  readonly status: LiabilityStatus;
  readonly provider: string;
  readonly merchantName: string;
  readonly originalAmount: Cents;
  readonly remainingBalance: Cents;
  readonly currency: Currency;
  readonly openedDate: LocalDate;
  readonly closedDate: LocalDate | null;
  readonly accountId: SyncId | null;
  readonly note: string | null;
}

/** Maps to KMP `com.finance.models.LiabilityInstallment`. */
export interface LiabilityInstallment extends SyncMetadata {
  readonly id: SyncId;
  readonly liabilityId: SyncId;
  readonly householdId: SyncId;
  readonly ownerId: SyncId;
  readonly sequenceNumber: number;
  readonly dueDate: LocalDate;
  readonly amount: Cents;
  readonly currency: Currency;
  readonly status: LiabilityInstallmentStatus;
  readonly paidAt: Instant | null;
  readonly paymentTransactionId: SyncId | null;
}

/** Maps to KMP `com.finance.models.BudgetPeriod`. */
export type BudgetPeriod = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

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
export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

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
  readonly isBiometricProtected?: boolean;
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
export type HouseholdRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

/** Maps to KMP `com.finance.models.HouseholdMember`. */
export interface HouseholdMember extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly userId: SyncId;
  readonly displayName: string | null;
  readonly role: HouseholdRole;
  readonly joinedAt: Instant;
}

/**
 * Permission capabilities that can be assigned per household role.
 * Maps to KMP `com.finance.models.HouseholdPermission`.
 */
export type HouseholdPermission =
  | 'MANAGE_MEMBERS'
  | 'INVITE_MEMBERS'
  | 'MANAGE_ROLES'
  | 'VIEW_SHARED_ACCOUNTS'
  | 'EDIT_SHARED_ACCOUNTS'
  | 'CREATE_SHARED_BUDGETS'
  | 'EDIT_SHARED_BUDGETS'
  | 'VIEW_SHARED_BUDGETS'
  | 'CREATE_SHARED_GOALS'
  | 'EDIT_SHARED_GOALS'
  | 'VIEW_SHARED_GOALS'
  | 'ADD_TRANSACTIONS';

/** Default permissions per household role. */
export const ROLE_PERMISSIONS: Readonly<Record<HouseholdRole, readonly HouseholdPermission[]>> = {
  OWNER: [
    'MANAGE_MEMBERS',
    'INVITE_MEMBERS',
    'MANAGE_ROLES',
    'VIEW_SHARED_ACCOUNTS',
    'EDIT_SHARED_ACCOUNTS',
    'CREATE_SHARED_BUDGETS',
    'EDIT_SHARED_BUDGETS',
    'VIEW_SHARED_BUDGETS',
    'CREATE_SHARED_GOALS',
    'EDIT_SHARED_GOALS',
    'VIEW_SHARED_GOALS',
    'ADD_TRANSACTIONS',
  ],
  ADMIN: [
    'INVITE_MEMBERS',
    'MANAGE_ROLES',
    'VIEW_SHARED_ACCOUNTS',
    'EDIT_SHARED_ACCOUNTS',
    'CREATE_SHARED_BUDGETS',
    'EDIT_SHARED_BUDGETS',
    'VIEW_SHARED_BUDGETS',
    'CREATE_SHARED_GOALS',
    'EDIT_SHARED_GOALS',
    'VIEW_SHARED_GOALS',
    'ADD_TRANSACTIONS',
  ],
  MEMBER: ['VIEW_SHARED_ACCOUNTS', 'VIEW_SHARED_BUDGETS', 'VIEW_SHARED_GOALS', 'ADD_TRANSACTIONS'],
  VIEWER: ['VIEW_SHARED_ACCOUNTS', 'VIEW_SHARED_BUDGETS', 'VIEW_SHARED_GOALS'],
};

/** Status of a household invitation. */
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

/** Maps to KMP `com.finance.models.HouseholdInvitation`. */
export interface HouseholdInvitation extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly invitedBy: SyncId;
  readonly email: string;
  readonly role: HouseholdRole;
  readonly status: InvitationStatus;
  readonly inviteCode: string;
  readonly expiresAt: Instant;
}

/**
 * Account sharing mode for mine/yours/ours finances.
 * Maps to KMP `com.finance.models.AccountSharingMode`.
 *
 * - `PRIVATE` — visible only to the owner ("mine only")
 * - `SHARED` — visible to all household members ("ours")
 */
export type AccountSharingMode = 'PRIVATE' | 'SHARED';

/** Per-account sharing configuration within a household. */
export interface AccountSharing extends SyncMetadata {
  readonly id: SyncId;
  readonly accountId: SyncId;
  readonly householdId: SyncId;
  readonly ownerId: SyncId;
  readonly sharingMode: AccountSharingMode;
}

/**
 * Shared budget mode for household budgets.
 *
 * - `FLEX` — overall spending limit, spend freely within categories
 * - `CATEGORY` — per-category limits for the household
 */
export type SharedBudgetMode = 'FLEX' | 'CATEGORY';

/** Shared household budget configuration. */
export interface SharedBudget extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly budgetId: SyncId;
  readonly mode: SharedBudgetMode;
  readonly isActive: boolean;
}

/** Per-member contribution tracking for a shared budget. */
export interface BudgetContribution {
  readonly memberId: SyncId;
  readonly memberName: string | null;
  readonly spentAmount: Cents;
}

/** Shared household goal with per-member contribution tracking. */
export interface SharedGoal extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly goalId: SyncId;
  readonly isShared: boolean;
}

/** Per-member contribution tracking for a shared goal. */
export interface GoalContribution {
  readonly memberId: SyncId;
  readonly memberName: string | null;
  readonly contributedAmount: Cents;
}

/** Maps to KMP `com.finance.models.InvestmentType`. */
export type InvestmentType =
  | 'STOCK'
  | 'BOND'
  | 'ETF'
  | 'MUTUAL_FUND'
  | 'CRYPTO'
  | 'REAL_ESTATE'
  | 'COMMODITY'
  | 'OTHER';

/** Maps to KMP `com.finance.models.Investment`. */
export interface Investment extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly accountId: SyncId | null;
  readonly symbol: string;
  readonly name: string;
  readonly type: InvestmentType;
  readonly shares: number;
  readonly costBasisPerShare: Cents;
  readonly currentPricePerShare: Cents;
  readonly currency: Currency;
  readonly lastPriceUpdate: Instant | null;
}

/** Maps to KMP `com.finance.models.TaxTreatment`. */
export type TaxTreatment = 'TAXABLE' | 'TAX_DEFERRED' | 'TAX_FREE';

/** Maps to KMP `com.finance.models.InvestmentAccountSubtype`. */
export type InvestmentAccountSubtype =
  | 'BROKERAGE'
  | 'TRADITIONAL_IRA'
  | 'ROTH_IRA'
  | 'SEP_IRA'
  | 'SIMPLE_IRA'
  | '401K'
  | '403B'
  | '457B'
  | 'HSA'
  | '529'
  | 'TRUST'
  | 'OTHER';

/** Maps to KMP `com.finance.models.CostBasisMethod`. */
export type CostBasisMethod = 'FIFO' | 'LIFO' | 'SPECIFIC_ID' | 'AVERAGE_COST';

/** Maps to KMP `com.finance.models.InvestmentLot`. */
export interface InvestmentLot extends SyncMetadata {
  readonly id: SyncId;
  readonly investmentId: SyncId;
  readonly purchaseDate: LocalDate;
  readonly shares: number;
  readonly costPerShare: Cents;
  readonly totalCost: Cents;
}

/** Maps to KMP `com.finance.models.BillFrequency`. */
export type BillFrequency = 'ONE_TIME' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

/** Maps to KMP `com.finance.models.BillStatus`. */
export type BillStatus = 'UPCOMING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/** Maps to KMP `com.finance.models.Bill`. */
export interface Bill extends SyncMetadata {
  readonly id: SyncId;
  readonly householdId: SyncId;
  readonly name: string;
  readonly payee: string;
  readonly amount: Cents;
  readonly currency: Currency;
  readonly dueDate: LocalDate;
  readonly frequency: BillFrequency;
  readonly status: BillStatus;
  readonly categoryId: SyncId | null;
  readonly accountId: SyncId | null;
  readonly note: string | null;
  readonly isAutoPay: boolean;
  readonly reminderDaysBefore: number;
  readonly lastPaidDate: LocalDate | null;
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
