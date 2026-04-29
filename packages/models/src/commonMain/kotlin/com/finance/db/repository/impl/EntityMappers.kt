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

    fun mapAccount(
        id: String, household_id: String, owner_id: String, name: String,
        type: String, currency: String, current_balance: Long, is_archived: Long,
        sort_order: Long, icon: String?, color: String?, created_at: String,
        updated_at: String, deleted_at: String?, sync_version: Long, is_synced: Long,
    ): Account = Account(
        id = SyncId(id), householdId = SyncId(household_id), ownerId = SyncId(owner_id),
        name = name, type = AccountType.valueOf(type), currency = Currency(currency),
        currentBalance = Cents(current_balance), isArchived = is_archived != 0L,
        sortOrder = sort_order.toInt(), icon = icon, color = color,
        createdAt = Instant.parse(created_at), updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version, isSynced = is_synced != 0L,
    )

    fun mapTransaction(
        id: String, household_id: String, owner_id: String, account_id: String,
        category_id: String?, type: String, status: String, amount: Long,
        currency: String, payee: String?, note: String?, date: String,
        transfer_account_id: String?, transfer_transaction_id: String?,
        is_recurring: Long, recurring_rule_id: String?, tags: String,
        created_at: String, updated_at: String, deleted_at: String?,
        sync_version: Long, is_synced: Long,
    ): Transaction = Transaction(
        id = SyncId(id), householdId = SyncId(household_id), ownerId = SyncId(owner_id),
        accountId = SyncId(account_id), categoryId = category_id?.let { SyncId(it) },
        type = TransactionType.valueOf(type), status = TransactionStatus.valueOf(status),
        amount = Cents(amount), currency = Currency(currency), payee = payee, note = note,
        date = LocalDate.parse(date),
        transferAccountId = transfer_account_id?.let { SyncId(it) },
        transferTransactionId = transfer_transaction_id?.let { SyncId(it) },
        isRecurring = is_recurring != 0L, recurringRuleId = recurring_rule_id?.let { SyncId(it) },
        tags = parseTags(tags), createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at), deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version, isSynced = is_synced != 0L,
    )

    fun mapBudget(
        id: String, household_id: String, owner_id: String, category_id: String,
        name: String, amount: Long, currency: String, period: String,
        start_date: String, end_date: String?, is_rollover: Long,
        created_at: String, updated_at: String, deleted_at: String?,
        sync_version: Long, is_synced: Long,
    ): Budget = Budget(
        id = SyncId(id), householdId = SyncId(household_id), ownerId = SyncId(owner_id),
        categoryId = SyncId(category_id), name = name, amount = Cents(amount),
        currency = Currency(currency), period = BudgetPeriod.valueOf(period),
        startDate = LocalDate.parse(start_date), endDate = end_date?.let { LocalDate.parse(it) },
        isRollover = is_rollover != 0L, createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at), deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version, isSynced = is_synced != 0L,
    )

    fun mapGoal(
        id: String, household_id: String, owner_id: String, name: String,
        target_amount: Long, current_amount: Long, currency: String,
        target_date: String?, status: String, icon: String?, color: String?,
        account_id: String?, created_at: String, updated_at: String,
        deleted_at: String?, sync_version: Long, is_synced: Long,
    ): Goal = Goal(
        id = SyncId(id), householdId = SyncId(household_id), ownerId = SyncId(owner_id),
        name = name, targetAmount = Cents(target_amount), currentAmount = Cents(current_amount),
        currency = Currency(currency), targetDate = target_date?.let { LocalDate.parse(it) },
        status = GoalStatus.valueOf(status), icon = icon, color = color,
        accountId = account_id?.let { SyncId(it) }, createdAt = Instant.parse(created_at),
        updatedAt = Instant.parse(updated_at), deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version, isSynced = is_synced != 0L,
    )

    fun mapCategory(
        id: String, household_id: String, owner_id: String, name: String,
        icon: String?, color: String?, parent_id: String?, is_income: Long,
        is_system: Long, sort_order: Long, created_at: String, updated_at: String,
        deleted_at: String?, sync_version: Long, is_synced: Long,
    ): Category = Category(
        id = SyncId(id), householdId = SyncId(household_id), ownerId = SyncId(owner_id),
        name = name, icon = icon, color = color, parentId = parent_id?.let { SyncId(it) },
        isIncome = is_income != 0L, isSystem = is_system != 0L, sortOrder = sort_order.toInt(),
        createdAt = Instant.parse(created_at), updatedAt = Instant.parse(updated_at),
        deletedAt = deleted_at?.let { Instant.parse(it) },
        syncVersion = sync_version, isSynced = is_synced != 0L,
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
