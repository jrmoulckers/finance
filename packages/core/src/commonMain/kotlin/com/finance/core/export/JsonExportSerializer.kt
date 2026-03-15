// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Serializes [ExportData] into a pretty-printed JSON string.
 *
 * Produces a self-describing JSON document containing export metadata and all
 * financial entities. Sync-internal fields (`syncVersion`, `isSynced`) are
 * excluded by mapping domain models to private DTOs before serialization.
 *
 * Monetary values are represented as objects with three fields:
 * - `amount` — the raw value in minor currency units (e.g., cents).
 * - `display` — human-readable decimal string (e.g., `"12.50"`).
 * - `currency` — ISO 4217 currency code.
 *
 * Dates and timestamps are serialized as ISO 8601 strings.
 *
 * Example output structure:
 * ```json
 * {
 *   "export_version": "1.0",
 *   "metadata": { ... },
 *   "data": {
 *     "accounts": [ ... ],
 *     "transactions": [ ... ],
 *     "categories": [ ... ],
 *     "budgets": [ ... ],
 *     "goals": [ ... ]
 *   }
 * }
 * ```
 *
 * @see ExportSerializer
 * @see DataExportService
 */
class JsonExportSerializer : ExportSerializer {

    override val format: ExportFormat = ExportFormat.JSON

    /**
     * JSON encoder configured for human-readable export output.
     *
     * - Pretty-printed with 2-space indentation for readability.
     * - `encodeDefaults = true` ensures optional fields (nulls, empty lists)
     *   are always present so consumers can rely on a stable schema.
     */
    private val json = Json {
        prettyPrint = true
        prettyPrintIndent = "  "
        encodeDefaults = true
    }

    override fun serialize(data: ExportData, metadata: ExportMetadata): String {
        val envelope = ExportEnvelope(
            exportVersion = DataExportService.SCHEMA_VERSION,
            metadata = MetadataDto.from(metadata),
            data = ExportDataDto.from(data),
        )
        return json.encodeToString(envelope)
    }

    // ═════════════════════════════════════════════════════════════════
    // DTOs — private @Serializable classes that mirror domain models
    // minus sync-internal fields (syncVersion, isSynced).
    // ═════════════════════════════════════════════════════════════════

    /**
     * Top-level envelope for the JSON export.
     */
    @Serializable
    private data class ExportEnvelope(
        @SerialName("export_version") val exportVersion: String,
        val metadata: MetadataDto,
        val data: ExportDataDto,
    )

    /**
     * DTO for [ExportMetadata].
     */
    @Serializable
    private data class MetadataDto(
        @SerialName("export_date") val exportDate: String,
        @SerialName("app_version") val appVersion: String,
        @SerialName("schema_version") val schemaVersion: String,
        @SerialName("user_id_hash") val userIdHash: String,
        @SerialName("entity_counts") val entityCounts: EntityCountsDto,
    ) {
        companion object {
            fun from(metadata: ExportMetadata): MetadataDto = MetadataDto(
                exportDate = metadata.exportDate.toString(),
                appVersion = metadata.appVersion,
                schemaVersion = metadata.schemaVersion,
                userIdHash = metadata.userIdHash,
                entityCounts = EntityCountsDto(
                    accounts = metadata.entityCounts.accounts,
                    transactions = metadata.entityCounts.transactions,
                    categories = metadata.entityCounts.categories,
                    budgets = metadata.entityCounts.budgets,
                    goals = metadata.entityCounts.goals,
                ),
            )
        }
    }

    @Serializable
    private data class EntityCountsDto(
        val accounts: Int,
        val transactions: Int,
        val categories: Int,
        val budgets: Int,
        val goals: Int,
    )

    /**
     * DTO for the `"data"` section of the export.
     */
    @Serializable
    private data class ExportDataDto(
        val accounts: List<AccountDto>,
        val transactions: List<TransactionDto>,
        val categories: List<CategoryDto>,
        val budgets: List<BudgetDto>,
        val goals: List<GoalDto>,
    ) {
        companion object {
            fun from(data: ExportData): ExportDataDto = ExportDataDto(
                accounts = data.accounts.map { AccountDto.from(it) },
                transactions = data.transactions.map { TransactionDto.from(it) },
                categories = data.categories.map { CategoryDto.from(it) },
                budgets = data.budgets.map { BudgetDto.from(it) },
                goals = data.goals.map { GoalDto.from(it) },
            )
        }
    }

    // ── Monetary value DTO ───────────────────────────────────────────

    /**
     * Monetary value represented with raw cents, display string, and currency.
     *
     * Example: `{ "amount": 1250, "display": "12.50", "currency": "USD" }`
     */
    @Serializable
    private data class MoneyDto(
        val amount: Long,
        val display: String,
        val currency: String,
    ) {
        companion object {
            fun from(cents: Cents, currency: Currency): MoneyDto = MoneyDto(
                amount = cents.amount,
                display = formatCentsDisplay(cents, currency),
                currency = currency.code,
            )
        }
    }

    // ── Entity DTOs ──────────────────────────────────────────────────

    @Serializable
    private data class AccountDto(
        val id: String,
        @SerialName("household_id") val householdId: String,
        val name: String,
        val type: String,
        val currency: String,
        @SerialName("current_balance") val currentBalance: MoneyDto,
        @SerialName("is_archived") val isArchived: Boolean,
        @SerialName("sort_order") val sortOrder: Int,
        val icon: String?,
        val color: String?,
        @SerialName("created_at") val createdAt: String,
        @SerialName("updated_at") val updatedAt: String,
        @SerialName("deleted_at") val deletedAt: String?,
    ) {
        companion object {
            fun from(account: Account): AccountDto = AccountDto(
                id = account.id.value,
                householdId = account.householdId.value,
                name = account.name,
                type = account.type.name,
                currency = account.currency.code,
                currentBalance = MoneyDto.from(account.currentBalance, account.currency),
                isArchived = account.isArchived,
                sortOrder = account.sortOrder,
                icon = account.icon,
                color = account.color,
                createdAt = account.createdAt.toString(),
                updatedAt = account.updatedAt.toString(),
                deletedAt = account.deletedAt?.toString(),
            )
        }
    }

    @Serializable
    private data class TransactionDto(
        val id: String,
        @SerialName("household_id") val householdId: String,
        @SerialName("account_id") val accountId: String,
        @SerialName("category_id") val categoryId: String?,
        val type: String,
        val status: String,
        val amount: MoneyDto,
        val payee: String?,
        val note: String?,
        val date: String,
        @SerialName("transfer_account_id") val transferAccountId: String?,
        @SerialName("transfer_transaction_id") val transferTransactionId: String?,
        @SerialName("is_recurring") val isRecurring: Boolean,
        @SerialName("recurring_rule_id") val recurringRuleId: String?,
        val tags: List<String>,
        @SerialName("created_at") val createdAt: String,
        @SerialName("updated_at") val updatedAt: String,
        @SerialName("deleted_at") val deletedAt: String?,
    ) {
        companion object {
            fun from(transaction: Transaction): TransactionDto = TransactionDto(
                id = transaction.id.value,
                householdId = transaction.householdId.value,
                accountId = transaction.accountId.value,
                categoryId = transaction.categoryId?.value,
                type = transaction.type.name,
                status = transaction.status.name,
                amount = MoneyDto.from(transaction.amount, transaction.currency),
                payee = transaction.payee,
                note = transaction.note,
                date = transaction.date.toString(),
                transferAccountId = transaction.transferAccountId?.value,
                transferTransactionId = transaction.transferTransactionId?.value,
                isRecurring = transaction.isRecurring,
                recurringRuleId = transaction.recurringRuleId?.value,
                tags = transaction.tags,
                createdAt = transaction.createdAt.toString(),
                updatedAt = transaction.updatedAt.toString(),
                deletedAt = transaction.deletedAt?.toString(),
            )
        }
    }

    @Serializable
    private data class CategoryDto(
        val id: String,
        @SerialName("household_id") val householdId: String,
        val name: String,
        val icon: String?,
        val color: String?,
        @SerialName("parent_id") val parentId: String?,
        @SerialName("is_income") val isIncome: Boolean,
        @SerialName("is_system") val isSystem: Boolean,
        @SerialName("sort_order") val sortOrder: Int,
        @SerialName("created_at") val createdAt: String,
        @SerialName("updated_at") val updatedAt: String,
        @SerialName("deleted_at") val deletedAt: String?,
    ) {
        companion object {
            fun from(category: Category): CategoryDto = CategoryDto(
                id = category.id.value,
                householdId = category.householdId.value,
                name = category.name,
                icon = category.icon,
                color = category.color,
                parentId = category.parentId?.value,
                isIncome = category.isIncome,
                isSystem = category.isSystem,
                sortOrder = category.sortOrder,
                createdAt = category.createdAt.toString(),
                updatedAt = category.updatedAt.toString(),
                deletedAt = category.deletedAt?.toString(),
            )
        }
    }

    @Serializable
    private data class BudgetDto(
        val id: String,
        @SerialName("household_id") val householdId: String,
        @SerialName("category_id") val categoryId: String,
        val name: String,
        val amount: MoneyDto,
        val period: String,
        @SerialName("start_date") val startDate: String,
        @SerialName("end_date") val endDate: String?,
        @SerialName("is_rollover") val isRollover: Boolean,
        @SerialName("created_at") val createdAt: String,
        @SerialName("updated_at") val updatedAt: String,
        @SerialName("deleted_at") val deletedAt: String?,
    ) {
        companion object {
            fun from(budget: Budget): BudgetDto = BudgetDto(
                id = budget.id.value,
                householdId = budget.householdId.value,
                categoryId = budget.categoryId.value,
                name = budget.name,
                amount = MoneyDto.from(budget.amount, budget.currency),
                period = budget.period.name,
                startDate = budget.startDate.toString(),
                endDate = budget.endDate?.toString(),
                isRollover = budget.isRollover,
                createdAt = budget.createdAt.toString(),
                updatedAt = budget.updatedAt.toString(),
                deletedAt = budget.deletedAt?.toString(),
            )
        }
    }

    @Serializable
    private data class GoalDto(
        val id: String,
        @SerialName("household_id") val householdId: String,
        val name: String,
        @SerialName("target_amount") val targetAmount: MoneyDto,
        @SerialName("current_amount") val currentAmount: MoneyDto,
        @SerialName("target_date") val targetDate: String?,
        val status: String,
        val icon: String?,
        val color: String?,
        @SerialName("account_id") val accountId: String?,
        @SerialName("created_at") val createdAt: String,
        @SerialName("updated_at") val updatedAt: String,
        @SerialName("deleted_at") val deletedAt: String?,
    ) {
        companion object {
            fun from(goal: Goal): GoalDto = GoalDto(
                id = goal.id.value,
                householdId = goal.householdId.value,
                name = goal.name,
                targetAmount = MoneyDto.from(goal.targetAmount, goal.currency),
                currentAmount = MoneyDto.from(goal.currentAmount, goal.currency),
                targetDate = goal.targetDate?.toString(),
                status = goal.status.name,
                icon = goal.icon,
                color = goal.color,
                accountId = goal.accountId?.value,
                createdAt = goal.createdAt.toString(),
                updatedAt = goal.updatedAt.toString(),
                deletedAt = goal.deletedAt?.toString(),
            )
        }
    }
}

// ═════════════════════════════════════════════════════════════════════
// Shared formatting — used by both JSON and CSV serializers.
// ═════════════════════════════════════════════════════════════════════

/**
 * Formats a [Cents] value as a decimal display string using the currency's
 * [Currency.decimalPlaces].
 *
 * Examples:
 * - `Cents(1250)` with USD (2 decimals) → `"12.50"`
 * - `Cents(-350)` with USD (2 decimals) → `"-3.50"`
 * - `Cents(1000)` with JPY (0 decimals) → `"1000"`
 * - `Cents(12345)` with BHD (3 decimals) → `"12.345"`
 */
internal fun formatCentsDisplay(cents: Cents, currency: Currency): String {
    val decimals = currency.decimalPlaces
    if (decimals == 0) return cents.amount.toString()

    val isNegative = cents.amount < 0
    val absAmount = if (isNegative) -cents.amount else cents.amount
    var divisor = 1L
    repeat(decimals) { divisor *= 10 }
    val wholePart = absAmount / divisor
    val fractionalPart = absAmount % divisor

    val sign = if (isNegative) "-" else ""
    return "$sign$wholePart.${fractionalPart.toString().padStart(decimals, '0')}"
}
