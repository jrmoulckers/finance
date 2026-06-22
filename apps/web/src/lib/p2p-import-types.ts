// SPDX-License-Identifier: BUSL-1.1

/**
 * Types for the peer-to-peer (Venmo / Cash App) import engine.
 *
 * The engine parses exported P2P activity, classifies every entry as true
 * spending, a reimbursement, or a bank transfer, and nets matched
 * reimbursement flows into a single transaction so that money you fronted for
 * friends (or owed to a roommate) does not distort budgets, cash-flow, or
 * insights.
 *
 * All monetary values are integer **minor units (cents)**. There is never any
 * floating-point money in this module.
 */

/** Supported P2P export sources. `generic` is a tolerant fallback schema. */
export type P2PProvider = 'venmo' | 'cashapp' | 'generic';

/** The kind of money movement described by a single row. */
export type P2PFlowType = 'payment' | 'request' | 'transfer';

/** How a row affects (or is excluded from) budgets and cash-flow. */
export type P2PClassification = 'spending' | 'reimbursement' | 'transfer';

/**
 * User-supplied override for a single row. `split-with-friends` and
 * `roommate-reimbursement` both reclassify a row as a reimbursement so it is
 * kept out of budget-distorting totals, while preserving the user's intent for
 * display and auditing.
 */
export type P2POverride = 'split-with-friends' | 'roommate-reimbursement' | 'spending' | 'transfer';

/** A single tolerant-parsed P2P row before classification. */
export interface P2PParsedRow {
  /** 0-based index of the data row within the source file. */
  readonly index: number;
  /** Source provider this row was parsed from. */
  readonly provider: P2PProvider;
  /** ISO 8601 date (YYYY-MM-DD). */
  readonly date: string;
  /** Free-text note / description. */
  readonly note: string;
  /** Other party's display name (never persisted raw to the budget). */
  readonly counterparty: string;
  /** Signed amount in cents: positive = money in, negative = money out. */
  readonly amountCents: number;
  /** Provider fee in cents (always >= 0). */
  readonly feeCents: number;
  /** Flow type derived from the provider's type column. */
  readonly flowType: P2PFlowType;
  /** Raw header → value map for auditing. */
  readonly rawFields: Readonly<Record<string, string>>;
}

/** A row that could not be parsed. */
export interface P2PParseError {
  /** 1-based data line number (header excluded). */
  readonly line: number;
  /** Human-readable reason. */
  readonly message: string;
  /** The offending raw row joined for display. */
  readonly raw: string;
}

/** Result of the tolerant CSV parse step. */
export interface P2PParseResult {
  /** Detected provider, or null when the file is unrecognized. */
  readonly provider: P2PProvider | null;
  /** Successfully parsed rows. */
  readonly rows: readonly P2PParsedRow[];
  /** Rows that failed to parse. */
  readonly errors: readonly P2PParseError[];
}

/** A classified row, after heuristics and any user override are applied. */
export interface P2PClassifiedRow extends P2PParsedRow {
  /** Heuristic classification (ignores overrides). */
  readonly classification: P2PClassification;
  /** Confidence of the heuristic classification, 0–100. */
  readonly confidence: number;
  /** Human-readable reasons supporting the classification (no color-only UI). */
  readonly reasons: readonly string[];
  /** User override, or null when none was supplied. */
  readonly override: P2POverride | null;
  /** Classification actually used after applying the override. */
  readonly effectiveClassification: P2PClassification;
  /** True when this row is kept out of budget/cash-flow/insights. */
  readonly excludedFromBudget: boolean;
  /** Id of the net group this row belongs to, or null. */
  readonly netGroupId: string | null;
}

/**
 * A spending outflow with one or more reimbursement inflows netted against it,
 * collapsed into a single net transaction.
 */
export interface P2PNetGroup {
  /** Stable id (`net-<anchorIndex>`). */
  readonly id: string;
  /** Row index of the spending outflow that anchors the group. */
  readonly anchorIndex: number;
  /** Row indices of the reimbursement inflows folded into the net. */
  readonly memberIndices: readonly number[];
  /** Counterparty of the anchor row. */
  readonly counterparty: string;
  /** Note of the anchor row. */
  readonly note: string;
  /** Date of the anchor row (ISO 8601). */
  readonly date: string;
  /** Gross spending magnitude in cents (always >= 0). */
  readonly grossSpendingCents: number;
  /** Total reimbursed in cents (always >= 0). */
  readonly reimbursedCents: number;
  /** Net spending after reimbursement, clamped to >= 0. */
  readonly netSpendingCents: number;
  /** Amount reimbursed beyond the gross spend, clamped to >= 0. */
  readonly overReimbursedCents: number;
}

/** Aggregate totals describing the whole import. */
export interface P2PImportSummary {
  readonly totalRows: number;
  readonly spendingCount: number;
  readonly reimbursementCount: number;
  readonly transferCount: number;
  readonly netGroupCount: number;
  /** Sum of |amount| for spending outflows before netting. */
  readonly grossSpendingCents: number;
  /** Sum of reimbursement inflows. */
  readonly reimbursementCents: number;
  /** Budget-affecting spend after netting reimbursements. */
  readonly netSpendingCents: number;
  /** Sum of |amount| reclassified as reimbursement (kept out of budget). */
  readonly excludedFromBudgetCents: number;
}

/** The full, recomputable import plan. */
export interface P2PImportPlan {
  readonly provider: P2PProvider | null;
  readonly rows: readonly P2PClassifiedRow[];
  readonly groups: readonly P2PNetGroup[];
  readonly errors: readonly P2PParseError[];
  readonly summary: P2PImportSummary;
}

/** A budget-affecting transaction the user can confirm and save. */
export interface P2PImportableTransaction {
  /** Anchor row index this transaction is derived from. */
  readonly anchorIndex: number;
  /** ISO 8601 date. */
  readonly date: string;
  /** Counterparty / payee for display. */
  readonly payee: string;
  /** Note for the saved transaction. */
  readonly note: string;
  /** Signed amount in cents (negative = expense). */
  readonly amountCents: number;
  /** Amount netted out of this transaction (>= 0). */
  readonly reimbursedCents: number;
  /** True when reimbursements were netted into the amount. */
  readonly isNetted: boolean;
}

/** Options for the classification step. */
export interface P2PClassifyOptions {
  /** Your own names / handles, used to detect self-transfers. */
  readonly selfNames?: readonly string[];
}

/** Options for the reimbursement netting step. */
export interface P2PNetOptions {
  /** Maximum days between a spend and a reimbursement to pair them. @default 30 */
  readonly windowDays?: number;
}

/** Options for the full {@link buildP2PImportPlan} pipeline. */
export interface P2PImportOptions extends P2PClassifyOptions, P2PNetOptions {
  /** Force a provider instead of auto-detecting. */
  readonly provider?: P2PProvider;
  /** Per-row overrides keyed by row index. */
  readonly overrides?: Readonly<Record<number, P2POverride>>;
}
