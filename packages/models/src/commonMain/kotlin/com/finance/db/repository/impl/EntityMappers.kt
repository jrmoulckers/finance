// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

/**
 * Mapper functions to convert between SQLDelight row columns and domain models.
 *
 * SQLDelight stores: Booleans as INTEGER (0/1), Enums as TEXT,
 * Cents as INTEGER (Long), Dates/Instants as TEXT (ISO 8601), Tags as TEXT (JSON array).
 */
object EntityMappers {

    @Suppress("LongParameterList")
    fun mapAccount(
        id: String, householdId: String, ownerId: String, name: String,
        type: String, currency: String, currentBalance: Long, isArchived: Long,
        sortOrder: Long, icon: String?, color: String?, createdAt: String,
        updatedAt: String, deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): Account = Account(
        id = SyncId(id), householdId = SyncId(householdId), ownerId = SyncId(ownerId),
        name = name, type = AccountType.valueOf(type), currency = Currency(currency),
        currentBalance = Cents(currentBalance), isArchived = isArchived != 0L,
        sortOrder = sortOrder.toInt(), icon = icon, color = color,
        createdAt = Instant.parse(createdAt), updatedAt = Instant.parse(updatedAt),
        deletedAt = deletedAt?.let { Instant.parse(it) },
        syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    @Suppress("LongParameterList")
    fun mapTransaction(
        id: String, householdId: String, ownerId: String, accountId: String,
        categoryId: String?, type: String, status: String, amount: Long,
        currency: String, payee: String?, note: String?, date: String,
        transferAccountId: String?, transferTransactionId: String?,
        isRecurring: Long, recurringRuleId: String?, tags: String,
        createdAt: String, updatedAt: String, deletedAt: String?,
        syncVersion: Long, isSynced: Long, moodTag: String? = null,
    ): Transaction = Transaction(
        id = SyncId(id), householdId = SyncId(householdId), ownerId = SyncId(ownerId),
        accountId = SyncId(accountId), categoryId = categoryId?.let { SyncId(it) },
        type = TransactionType.valueOf(type), status = TransactionStatus.valueOf(status),
        amount = Cents(amount), currency = Currency(currency), payee = payee, note = note,
        date = LocalDate.parse(date),
        transferAccountId = transferAccountId?.let { SyncId(it) },
        transferTransactionId = transferTransactionId?.let { SyncId(it) },
        isRecurring = isRecurring != 0L, recurringRuleId = recurringRuleId?.let { SyncId(it) },
        tags = parseTags(tags), moodTag = moodTag,
        createdAt = Instant.parse(createdAt),
        updatedAt = Instant.parse(updatedAt), deletedAt = deletedAt?.let { Instant.parse(it) },
        syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    @Suppress("LongParameterList")
    fun mapLiability(
        id: String, householdId: String, ownerId: String, type: String, status: String,
        provider: String, merchantName: String, originalAmount: Long, remainingBalance: Long,
        currency: String, openedDate: String, closedDate: String?, accountId: String?, note: String?,
        createdAt: String, updatedAt: String, deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): Liability = Liability(
        id = SyncId(id), householdId = SyncId(householdId), ownerId = SyncId(ownerId),
        type = LiabilityType.valueOf(type), status = LiabilityStatus.valueOf(status),
        provider = provider, merchantName = merchantName, originalAmount = Cents(originalAmount),
        remainingBalance = Cents(remainingBalance), currency = Currency(currency),
        openedDate = LocalDate.parse(openedDate), closedDate = closedDate?.let { LocalDate.parse(it) },
        accountId = accountId?.let { SyncId(it) }, note = note, createdAt = Instant.parse(createdAt),
        updatedAt = Instant.parse(updatedAt), deletedAt = deletedAt?.let { Instant.parse(it) },
        syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    @Suppress("LongParameterList")
    fun mapLiabilityInstallment(
        id: String, liabilityId: String, householdId: String, ownerId: String,
        sequenceNumber: Long, dueDate: String, amount: Long, currency: String, status: String,
        paidAt: String?, paymentTransactionId: String?, createdAt: String, updatedAt: String,
        deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): LiabilityInstallment = LiabilityInstallment(
        id = SyncId(id), liabilityId = SyncId(liabilityId), householdId = SyncId(householdId),
        ownerId = SyncId(ownerId), sequenceNumber = sequenceNumber.toInt(), dueDate = LocalDate.parse(dueDate),
        amount = Cents(amount), currency = Currency(currency), status = LiabilityInstallmentStatus.valueOf(status),
        paidAt = paidAt?.let { Instant.parse(it) }, paymentTransactionId = paymentTransactionId?.let { SyncId(it) },
        createdAt = Instant.parse(createdAt), updatedAt = Instant.parse(updatedAt),
        deletedAt = deletedAt?.let { Instant.parse(it) }, syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    @Suppress("LongParameterList")
    fun mapBudget(
        id: String, householdId: String, ownerId: String, categoryId: String,
        name: String, amount: Long, currency: String, period: String,
        startDate: String, endDate: String?, isRollover: Long,
        createdAt: String, updatedAt: String, deletedAt: String?,
        syncVersion: Long, isSynced: Long,
    ): Budget = Budget(
        id = SyncId(id), householdId = SyncId(householdId), ownerId = SyncId(ownerId),
        categoryId = SyncId(categoryId), name = name, amount = Cents(amount),
        currency = Currency(currency), period = BudgetPeriod.valueOf(period),
        startDate = LocalDate.parse(startDate), endDate = endDate?.let { LocalDate.parse(it) },
        isRollover = isRollover != 0L, createdAt = Instant.parse(createdAt),
        updatedAt = Instant.parse(updatedAt), deletedAt = deletedAt?.let { Instant.parse(it) },
        syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    @Suppress("LongParameterList")
    fun mapGoal(
        id: String, householdId: String, ownerId: String, name: String,
        targetAmount: Long, currentAmount: Long, currency: String,
        targetDate: String?, status: String, icon: String?, color: String?,
        accountId: String?, createdAt: String, updatedAt: String,
        deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): Goal = Goal(
        id = SyncId(id), householdId = SyncId(householdId), ownerId = SyncId(ownerId),
        name = name, targetAmount = Cents(targetAmount), currentAmount = Cents(currentAmount),
        currency = Currency(currency), targetDate = targetDate?.let { LocalDate.parse(it) },
        status = GoalStatus.valueOf(status), icon = icon, color = color,
        accountId = accountId?.let { SyncId(it) }, createdAt = Instant.parse(createdAt),
        updatedAt = Instant.parse(updatedAt), deletedAt = deletedAt?.let { Instant.parse(it) },
        syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    @Suppress("LongParameterList")
    fun mapCategory(
        id: String, householdId: String, ownerId: String, name: String,
        icon: String?, color: String?, parentId: String?, isIncome: Long,
        isSystem: Long, sortOrder: Long, isBiometricProtected: Long,
        createdAt: String, updatedAt: String, deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): Category = Category(
        id = SyncId(id), householdId = SyncId(householdId), ownerId = SyncId(ownerId),
        name = name, icon = icon, color = color, parentId = parentId?.let { SyncId(it) },
        isIncome = isIncome != 0L, isSystem = isSystem != 0L, sortOrder = sortOrder.toInt(),
        isBiometricProtected = isBiometricProtected != 0L,
        createdAt = Instant.parse(createdAt), updatedAt = Instant.parse(updatedAt),
        deletedAt = deletedAt?.let { Instant.parse(it) },
        syncVersion = syncVersion, isSynced = isSynced != 0L,
    )

    private fun parseTags(json: String): List<String> {
        val trimmed = json.trim()
        if (trimmed == "[]" || trimmed.isBlank()) return emptyList()
        return trimmed.removePrefix("[").removeSuffix("]")
            .split(",").map { it.trim().removeSurrounding("\"") }.filter { it.isNotBlank() }
    }

    fun serializeTags(tags: List<String>): String {
        if (tags.isEmpty()) return "[]"
        return tags.joinToString(",", "[", "]") { "\"$it\"" }
    }
}
