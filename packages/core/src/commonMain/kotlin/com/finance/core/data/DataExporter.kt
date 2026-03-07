package com.finance.core.data

import com.finance.models.*
import com.finance.models.types.Cents
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Exports financial data to JSON and CSV formats.
 *
 * Supports:
 * - **CSV** — flat transaction list for spreadsheet consumption.
 * - **JSON** — machine-readable transaction list.
 * - **Full backup** — GDPR-compliant JSON archive of all user data.
 *
 * **Design rules applied:**
 * - Monetary values as [Cents] (Long) — the JSON output includes both
 *   the raw `amountCents` and a human-friendly `amountFormatted` field.
 * - Uses kotlinx-serialization — no platform-specific JSON libraries.
 * - Pure functions with no side effects; the caller is responsible for
 *   writing the returned [String] to disk/network.
 */
object DataExporter {

    private val exportJson = Json {
        prettyPrint = true
        encodeDefaults = true
    }

    // ── Transaction → JSON ────────────────────────────────────────────

    /**
     * Serialize a list of transactions to a pretty-printed JSON string.
     */
    fun exportTransactionsJson(transactions: List<Transaction>): String {
        val dtos = transactions.map { it.toExportDto() }
        return exportJson.encodeToString(dtos)
    }

    // ── Transaction → CSV ─────────────────────────────────────────────

    /**
     * Serialize a list of transactions to a CSV string (with header row).
     *
     * Columns: Date, Type, Amount, Currency, Payee, Category ID, Note, Status, Account ID
     */
    fun exportTransactionsCsv(transactions: List<Transaction>): String {
        val sb = StringBuilder()
        sb.appendLine("Date,Type,Amount,Currency,Payee,CategoryId,Note,Status,AccountId")
        for (txn in transactions) {
            sb.appendLine(
                listOf(
                    txn.date.toString(),
                    txn.type.name,
                    formatCentsForCsv(txn.amount),
                    txn.currency.code,
                    escapeCsvField(txn.payee.orEmpty()),
                    txn.categoryId?.value.orEmpty(),
                    escapeCsvField(txn.note.orEmpty()),
                    txn.status.name,
                    txn.accountId.value,
                ).joinToString(",")
            )
        }
        return sb.toString()
    }

    // ── Full Backup (GDPR) ────────────────────────────────────────────

    /**
     * Produce a complete JSON backup of all user-owned financial data.
     *
     * This is the GDPR "data portability" export: it contains every entity
     * in a single self-describing JSON document with a schema version so
     * future importers can handle format evolution.
     */
    fun exportFullBackup(
        accounts: List<Account>,
        transactions: List<Transaction>,
        budgets: List<Budget>,
        goals: List<Goal>,
        categories: List<Category>,
    ): String {
        val backup = FullBackup(
            schemaVersion = BACKUP_SCHEMA_VERSION,
            exportedAt = kotlinx.datetime.Clock.System.now().toString(),
            accounts = accounts,
            transactions = transactions,
            budgets = budgets,
            goals = goals,
            categories = categories,
            counts = BackupCounts(
                accounts = accounts.size,
                transactions = transactions.size,
                budgets = budgets.size,
                goals = goals.size,
                categories = categories.size,
            ),
        )
        return exportJson.encodeToString(backup)
    }

    // ── DTOs ──────────────────────────────────────────────────────────

    /**
     * Lightweight export DTO — includes a formatted dollar string
     * alongside the canonical cents value for human readability.
     */
    @Serializable
    internal data class TransactionExportDto(
        val id: String,
        val date: String,
        val type: TransactionType,
        val status: TransactionStatus,
        val amountCents: Long,
        val amountFormatted: String,
        val currency: String,
        val payee: String?,
        val categoryId: String?,
        val note: String?,
        val accountId: String,
        val tags: List<String>,
    )

    @Serializable
    internal data class FullBackup(
        val schemaVersion: Int,
        val exportedAt: String,
        val accounts: List<Account>,
        val transactions: List<Transaction>,
        val budgets: List<Budget>,
        val goals: List<Goal>,
        val categories: List<Category>,
        val counts: BackupCounts,
    )

    @Serializable
    internal data class BackupCounts(
        val accounts: Int,
        val transactions: Int,
        val budgets: Int,
        val goals: Int,
        val categories: Int,
    )

    // ── Helpers ───────────────────────────────────────────────────────

    private fun Transaction.toExportDto() = TransactionExportDto(
        id = id.value,
        date = date.toString(),
        type = type,
        status = status,
        amountCents = amount.amount,
        amountFormatted = formatCents(amount),
        currency = currency.code,
        payee = payee,
        categoryId = categoryId?.value,
        note = note,
        accountId = accountId.value,
        tags = tags,
    )

    /**
     * Format [Cents] as a signed decimal string (e.g. `12.34`, `-5.00`).
     */
    internal fun formatCents(cents: Cents): String {
        val whole = cents.amount / 100
        val frac = kotlin.math.abs(cents.amount % 100)
        return "$whole.${frac.toString().padStart(2, '0')}"
    }

    /**
     * Format [Cents] for CSV: always uses dot as decimal separator,
     * no currency symbol.
     */
    private fun formatCentsForCsv(cents: Cents): String = formatCents(cents)

    /**
     * Escape a CSV field value: wrap in double-quotes if it contains
     * a comma, quote, or newline, and double any internal quotes.
     */
    internal fun escapeCsvField(value: String): String {
        return if (value.contains(',') || value.contains('"') || value.contains('\n')) {
            "\"${value.replace("\"", "\"\"")}\""
        } else {
            value
        }
    }

    private const val BACKUP_SCHEMA_VERSION = 1
}
