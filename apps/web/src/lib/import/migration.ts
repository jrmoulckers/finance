// SPDX-License-Identifier: BUSL-1.1

/**
 * Import session management and historical data migration types.
 *
 * Provides batch import tracking, progress monitoring, duplicate
 * detection across batches, and merge strategy configuration.
 *
 * Supports accountless historical import for evaluation and migration
 * scenarios where users want to import data before committing to
 * an account structure (#1627).
 *
 * Pure functions — no side effects, no database access.
 */

import { ParsedTransaction } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Unique identifier for an import session. */
export type ImportSessionId = string;

/** Status of an import session. */
export type ImportSessionStatus =
  'pending' | 'in_progress' | 'completed' | 'rolled_back' | 'failed';

/** Strategy for handling duplicates during import. */
export type MergeStrategy = 'skip' | 'overwrite' | 'keep_both';

/** A single import session tracking batch progress. */
export interface ImportSession {
  /** Unique session identifier. */
  readonly id: ImportSessionId;
  /** Human-readable label for this import batch. */
  readonly label: string;
  /** Source file name. */
  readonly fileName: string;
  /** ISO 8601 timestamp when the session was created. */
  readonly createdAt: string;
  /** ISO 8601 timestamp of last update. */
  readonly updatedAt: string;
  /** Current session status. */
  readonly status: ImportSessionStatus;
  /** Total number of transactions in this batch. */
  readonly totalTransactions: number;
  /** Number of transactions successfully imported. */
  readonly importedCount: number;
  /** Number of transactions skipped (duplicates, errors). */
  readonly skippedCount: number;
  /** Number of errors encountered. */
  readonly errorCount: number;
  /** Merge strategy used for this session. */
  readonly mergeStrategy: MergeStrategy;
  /** Target account ID, or null for accountless import. */
  readonly accountId: string | null;
  /** IDs of transactions created in this session (for rollback). */
  readonly createdTransactionIds: readonly string[];
}

/** Progress update during an import session. */
export interface ImportProgress {
  /** Session this progress belongs to. */
  readonly sessionId: ImportSessionId;
  /** Number of transactions processed so far. */
  readonly processed: number;
  /** Total number of transactions to process. */
  readonly total: number;
  /** Progress percentage (0–100). */
  readonly percentage: number;
  /** Current status message. */
  readonly message: string;
  /** Whether the import can still be cancelled. */
  readonly cancellable: boolean;
}

/** Result of a duplicate check across import batches. */
export interface DuplicateCheckResult {
  /** The transaction that may be a duplicate. */
  readonly transaction: ParsedTransaction;
  /** Whether a duplicate was found. */
  readonly isDuplicate: boolean;
  /** Session ID where the duplicate was originally imported, if found. */
  readonly existingSessionId: ImportSessionId | null;
  /** Reason for the duplicate determination. */
  readonly reason: string;
}

/** Configuration for a new import session. */
export interface ImportSessionConfig {
  /** Human-readable label. */
  readonly label: string;
  /** Source file name. */
  readonly fileName: string;
  /** Merge strategy for duplicates. @default 'skip' */
  readonly mergeStrategy?: MergeStrategy;
  /** Target account ID, or null for accountless import. */
  readonly accountId?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new import session for tracking a batch import.
 *
 * @param config - Session configuration.
 * @param transactionCount - Total number of transactions in the batch.
 * @returns A new `ImportSession` in 'pending' status.
 */
export function createImportSession(
  config: ImportSessionConfig,
  transactionCount: number,
): ImportSession {
  const now = new Date().toISOString();
  return {
    id: generateSessionId(),
    label: config.label,
    fileName: config.fileName,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    totalTransactions: transactionCount,
    importedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    mergeStrategy: config.mergeStrategy ?? 'skip',
    accountId: config.accountId ?? null,
    createdTransactionIds: [],
  };
}

/**
 * Update an import session's progress.
 *
 * Returns a new session object with updated counts and status.
 * Immutable — does not modify the input session.
 *
 * @param session - The current session state.
 * @param update - Fields to update.
 * @returns A new session with the updates applied.
 */
export function updateSessionProgress(
  session: ImportSession,
  update: {
    importedCount?: number;
    skippedCount?: number;
    errorCount?: number;
    status?: ImportSessionStatus;
    createdTransactionIds?: readonly string[];
  },
): ImportSession {
  return {
    ...session,
    importedCount: update.importedCount ?? session.importedCount,
    skippedCount: update.skippedCount ?? session.skippedCount,
    errorCount: update.errorCount ?? session.errorCount,
    status: update.status ?? session.status,
    createdTransactionIds: update.createdTransactionIds ?? session.createdTransactionIds,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Compute the current progress of an import session.
 *
 * @param session - The import session to compute progress for.
 * @returns An `ImportProgress` snapshot.
 */
export function computeProgress(session: ImportSession): ImportProgress {
  const processed = session.importedCount + session.skippedCount + session.errorCount;
  const total = session.totalTransactions;
  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  let message: string;
  switch (session.status) {
    case 'pending':
      message = 'Waiting to start import…';
      break;
    case 'in_progress':
      message = `Importing: ${processed} of ${total} transactions processed`;
      break;
    case 'completed':
      message = `Import complete: ${session.importedCount} imported, ${session.skippedCount} skipped`;
      break;
    case 'rolled_back':
      message = 'Import rolled back';
      break;
    case 'failed':
      message = `Import failed: ${session.errorCount} errors`;
      break;
    default:
      message = 'Unknown status';
  }

  return {
    sessionId: session.id,
    processed,
    total,
    percentage,
    message,
    cancellable: session.status === 'pending' || session.status === 'in_progress',
  };
}

/**
 * Prepare a session for rollback by marking it and returning transaction IDs to delete.
 *
 * Does NOT perform the actual deletion — that requires database access.
 * Returns the updated session and the list of IDs that should be removed.
 *
 * @param session - The session to roll back.
 * @returns Object with the updated session and IDs to remove.
 */
export function prepareRollback(session: ImportSession): {
  session: ImportSession;
  transactionIdsToRemove: readonly string[];
} {
  return {
    session: updateSessionProgress(session, { status: 'rolled_back' }),
    transactionIdsToRemove: session.createdTransactionIds,
  };
}

/**
 * Check a batch of transactions for duplicates against previously imported data.
 *
 * Compares by sourceId, then by (date, amountCents, description) triple.
 * Uses a simple hash-based approach for efficiency with large datasets.
 *
 * @param transactions - Transactions to check for duplicates.
 * @param previouslyImported - Transactions from earlier import sessions.
 * @param previousSessionId - Session ID of the previous import (for reporting).
 * @returns Array of duplicate check results for each transaction.
 */
export function checkDuplicates(
  transactions: readonly ParsedTransaction[],
  previouslyImported: readonly ParsedTransaction[],
  previousSessionId: ImportSessionId,
): readonly DuplicateCheckResult[] {
  // Build lookup sets for fast duplicate detection
  const sourceIdSet = new Set<string>();
  const signatureSet = new Set<string>();

  for (const prev of previouslyImported) {
    if (prev.sourceId) {
      sourceIdSet.add(prev.sourceId);
    }
    signatureSet.add(transactionSignature(prev));
  }

  return transactions.map((txn) => {
    // Check sourceId first
    if (txn.sourceId && sourceIdSet.has(txn.sourceId)) {
      return {
        transaction: txn,
        isDuplicate: true,
        existingSessionId: previousSessionId,
        reason: `Duplicate source ID: ${txn.sourceId}`,
      };
    }

    // Check by signature
    const sig = transactionSignature(txn);
    if (signatureSet.has(sig)) {
      return {
        transaction: txn,
        isDuplicate: true,
        existingSessionId: previousSessionId,
        reason: 'Duplicate transaction signature (date + amount + description)',
      };
    }

    return {
      transaction: txn,
      isDuplicate: false,
      existingSessionId: null,
      reason: 'No duplicate found',
    };
  });
}

/**
 * Apply a merge strategy to determine which transactions to import.
 *
 * @param transactions - All transactions in the batch.
 * @param duplicateResults - Results from `checkDuplicates`.
 * @param strategy - The merge strategy to apply.
 * @returns Object with transactions to import and transactions to skip.
 */
export function applyMergeStrategy(
  transactions: readonly ParsedTransaction[],
  duplicateResults: readonly DuplicateCheckResult[],
  strategy: MergeStrategy,
): {
  toImport: readonly ParsedTransaction[];
  toSkip: readonly ParsedTransaction[];
} {
  const toImport: ParsedTransaction[] = [];
  const toSkip: ParsedTransaction[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const dup = duplicateResults[i];

    if (!dup.isDuplicate) {
      toImport.push(transactions[i]);
      continue;
    }

    switch (strategy) {
      case 'skip':
        toSkip.push(transactions[i]);
        break;
      case 'overwrite':
        toImport.push(transactions[i]);
        break;
      case 'keep_both':
        toImport.push(transactions[i]);
        break;
    }
  }

  return { toImport, toSkip };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a unique session ID. */
function generateSessionId(): ImportSessionId {
  // Use crypto.randomUUID when available, otherwise fallback to timestamp-based
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `import-${crypto.randomUUID()}`;
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a signature string for a transaction for duplicate detection.
 * Combines date + amount + normalized description.
 */
function transactionSignature(txn: ParsedTransaction): string {
  const normalizedDesc = txn.description.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${txn.date}|${txn.amountCents}|${normalizedDesc}`;
}
