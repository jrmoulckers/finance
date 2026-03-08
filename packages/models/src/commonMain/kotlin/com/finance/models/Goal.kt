// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

@Serializable
enum class GoalStatus { ACTIVE, PAUSED, COMPLETED, CANCELLED }

@Serializable
data class Goal(
    val id: SyncId,
    val householdId: SyncId,
    val name: String,
    val targetAmount: Cents,
    val currentAmount: Cents = Cents.ZERO,
    val currency: Currency,
    val targetDate: LocalDate? = null,
    val status: GoalStatus = GoalStatus.ACTIVE,
    val icon: String? = null,
    val color: String? = null,
    val accountId: SyncId? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(name.isNotBlank()) { "Goal name cannot be blank" }
        require(targetAmount.isPositive()) { "Goal target must be positive" }
    }

    /** Fraction of target reached, clamped to 0.0–1.0. */
    val progress: Double get() = if (targetAmount.amount > 0) {
        (currentAmount.amount.toDouble() / targetAmount.amount).coerceIn(0.0, 1.0)
    } else 0.0

    /** Whether [currentAmount] has reached or exceeded [targetAmount]. */
    val isComplete: Boolean get() = currentAmount.amount >= targetAmount.amount
}
