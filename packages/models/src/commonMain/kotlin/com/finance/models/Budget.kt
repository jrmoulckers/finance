package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

@Serializable
enum class BudgetPeriod { WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, YEARLY }

@Serializable
data class Budget(
    val id: SyncId,
    val householdId: SyncId,
    val categoryId: SyncId,
    val name: String,
    val amount: Cents,
    val currency: Currency,
    val period: BudgetPeriod,
    val startDate: LocalDate,
    val endDate: LocalDate? = null,
    val isRollover: Boolean = false,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(name.isNotBlank()) { "Budget name cannot be blank" }
        require(amount.isPositive()) { "Budget amount must be positive" }
    }
}
