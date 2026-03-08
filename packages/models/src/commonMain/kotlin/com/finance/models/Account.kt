// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

@Serializable
enum class AccountType { CHECKING, SAVINGS, CREDIT_CARD, CASH, INVESTMENT, LOAN, OTHER }

@Serializable
data class Account(
    val id: SyncId,
    val householdId: SyncId,
    val name: String,
    val type: AccountType,
    val currency: Currency,
    val currentBalance: Cents,
    val isArchived: Boolean = false,
    val sortOrder: Int = 0,
    val icon: String? = null,
    val color: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(name.isNotBlank()) { "Account name cannot be blank" }
    }
}
