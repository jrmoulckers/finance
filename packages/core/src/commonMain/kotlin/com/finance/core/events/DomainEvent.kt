// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.events

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant

/**
 * Domain events emitted when significant financial state changes occur.
 * Used for audit trails, notifications, and reactive updates.
 */
sealed class DomainEvent {
    abstract val timestamp: Instant
    abstract val householdId: SyncId

    // — Transaction events —

    data class TransactionCreated(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val transactionId: SyncId,
        val accountId: SyncId,
        val amount: Cents,
    ) : DomainEvent()

    data class TransactionUpdated(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val transactionId: SyncId,
        val previousAmount: Cents,
        val newAmount: Cents,
    ) : DomainEvent()

    data class TransactionDeleted(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val transactionId: SyncId,
    ) : DomainEvent()

    // — Budget events —

    data class BudgetExceeded(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val budgetId: SyncId,
        val budgetAmount: Cents,
        val spentAmount: Cents,
    ) : DomainEvent()

    data class BudgetThresholdReached(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val budgetId: SyncId,
        val thresholdPercent: Int,
        val utilization: Double,
    ) : DomainEvent()

    // — Account events —

    data class BalanceChanged(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val accountId: SyncId,
        val previousBalance: Cents,
        val newBalance: Cents,
    ) : DomainEvent()

    data class LowBalanceAlert(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val accountId: SyncId,
        val currentBalance: Cents,
        val threshold: Cents,
    ) : DomainEvent()

    // — Goal events —

    data class GoalCompleted(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val goalId: SyncId,
        val targetAmount: Cents,
    ) : DomainEvent()

    data class GoalMilestoneReached(
        override val timestamp: Instant,
        override val householdId: SyncId,
        val goalId: SyncId,
        val milestonePercent: Int,
    ) : DomainEvent()
}
