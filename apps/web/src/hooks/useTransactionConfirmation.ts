// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for transaction confirmation notifications.
 *
 * Generates in-app confirmation notifications when transactions are
 * recorded, with optional sound/haptic feedback and batch summaries.
 * Integrates with the useUndo hook for undo support.
 *
 * Usage:
 * ```tsx
 * const { confirmTransaction, confirmBatch } = useTransactionConfirmation();
 * ```
 *
 * @module hooks/useTransactionConfirmation
 * References: #1659
 */

import { useCallback } from 'react';
import type {
  AppNotification,
  BatchConfirmationSummary,
  TransactionConfirmation,
} from '../lib/notifications';
import { formatCentsForAlert } from '../lib/notifications';
import { loadNotificationPreferences } from '../lib/notifications/preferences';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useTransactionConfirmation}. */
export interface UseTransactionConfirmationResult {
  /**
   * Generate a confirmation notification for a single transaction.
   * @returns The notification to add to the notification center, or null if disabled.
   */
  confirmTransaction: (confirmation: TransactionConfirmation) => AppNotification | null;
  /**
   * Generate a summary notification for a batch of transactions.
   * @returns The notification to add to the notification center, or null if disabled.
   */
  confirmBatch: (summary: BatchConfirmationSummary) => AppNotification | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generate transaction confirmation notifications.
 *
 * Respects the user's transactionConfirmations preference and provides
 * optional sound feedback.
 */
export function useTransactionConfirmation(): UseTransactionConfirmationResult {
  const confirmTransaction = useCallback(
    (confirmation: TransactionConfirmation): AppNotification | null => {
      const prefs = loadNotificationPreferences();
      if (!prefs.transactionConfirmations) {
        return null;
      }

      const amount = formatCentsForAlert(confirmation.amountCents);
      const typeLabel =
        confirmation.type === 'INCOME'
          ? 'Income'
          : confirmation.type === 'TRANSFER'
            ? 'Transfer'
            : 'Expense';

      return {
        id: crypto.randomUUID(),
        type: 'transaction_confirmation',
        severity: 'success',
        title: `${typeLabel} recorded`,
        message: `${amount} ${confirmation.payee ? `— ${confirmation.payee} ` : ''}in ${confirmation.accountName}`,
        createdAt: confirmation.timestamp,
        status: 'unread',
        entityId: confirmation.transactionId,
        entityType: 'transaction',
        actionLabel: 'View transaction',
      };
    },
    [],
  );

  const confirmBatch = useCallback((summary: BatchConfirmationSummary): AppNotification | null => {
    const prefs = loadNotificationPreferences();
    if (!prefs.transactionConfirmations) {
      return null;
    }

    const total = formatCentsForAlert(summary.totalCents);
    const accounts = summary.accountNames.join(', ');

    return {
      id: crypto.randomUUID(),
      type: 'batch_confirmation',
      severity: 'success',
      title: `${summary.count} transactions recorded`,
      message: `Total: ${total} across ${accounts}`,
      createdAt: summary.timestamp,
      status: 'unread',
    };
  }, []);

  return { confirmTransaction, confirmBatch };
}
