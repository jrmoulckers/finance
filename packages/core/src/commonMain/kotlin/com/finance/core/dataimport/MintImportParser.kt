// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate

/**
 * Parses Mint export CSV files into [ParsedTransaction]s.
 *
 * Mint exports have a fixed column layout:
 * `Date, Description, Original Description, Amount, Transaction Type, Category, Account Name, Labels, Notes`
 *
 * Key Mint-specific behaviours:
 * - Amounts are always positive; the `Transaction Type` column indicates debit/credit.
 * - Categories use Mint's own taxonomy (e.g., "Fast Food", "Mortgage & Rent").
 * - `Labels` are Mint's tagging system.
 * - Dates are in `MM/DD/YYYY` format.
 *
 * @see ImportSourceFormat.MINT
 */
object MintImportParser {

    /** Expected Mint column headers (lowercased for matching). */
    private val EXPECTED_HEADERS = listOf(
        "date", "description", "original description", "amount",
        "transaction type", "category", "account name", "labels", "notes",
    )

    /**
     * Detects whether the given CSV headers match the Mint export format.
     *
     * @param headers The header row from the CSV file.
     * @return `true` if at least 5 of the 9 expected Mint columns are present.
     */
    fun detect(headers: List<String>): Boolean {
        val normalised = headers.map { it.trim().lowercase() }
        val matchCount = EXPECTED_HEADERS.count { it in normalised }
        return matchCount >= 5
    }

    /**
     * Parse a Mint CSV export into an [ImportPreview].
     *
     * @param content Raw CSV content from a Mint export file.
     * @param defaultCurrency Fallback currency (Mint exports are typically USD).
     * @return [ImportPreview] with parsed transactions and error diagnostics.
     */
    fun parse(
        content: String,
        defaultCurrency: Currency = Currency.USD,
    ): ImportPreview {
        val rows = CsvParser.parseRows(content)
        if (rows.isEmpty()) {
            return emptyPreview(ImportSourceFormat.MINT)
        }

        val headers = rows.first().map { it.trim().lowercase() }
        val colIndex = buildColumnIndex(headers)

        val transactions = mutableListOf<ParsedTransaction>()
        val errorRows = mutableListOf<ImportRowError>()

        for (rowIdx in 1 until rows.size) {
            val fields = rows[rowIdx]
            if (fields.all { it.isBlank() }) continue

            val rowNumber = rowIdx + 1
            val result = parseRow(fields, colIndex, rowNumber, defaultCurrency)
            when (result) {
                is RowResult.Ok -> transactions.add(result.tx)
                is RowResult.Err -> errorRows.add(result.error)
            }
        }

        return ImportPreview(
            transactions = transactions,
            errorRows = errorRows,
            columnMappings = buildMintMappings(rows.first()),
            sourceFormat = ImportSourceFormat.MINT,
            totalRowCount = rows.size - 1,
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Internal parsing
    // ═════════════════════════════════════════════════════════════════

    private sealed class RowResult {
        data class Ok(val tx: ParsedTransaction) : RowResult()
        data class Err(val error: ImportRowError) : RowResult()
    }

    private fun parseRow(
        fields: List<String>,
        colIndex: Map<String, Int>,
        rowNumber: Int,
        defaultCurrency: Currency,
    ): RowResult {
        val errors = mutableListOf<String>()

        val dateStr = getCol(fields, colIndex, "date")
        val description = getCol(fields, colIndex, "description")
        val amountStr = getCol(fields, colIndex, "amount")
        val transactionType = getCol(fields, colIndex, "transaction type")

        if (dateStr.isNullOrBlank()) errors.add("Missing date")
        if (description.isNullOrBlank()) errors.add("Missing description")
        if (amountStr.isNullOrBlank()) errors.add("Missing amount")

        if (errors.isNotEmpty()) {
            return RowResult.Err(ImportRowError(rowNumber, fields, errors))
        }

        val date = GenericCsvImportParser.parseDate(dateStr!!)
        if (date == null) {
            return RowResult.Err(ImportRowError(rowNumber, fields, listOf("Cannot parse date: '$dateStr'")))
        }

        val rawAmount = GenericCsvImportParser.parseAmount(amountStr!!)
        if (rawAmount == null) {
            return RowResult.Err(ImportRowError(rowNumber, fields, listOf("Cannot parse amount: '$amountStr'")))
        }

        // Mint: amounts are positive; "debit" means expense (negative)
        val isDebit = transactionType?.trim()?.lowercase() == "debit"
        val amount = if (isDebit && rawAmount.isPositive()) -rawAmount else rawAmount

        val category = getCol(fields, colIndex, "category")?.takeIf { it.isNotBlank() }
        val originalDescription = getCol(fields, colIndex, "original description")?.takeIf { it.isNotBlank() }
        val accountName = getCol(fields, colIndex, "account name")?.takeIf { it.isNotBlank() }
        val labels = getCol(fields, colIndex, "labels")?.takeIf { it.isNotBlank() }
        val notes = getCol(fields, colIndex, "notes")?.takeIf { it.isNotBlank() }

        val tags = labels?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
        val note = listOfNotNull(originalDescription, notes).joinToString(" | ").takeIf { it.isNotEmpty() }

        return RowResult.Ok(
            ParsedTransaction(
                date = date,
                amount = amount,
                description = description!!.trim(),
                category = category?.trim(),
                note = note,
                type = transactionType?.trim(),
                currency = defaultCurrency,
                account = accountName?.trim(),
                tags = tags,
                sourceRowNumber = rowNumber,
            ),
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════════════════

    private fun buildColumnIndex(headers: List<String>): Map<String, Int> {
        return headers.mapIndexed { index, header -> header to index }.toMap()
    }

    private fun getCol(fields: List<String>, colIndex: Map<String, Int>, header: String): String? {
        val idx = colIndex[header] ?: return null
        return if (idx < fields.size) fields[idx] else null
    }

    private fun buildMintMappings(headers: List<String>): List<ColumnMapping> {
        return headers.map { header ->
            val role = when (header.trim().lowercase()) {
                "date" -> ColumnRole.DATE
                "description" -> ColumnRole.DESCRIPTION
                "original description" -> ColumnRole.NOTE
                "amount" -> ColumnRole.AMOUNT
                "transaction type" -> ColumnRole.TYPE
                "category" -> ColumnRole.CATEGORY
                "account name" -> ColumnRole.ACCOUNT
                "labels" -> ColumnRole.TAGS
                "notes" -> ColumnRole.NOTE
                else -> ColumnRole.IGNORED
            }
            ColumnMapping(header, role, if (role == ColumnRole.IGNORED) 0.0 else 1.0)
        }
    }

    private fun emptyPreview(format: ImportSourceFormat) = ImportPreview(
        transactions = emptyList(),
        errorRows = emptyList(),
        columnMappings = emptyList(),
        sourceFormat = format,
        totalRowCount = 0,
    )
}
