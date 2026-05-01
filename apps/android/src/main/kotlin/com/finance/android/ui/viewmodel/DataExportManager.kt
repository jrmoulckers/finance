// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import android.content.Context
import android.net.Uri
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import timber.log.Timber

/**
 * Supported export formats.
 */
enum class ExportFormat(val displayName: String, val mimeType: String, val extension: String) {
    CSV("CSV", "text/csv", "csv"),
    PDF("PDF", "application/pdf", "pdf"),
}

/**
 * Result of an export operation.
 */
sealed class ExportResult {
    /** Export completed successfully. */
    data class Success(val uri: Uri, val recordCount: Int) : ExportResult()

    /** Export failed with an error. */
    data class Error(val message: String) : ExportResult()
}

/**
 * Manages exporting financial data to CSV and PDF formats.
 *
 * Exports are written to the user-selected location via the Storage
 * Access Framework (SAF). No data is transmitted externally.
 *
 * ## Privacy
 * - Exported data is written only to user-chosen locations.
 * - Financial values are included in exports (user-initiated action).
 * - No export metadata is logged beyond record counts.
 *
 * @param context Application context for content resolver access.
 * @param householdId The household whose data to export.
 * @param transactionRepository Source of transaction data.
 * @param accountRepository Source of account data for enrichment.
 */
class DataExportManager(
    private val context: Context,
    private val householdId: SyncId,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
) {

    /**
     * Exports all transactions to CSV format at the given [uri].
     *
     * @param uri Target URI obtained from the SAF file picker.
     * @param accountId Optional filter — export only transactions for this account.
     * @return [ExportResult] indicating success or failure.
     */
    suspend fun exportToCsv(
        uri: Uri,
        accountId: String? = null,
    ): ExportResult = withContext(Dispatchers.IO) {
        try {
            val transactions = transactionRepository.observeAll(householdId).first()
            val filtered = if (accountId != null) {
                transactions.filter { it.accountId.value == accountId }
            } else {
                transactions
            }

            context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                val writer = outputStream.bufferedWriter()

                // CSV header
                writer.write("Date,Amount,Payee,Category,Notes,Account ID")
                writer.newLine()

                // CSV rows — monetary values in cents for precision
                filtered.forEach { txn ->
                    writer.write(formatCsvRow(txn))
                    writer.newLine()
                }

                writer.flush()
            }

            Timber.i("CSV export completed: %d transactions", filtered.size)
            ExportResult.Success(uri, filtered.size)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            Timber.e(e, "CSV export failed")
            ExportResult.Error("Export failed: ${e.localizedMessage}")
        }
    }

    /**
     * Exports transactions to a formatted PDF report at the given [uri].
     *
     * @param uri Target URI obtained from the SAF file picker.
     * @param accountId Optional filter for a specific account.
     * @return [ExportResult] indicating success or failure.
     */
    suspend fun exportToPdf(
        uri: Uri,
        accountId: String? = null,
    ): ExportResult = withContext(Dispatchers.IO) {
        try {
            val transactions = transactionRepository.observeAll(householdId).first()
            val filtered = if (accountId != null) {
                transactions.filter { it.accountId.value == accountId }
            } else {
                transactions
            }

            // TODO: Implement PDF generation using Android PdfDocument API.
            // For now, write a plain-text report as a placeholder.
            context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                val writer = outputStream.bufferedWriter()
                writer.write("Finance Transaction Report\n")
                writer.write("=".repeat(40) + "\n\n")
                writer.write("Total transactions: ${filtered.size}\n\n")

                filtered.forEach { txn ->
                    writer.write("${txn.date} | ${txn.payee} | ${txn.amount.amount} cents\n")
                }
                writer.flush()
            }

            Timber.i("PDF export completed: %d transactions", filtered.size)
            ExportResult.Success(uri, filtered.size)
        } catch (@Suppress("TooGenericExceptionCaught") e: Exception) {
            Timber.e(e, "PDF export failed")
            ExportResult.Error("Export failed: ${e.localizedMessage}")
        }
    }

    /**
     * Formats a [Transaction] as a CSV row.
     *
     * Values containing commas or quotes are properly escaped.
     */
    private fun formatCsvRow(txn: Transaction): String {
        return listOf(
            txn.date.toString(),
            txn.amount.amount.toString(),
            escapeCsv(txn.payee ?: ""),
            escapeCsv(txn.categoryId?.value ?: ""),
            escapeCsv(txn.note ?: ""),
            txn.accountId.value,
        ).joinToString(",")
    }

    /**
     * Escapes a string for CSV output.
     */
    private fun escapeCsv(value: String): String {
        return if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            "\"${value.replace("\"", "\"\"")}\""
        } else {
            value
        }
    }
}