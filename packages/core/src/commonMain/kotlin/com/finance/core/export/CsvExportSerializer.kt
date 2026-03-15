// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId

/**
 * Serializes [ExportData] into a concatenated multi-section CSV string.
 *
 * Each entity type is written as a separate section with a header comment
 * (e.g., `# ACCOUNTS`) followed by RFC 4180-compliant column headers and
 * data rows. Sections are separated by blank lines. A metadata section
 * precedes the entity data.
 *
 * RFC 4180 compliance:
 * - CRLF (`\r\n`) line endings throughout.
 * - Fields containing commas, double-quotes, or newlines are enclosed in
 *   double-quotes.
 * - Double-quote characters within a field are escaped by doubling them
 *   (`"` → `""`).
 *
 * Sync-internal fields (`syncVersion`, `isSynced`) are excluded from output.
 * Monetary [Cents] values are formatted as decimal strings using the currency's
 * [Currency.decimalPlaces] (e.g., `1250` → `"12.50"` for USD).
 * Tags lists are serialized as semicolon-separated values within a single field.
 * Dates and timestamps are ISO 8601 strings.
 *
 * @see ExportSerializer
 * @see DataExportService
 */
class CsvExportSerializer : ExportSerializer {

    override val format: ExportFormat = ExportFormat.CSV

    override fun serialize(data: ExportData, metadata: ExportMetadata): String {
        val sb = StringBuilder()

        // ── Metadata section ─────────────────────────────────────────
        appendMetadataSection(sb, metadata)

        // ── Entity sections ──────────────────────────────────────────
        appendAccountsSection(sb, data.accounts)
        appendTransactionsSection(sb, data.transactions)
        appendCategoriesSection(sb, data.categories)
        appendBudgetsSection(sb, data.budgets)
        appendGoalsSection(sb, data.goals)

        return sb.toString()
    }

    // ═════════════════════════════════════════════════════════════════
    // Section builders
    // ═════════════════════════════════════════════════════════════════

    private fun appendMetadataSection(sb: StringBuilder, metadata: ExportMetadata) {
        sb.appendLine("# METADATA")
        sb.appendRow("key", "value")
        sb.appendRow("export_date", metadata.exportDate.toString())
        sb.appendRow("app_version", metadata.appVersion)
        sb.appendRow("schema_version", metadata.schemaVersion)
        sb.appendRow("user_id_hash", metadata.userIdHash)
        sb.appendRow("accounts_count", metadata.entityCounts.accounts.toString())
        sb.appendRow("transactions_count", metadata.entityCounts.transactions.toString())
        sb.appendRow("categories_count", metadata.entityCounts.categories.toString())
        sb.appendRow("budgets_count", metadata.entityCounts.budgets.toString())
        sb.appendRow("goals_count", metadata.entityCounts.goals.toString())
        sb.appendCrlf()
    }

    private fun appendAccountsSection(sb: StringBuilder, accounts: List<Account>) {
        sb.appendLine("# ACCOUNTS")
        val headers = listOf(
            "id", "household_id", "name", "type", "currency",
            "current_balance", "is_archived", "sort_order",
            "icon", "color", "created_at", "updated_at", "deleted_at",
        )
        sb.appendRow(*headers.toTypedArray())
        for (account in accounts) {
            sb.appendRow(
                account.id.value,
                account.householdId.value,
                account.name,
                account.type.name,
                account.currency.code,
                formatCentsDisplay(account.currentBalance, account.currency),
                account.isArchived.toString(),
                account.sortOrder.toString(),
                account.icon ?: "",
                account.color ?: "",
                account.createdAt.toString(),
                account.updatedAt.toString(),
                account.deletedAt?.toString() ?: "",
            )
        }
        sb.appendCrlf()
    }

    private fun appendTransactionsSection(sb: StringBuilder, transactions: List<Transaction>) {
        sb.appendLine("# TRANSACTIONS")
        val headers = listOf(
            "id", "household_id", "account_id", "category_id",
            "type", "status", "amount", "currency",
            "payee", "note", "date",
            "transfer_account_id", "transfer_transaction_id",
            "is_recurring", "recurring_rule_id", "tags",
            "created_at", "updated_at", "deleted_at",
        )
        sb.appendRow(*headers.toTypedArray())
        for (txn in transactions) {
            sb.appendRow(
                txn.id.value,
                txn.householdId.value,
                txn.accountId.value,
                txn.categoryId?.value ?: "",
                txn.type.name,
                txn.status.name,
                formatCentsDisplay(txn.amount, txn.currency),
                txn.currency.code,
                txn.payee ?: "",
                txn.note ?: "",
                txn.date.toString(),
                txn.transferAccountId?.value ?: "",
                txn.transferTransactionId?.value ?: "",
                txn.isRecurring.toString(),
                txn.recurringRuleId?.value ?: "",
                txn.tags.joinToString(";"),
                txn.createdAt.toString(),
                txn.updatedAt.toString(),
                txn.deletedAt?.toString() ?: "",
            )
        }
        sb.appendCrlf()
    }

    private fun appendCategoriesSection(sb: StringBuilder, categories: List<Category>) {
        sb.appendLine("# CATEGORIES")
        val headers = listOf(
            "id", "household_id", "name", "icon", "color",
            "parent_id", "is_income", "is_system", "sort_order",
            "created_at", "updated_at", "deleted_at",
        )
        sb.appendRow(*headers.toTypedArray())
        for (category in categories) {
            sb.appendRow(
                category.id.value,
                category.householdId.value,
                category.name,
                category.icon ?: "",
                category.color ?: "",
                category.parentId?.value ?: "",
                category.isIncome.toString(),
                category.isSystem.toString(),
                category.sortOrder.toString(),
                category.createdAt.toString(),
                category.updatedAt.toString(),
                category.deletedAt?.toString() ?: "",
            )
        }
        sb.appendCrlf()
    }

    private fun appendBudgetsSection(sb: StringBuilder, budgets: List<Budget>) {
        sb.appendLine("# BUDGETS")
        val headers = listOf(
            "id", "household_id", "category_id", "name",
            "amount", "currency", "period",
            "start_date", "end_date", "is_rollover",
            "created_at", "updated_at", "deleted_at",
        )
        sb.appendRow(*headers.toTypedArray())
        for (budget in budgets) {
            sb.appendRow(
                budget.id.value,
                budget.householdId.value,
                budget.categoryId.value,
                budget.name,
                formatCentsDisplay(budget.amount, budget.currency),
                budget.currency.code,
                budget.period.name,
                budget.startDate.toString(),
                budget.endDate?.toString() ?: "",
                budget.isRollover.toString(),
                budget.createdAt.toString(),
                budget.updatedAt.toString(),
                budget.deletedAt?.toString() ?: "",
            )
        }
        sb.appendCrlf()
    }

    private fun appendGoalsSection(sb: StringBuilder, goals: List<Goal>) {
        sb.appendLine("# GOALS")
        val headers = listOf(
            "id", "household_id", "name",
            "target_amount", "current_amount", "currency",
            "target_date", "status", "icon", "color", "account_id",
            "created_at", "updated_at", "deleted_at",
        )
        sb.appendRow(*headers.toTypedArray())
        for (goal in goals) {
            sb.appendRow(
                goal.id.value,
                goal.householdId.value,
                goal.name,
                formatCentsDisplay(goal.targetAmount, goal.currency),
                formatCentsDisplay(goal.currentAmount, goal.currency),
                goal.currency.code,
                goal.targetDate?.toString() ?: "",
                goal.status.name,
                goal.icon ?: "",
                goal.color ?: "",
                goal.accountId?.value ?: "",
                goal.createdAt.toString(),
                goal.updatedAt.toString(),
                goal.deletedAt?.toString() ?: "",
            )
        }
        sb.appendCrlf()
    }

    // ═════════════════════════════════════════════════════════════════
    // RFC 4180 formatting helpers
    // ═════════════════════════════════════════════════════════════════

    /**
     * Appends a comment/section-header line with CRLF ending.
     *
     * Comment lines (starting with `#`) are outside the RFC 4180 spec but are
     * a widely-supported convention for multi-section CSV files.
     */
    private fun StringBuilder.appendLine(line: String) {
        append(line)
        append(CRLF)
    }

    /** Appends a bare CRLF (blank line separator between sections). */
    private fun StringBuilder.appendCrlf() {
        append(CRLF)
    }

    /**
     * Appends a single CSV row with proper RFC 4180 escaping.
     *
     * Each field is escaped individually, fields are joined with commas,
     * and the row is terminated with CRLF.
     */
    private fun StringBuilder.appendRow(vararg fields: String) {
        append(fields.joinToString(",") { escapeField(it) })
        append(CRLF)
    }

    companion object {
        /** RFC 4180 line terminator. */
        private const val CRLF = "\r\n"

        /**
         * Escapes a single CSV field per RFC 4180.
         *
         * A field must be enclosed in double-quotes if it contains:
         * - A comma (`,`)
         * - A double-quote (`"`)
         * - A newline (`\n` or `\r`)
         *
         * Any double-quote characters inside the field are doubled (`"` → `""`).
         */
        internal fun escapeField(field: String): String {
            val needsQuoting = field.contains(',') ||
                field.contains('"') ||
                field.contains('\n') ||
                field.contains('\r')
            return if (needsQuoting) {
                "\"${field.replace("\"", "\"\"")}\""
            } else {
                field
            }
        }
    }
}
