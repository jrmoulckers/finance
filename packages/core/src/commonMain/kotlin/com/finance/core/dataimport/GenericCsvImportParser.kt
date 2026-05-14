// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate

/**
 * Parses generic CSV rows into [ParsedTransaction]s using a [ColumnMapping] configuration.
 *
 * This parser handles the common bank export case: a flat CSV file with a header
 * row followed by data rows. It relies on [ColumnDetector] for auto-detection or
 * accepts user-supplied column mappings.
 *
 * Amount parsing is flexible — handles `$1,234.56`, `-500`, `(45.00)` (accounting
 * negative), and separate debit/credit columns.
 *
 * Date parsing supports common formats: `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`,
 * `M/D/YYYY`, and `YYYY/MM/DD`.
 */
object GenericCsvImportParser {

    /**
     * Parse a raw CSV string into an [ImportPreview].
     *
     * @param content Raw CSV content.
     * @param mappings Optional user-supplied column mappings; if null, auto-detection is used.
     * @param defaultCurrency Fallback currency for transactions without a currency column.
     * @return [ImportPreview] containing parsed transactions, errors, and diagnostics.
     */
    fun parse(
        content: String,
        mappings: List<ColumnMapping>? = null,
        defaultCurrency: Currency = Currency.USD,
    ): ImportPreview {
        val rows = CsvParser.parseRows(content)
        if (rows.isEmpty()) {
            return ImportPreview(
                transactions = emptyList(),
                errorRows = emptyList(),
                columnMappings = emptyList(),
                sourceFormat = ImportSourceFormat.GENERIC_CSV,
                totalRowCount = 0,
            )
        }

        val headers = rows.first()
        val effectiveMappings = mappings ?: ColumnDetector.detect(headers).mappings
        val roleIndex = buildRoleIndex(effectiveMappings)

        val transactions = mutableListOf<ParsedTransaction>()
        val errorRows = mutableListOf<ImportRowError>()

        for (rowIdx in 1 until rows.size) {
            val fields = rows[rowIdx]
            if (fields.all { it.isBlank() }) continue

            val rowNumber = rowIdx + 1 // 1-based including header
            val result = parseRow(fields, roleIndex, rowNumber, defaultCurrency)
            when (result) {
                is RowParseResult.Success -> transactions.add(result.transaction)
                is RowParseResult.Error -> errorRows.add(result.error)
            }
        }

        return ImportPreview(
            transactions = transactions,
            errorRows = errorRows,
            columnMappings = effectiveMappings,
            sourceFormat = ImportSourceFormat.GENERIC_CSV,
            totalRowCount = rows.size - 1, // exclude header
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Row parsing
    // ═════════════════════════════════════════════════════════════════

    private sealed class RowParseResult {
        data class Success(val transaction: ParsedTransaction) : RowParseResult()
        data class Error(val error: ImportRowError) : RowParseResult()
    }

    @Suppress("ReturnCount")
    private fun parseRow(
        fields: List<String>,
        roleIndex: Map<ColumnRole, Int>,
        rowNumber: Int,
        defaultCurrency: Currency,
    ): RowParseResult {
        val errors = mutableListOf<String>()

        val dateStr = getField(fields, roleIndex, ColumnRole.DATE)
        val amountStr = getField(fields, roleIndex, ColumnRole.AMOUNT)
        val description = getField(fields, roleIndex, ColumnRole.DESCRIPTION)

        if (dateStr.isNullOrBlank()) errors.add("Missing required field: date")
        if (amountStr.isNullOrBlank()) errors.add("Missing required field: amount")
        if (description.isNullOrBlank()) errors.add("Missing required field: description")

        if (errors.isNotEmpty()) {
            return RowParseResult.Error(ImportRowError(rowNumber, fields, errors))
        }

        val date = parseDate(dateStr!!)
        if (date == null) {
            errors.add("Cannot parse date: '$dateStr'")
            return RowParseResult.Error(ImportRowError(rowNumber, fields, errors))
        }

        val amount = parseAmount(amountStr!!)
        if (amount == null) {
            errors.add("Cannot parse amount: '$amountStr'")
            return RowParseResult.Error(ImportRowError(rowNumber, fields, errors))
        }

        val category = getField(fields, roleIndex, ColumnRole.CATEGORY)?.takeIf { it.isNotBlank() }
        val note = getField(fields, roleIndex, ColumnRole.NOTE)?.takeIf { it.isNotBlank() }
        val typeStr = getField(fields, roleIndex, ColumnRole.TYPE)?.takeIf { it.isNotBlank() }
        val currencyStr = getField(fields, roleIndex, ColumnRole.CURRENCY)?.takeIf { it.isNotBlank() }
        val account = getField(fields, roleIndex, ColumnRole.ACCOUNT)?.takeIf { it.isNotBlank() }
        val tagsStr = getField(fields, roleIndex, ColumnRole.TAGS)?.takeIf { it.isNotBlank() }

        val currency = if (currencyStr != null) {
            try {
                Currency(currencyStr.uppercase().trim())
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }

        val tags = tagsStr?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()

        return RowParseResult.Success(
            ParsedTransaction(
                date = date,
                amount = amount,
                description = description!!.trim(),
                category = category?.trim(),
                note = note?.trim(),
                type = typeStr?.trim(),
                currency = currency ?: defaultCurrency,
                account = account?.trim(),
                tags = tags,
                sourceRowNumber = rowNumber,
            ),
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Field access helpers
    // ═════════════════════════════════════════════════════════════════

    private fun buildRoleIndex(mappings: List<ColumnMapping>): Map<ColumnRole, Int> {
        val index = mutableMapOf<ColumnRole, Int>()
        mappings.forEachIndexed { i, mapping ->
            if (mapping.role != ColumnRole.IGNORED && mapping.role !in index) {
                index[mapping.role] = i
            }
        }
        return index
    }

    private fun getField(
        fields: List<String>,
        roleIndex: Map<ColumnRole, Int>,
        role: ColumnRole,
    ): String? {
        val idx = roleIndex[role] ?: return null
        return if (idx < fields.size) fields[idx] else null
    }

    // ═════════════════════════════════════════════════════════════════
    // Date parsing — multiplatform safe (no java.time)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parses a date string in common formats.
     *
     * Supported: `YYYY-MM-DD`, `MM/DD/YYYY`, `M/D/YYYY`, `DD/MM/YYYY`, `YYYY/MM/DD`.
     *
     * @return Parsed [LocalDate] or `null` if format is not recognised.
     */
    @Suppress("ReturnCount")
    internal fun parseDate(input: String): LocalDate? {
        val trimmed = input.trim()

        // ISO 8601: YYYY-MM-DD
        DATE_ISO.matchEntire(trimmed)?.let { match ->
            return tryLocalDate(
                match.groupValues[1].toInt(),
                match.groupValues[2].toInt(),
                match.groupValues[3].toInt(),
            )
        }

        // Slash-separated: determine order by heuristic
        DATE_SLASH.matchEntire(trimmed)?.let { match ->
            val a = match.groupValues[1].toInt()
            val b = match.groupValues[2].toInt()
            val c = match.groupValues[3].toInt()
            return resolveSlashDate(a, b, c)
        }

        return null
    }

    private val DATE_ISO = Regex("""(\d{4})-(\d{1,2})-(\d{1,2})""")
    private val DATE_SLASH = Regex("""(\d{1,4})/(\d{1,2})/(\d{2,4})""")

    @Suppress("ReturnCount")
    private fun resolveSlashDate(a: Int, b: Int, c: Int): LocalDate? {
        // YYYY/MM/DD
        if (a > 31) return tryLocalDate(a, b, c)
        // MM/DD/YYYY or DD/MM/YYYY — disambiguate by range
        val year = if (c > 31) c else 2000 + c
        // If b > 12 it must be DD, so a = month
        if (b > 12) return tryLocalDate(year, a, b)
        // If a > 12 it must be DD, so b = month
        if (a > 12) return tryLocalDate(year, b, a)
        // Default to MM/DD/YYYY (US convention)
        return tryLocalDate(year, a, b)
    }

    private fun tryLocalDate(year: Int, month: Int, day: Int): LocalDate? {
        return try {
            LocalDate(year, month, day)
        } catch (_: Exception) {
            null
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Amount parsing
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parses a monetary amount string into [Cents].
     *
     * Handles: `$1,234.56`, `-500`, `(45.00)` (accounting negative),
     * `1234`, `12.5`, currency symbols, and thousands separators.
     *
     * @return Parsed [Cents] or `null` if the string cannot be parsed.
     */
    @Suppress("ReturnCount")
    internal fun parseAmount(input: String): Cents? {
        var cleaned = input.trim()
        if (cleaned.isEmpty()) return null

        // Accounting-style negative: (123.45)
        val isAccountingNegative = cleaned.startsWith("(") && cleaned.endsWith(")")
        if (isAccountingNegative) {
            cleaned = cleaned.drop(1).dropLast(1)
        }

        // Strip currency symbols and whitespace
        cleaned = cleaned.replace(Regex("[^0-9.\\-+]"), "")
        if (cleaned.isEmpty()) return null

        val isNegative = isAccountingNegative || cleaned.startsWith("-")
        cleaned = cleaned.removePrefix("-").removePrefix("+")

        val value = cleaned.toDoubleOrNull() ?: return null
        val cents = (value * 100).toLong()
        return Cents(if (isNegative) -cents else cents)
    }
}
