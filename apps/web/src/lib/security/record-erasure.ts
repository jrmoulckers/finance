// SPDX-License-Identifier: BUSL-1.1

/**
 * Selective Record Erasure — mark specific records for deletion with
 * cascade logic, retention policy checks, and erasure receipts.
 *
 * This module handles the business logic for GDPR "right to erasure"
 * requests at the individual record level. It does NOT directly delete
 * data from SQLite — instead it produces erasure request objects that
 * the repository layer can act on.
 *
 * References: issue #1658
 */

import type {
  ErasableRecordType,
  ErasureRequest,
  ErasureStatus,
  RetentionCheckResult,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default retention period in days for financial records. */
const DEFAULT_RETENTION_DAYS = 365 * 7; // 7 years for tax compliance

/** Record types with mandatory retention periods (days). */
const RETENTION_PERIODS: Readonly<Record<ErasableRecordType, number>> = {
  transaction: DEFAULT_RETENTION_DAYS,
  account: DEFAULT_RETENTION_DAYS,
  budget: 0, // No mandatory retention
  goal: 0, // No mandatory retention
  category: 0, // No mandatory retention
};

// ---------------------------------------------------------------------------
// Retention policy
// ---------------------------------------------------------------------------

/**
 * Check whether a record can be erased based on retention policies.
 *
 * Financial records (transactions, accounts) may be subject to tax
 * retention requirements. Non-financial records can be erased immediately.
 *
 * @param recordType - The type of record.
 * @param recordCreatedAt - ISO-8601 creation date of the record.
 * @param overrideRetention - If true, bypass retention checks (user explicit consent).
 * @returns A RetentionCheckResult indicating whether erasure is allowed.
 */
export function checkRetentionPolicy(
  recordType: ErasableRecordType,
  recordCreatedAt: string,
  overrideRetention = false,
): RetentionCheckResult {
  if (overrideRetention) {
    return { canErase: true, reason: null, retentionExpiresAt: null };
  }

  const retentionDays = RETENTION_PERIODS[recordType];
  if (retentionDays === 0) {
    return { canErase: true, reason: null, retentionExpiresAt: null };
  }

  const createdDate = new Date(recordCreatedAt);
  const retentionExpiry = new Date(createdDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  if (now >= retentionExpiry) {
    return { canErase: true, reason: null, retentionExpiresAt: null };
  }

  return {
    canErase: false,
    reason: `Record is within the ${retentionDays}-day retention period for ${recordType} records. Override with explicit consent if needed.`,
    retentionExpiresAt: retentionExpiry.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cascade actions
// ---------------------------------------------------------------------------

/**
 * Determine cascade actions that must occur when a record is erased.
 *
 * For example, erasing a transaction requires recalculating account
 * balances. Erasing an account requires handling linked transactions.
 *
 * @param recordType - The type of record being erased.
 * @returns An array of human-readable cascade action descriptions.
 */
export function determineCascadeActions(recordType: ErasableRecordType): readonly string[] {
  switch (recordType) {
    case 'transaction':
      return [
        'Recalculate affected account balance',
        'Update budget spent amounts for the transaction period',
        'Remove from recurring rule match history',
      ];
    case 'account':
      return [
        'Soft-delete all transactions linked to this account',
        'Unlink from any savings goals targeting this account',
        'Recalculate net worth totals',
      ];
    case 'budget':
      return ['Remove budget period history', 'Clear budget-to-category linkages'];
    case 'goal':
      return ['Unlink from funding account', 'Remove progress history entries'];
    case 'category':
      return [
        'Set transactions using this category to "Uncategorized"',
        'Remove from budget category assignments',
      ];
  }
}

// ---------------------------------------------------------------------------
// Erasure request management
// ---------------------------------------------------------------------------

/**
 * Create an erasure request for a specific record.
 *
 * @param recordType - The type of record to erase.
 * @param recordId - The unique ID of the record.
 * @param reason - Human-readable reason for the erasure.
 * @returns A new ErasureRequest in 'pending' status with computed cascade actions.
 */
export function createErasureRequest(
  recordType: ErasableRecordType,
  recordId: string,
  reason: string,
): ErasureRequest {
  return {
    id: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
    recordType,
    recordId,
    reason,
    status: 'pending',
    completedAt: null,
    cascadeActions: determineCascadeActions(recordType),
  };
}

/**
 * Update the status of an erasure request.
 *
 * @param request - The current erasure request.
 * @param newStatus - The new status.
 * @returns A new ErasureRequest with the updated status.
 */
export function updateErasureStatus(
  request: ErasureRequest,
  newStatus: ErasureStatus,
): ErasureRequest {
  return {
    ...request,
    status: newStatus,
    completedAt: newStatus === 'completed' ? new Date().toISOString() : request.completedAt,
  };
}

/**
 * Generate an erasure receipt confirming the deletion.
 *
 * This receipt serves as proof that data was erased per the user's request.
 * It contains no actual financial data — only metadata about the erasure.
 *
 * @param request - The completed erasure request.
 * @returns A formatted receipt string.
 */
export function generateErasureReceipt(request: ErasureRequest): string {
  return JSON.stringify(
    {
      type: 'erasure_receipt',
      requestId: request.id,
      recordType: request.recordType,
      recordId: request.recordId,
      requestedAt: request.requestedAt,
      completedAt: request.completedAt,
      status: request.status,
      cascadeActions: request.cascadeActions,
      reason: request.reason,
    },
    null,
    2,
  );
}
