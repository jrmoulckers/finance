// SPDX-License-Identifier: BUSL-1.1

@file:Suppress("TooGenericExceptionCaught", "SwallowedException")

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Parses YNAB export files into [ParsedTransaction]s.
 *
 * Supports two YNAB formats:
 *
 * ## YNAB4 (legacy) — CSV
 * Columns: `Account, Flag, Date, Payee, Category Group/Category, Master Category, Sub Category, Memo, Outflow, Inflow, Cleared`
 * - Dates in `MM/DD/YYYY` format.
 * - Separate `Outflow`/`Inflow` columns (always positive values).
 *
 * ## nYNAB (new) — CSV
 * Columns: `Account, Flag, Date, Payee, Category Group/Category, Category Group, Category, Memo, Outflow, Inflow, Cleared`
 * - Dates in `MM/DD/YYYY` format.
 * - Same outflow/inflow split as YNAB4.
 *
 * ## nYNAB — JSON (budget export)
 * JSON structure with `transactions` array containing objects with
 * `date`, `amount`, `payee_name`, `category_name`, `memo`, `account_name`, `cleared`.
 * Amounts are in milliunits (1000 = $1.00).
 *
 * @see ImportSourceFormat.YNAB4
 * @see ImportSourceFormat.NYNAB
 */
object YnabImportParser {

    // ═════════════════════════════════════════════════════════════════
    // Format detection
    // ═════════════════════════════════════════════════════════════════

    /** YNAB4 expected column headers (lowercased). */
    private val YNAB4_HEADERS = listOf("date", "payee", "outflow", "inflow")

    /** nYNAB JSON key present in budget exports. */
    private const val NYNAB_JSON_KEY = "transactions"

    /**
     * Detects whether the given CSV headers match YNAB4 or nYNAB CSV format.
     *
     * @param headers The header row from the CSV file.
     * @return `true` if headers contain the core YNAB columns.
     */
    fun detectCsv(headers: List<String>): Boolean {
        val normalised = headers.map { it.trim().lowercase() }
        return YNAB4_HEADERS.all { it in normalised }
    }

    /**
     * Detects whether the given content is a nYNAB JSON budget export.
     *
     * @param content Raw file content.
     * @return `true` if the content is valid JSON with a `transactions` key.
     */
    fun detectJson(content: String): Boolean {
        return try {
            val json = Json.parseToJsonElement(content.trim())
            json is JsonObject && NYNAB_JSON_KEY in json
        } catch (_: Exception) {
            false
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // CSV parsing (YNAB4 and nYNAB)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parse a YNAB CSV export (YNAB4 or nYNAB) into an [ImportPreview].
     *
     * @param content Raw CSV content.
     * @param defaultCurrency Fallback currency (YNAB exports don't include currency).
     * @return [ImportPreview] with parsed transactions and error diagnostics.
     */
    fun parseCsv(
        content: String,
        defaultCurrency: Currency = Currency.USD,
    ): ImportPreview {
        val rows = CsvParser.parseRows(content)
        if (rows.isEmpty()) return emptyPreview()

        val headers = rows.first().map { it.trim().lowercase() }
        val colIndex = headers.mapIndexed { idx, h -> h to idx }.toMap()

        // Detect YNAB4 vs nYNAB by presence of "category group" vs "master category"
        val isYnab4 = "master category" in headers || "sub category" in headers
        val format = if (isYnab4) ImportSourceFormat.YNAB4 else ImportSourceFormat.NYNAB

        val transactions = mutableListOf<ParsedTransaction>()
        val errorRows = mutableListOf<ImportRowError>()

        for (rowIdx in 1 until rows.size) {
            val fields = rows[rowIdx]
            if (fields.all { it.isBlank() }) continue

            val rowNumber = rowIdx + 1
            val result = parseYnabCsvRow(fields, colIndex, headers, rowNumber, defaultCurrency)
            when (result) {
                is RowResult.Ok -> transactions.add(result.tx)
                is RowResult.Err -> errorRows.add(result.error)
            }
        }

        return ImportPreview(
            transactions = transactions,
            errorRows = errorRows,
            columnMappings = buildYnabMappings(rows.first()),
            sourceFormat = format,
            totalRowCount = rows.size - 1,
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // JSON parsing (nYNAB budget export)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parse a nYNAB JSON budget export into an [ImportPreview].
     *
     * @param content Raw JSON content.
     * @param defaultCurrency Fallback currency.
     * @return [ImportPreview] with parsed transactions and error diagnostics.
     */
    @Suppress("ReturnCount")
    fun parseJson(
        content: String,
        defaultCurrency: Currency = Currency.USD,
    ): ImportPreview {
        val jsonElement: JsonElement
        try {
            jsonElement = Json.parseToJsonElement(content.trim())
        } catch (e: Exception) {
            return emptyPreview()
        }

        val root = jsonElement as? JsonObject ?: return emptyPreview()
        val txArray = root[NYNAB_JSON_KEY] as? JsonArray ?: return emptyPreview()

        val transactions = mutableListOf<ParsedTransaction>()
        val errorRows = mutableListOf<ImportRowError>()

        for ((idx, element) in txArray.withIndex()) {
            val rowNumber = idx + 1
            val obj = element as? JsonObject
            if (obj == null) {
                errorRows.add(ImportRowError(rowNumber, listOf(element.toString()), listOf("Not a JSON object")))
                continue
            }
            val result = parseYnabJsonTransaction(obj, rowNumber, defaultCurrency)
            when (result) {
                is RowResult.Ok -> transactions.add(result.tx)
                is RowResult.Err -> errorRows.add(result.error)
            }
        }

        return ImportPreview(
            transactions = transactions,
            errorRows = errorRows,
            columnMappings = emptyList(),
            sourceFormat = ImportSourceFormat.NYNAB,
            totalRowCount = txArray.size,
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Internal helpers
    // ═════════════════════════════════════════════════════════════════

    private sealed class RowResult {
        data class Ok(val tx: ParsedTransaction) : RowResult()
        data class Err(val error: ImportRowError) : RowResult()
    }

    @Suppress("ReturnCount", "UnusedParameter")
    private fun parseYnabCsvRow(
        fields: List<String>,
        colIndex: Map<String, Int>,
        headers: List<String>,
        rowNumber: Int,
        defaultCurrency: Currency,
    ): RowResult {
        val errors = mutableListOf<String>()

        val dateStr = getCol(fields, colIndex, "date")
        val payee = getCol(fields, colIndex, "payee")
        val outflowStr = getCol(fields, colIndex, "outflow")
        val inflowStr = getCol(fields, colIndex, "inflow")

        if (dateStr.isNullOrBlank()) errors.add("Missing date")
        if (payee.isNullOrBlank()) errors.add("Missing payee")
        if (outflowStr.isNullOrBlank() && inflowStr.isNullOrBlank()) errors.add("Missing outflow/inflow")

        if (errors.isNotEmpty()) {
            return RowResult.Err(ImportRowError(rowNumber, fields, errors))
        }

        val date = GenericCsvImportParser.parseDate(dateStr!!)
        if (date == null) {
            return RowResult.Err(ImportRowError(rowNumber, fields, listOf("Cannot parse date: '$dateStr'")))
        }

        val outflow = parseYnabAmount(outflowStr) ?: Cents.ZERO
        val inflow = parseYnabAmount(inflowStr) ?: Cents.ZERO
        val amount = if (inflow.isPositive()) inflow else -outflow

        if (amount.isZero()) {
            return RowResult.Err(ImportRowError(rowNumber, fields, listOf("Both outflow and inflow are zero")))
        }

        // Category: try "category group/category" first, then fallback to split columns
        val category = getCol(fields, colIndex, "category group/category")?.takeIf { it.isNotBlank() }
            ?: buildCategoryFromParts(
                getCol(fields, colIndex, "master category") ?: getCol(fields, colIndex, "category group"),
                getCol(fields, colIndex, "sub category") ?: getCol(fields, colIndex, "category"),
            )

        val memo = getCol(fields, colIndex, "memo")?.takeIf { it.isNotBlank() }
        val account = getCol(fields, colIndex, "account")?.takeIf { it.isNotBlank() }

        return RowResult.Ok(
            ParsedTransaction(
                date = date,
                amount = amount,
                description = payee!!.trim(),
                category = category?.trim(),
                note = memo?.trim(),
                type = if (inflow.isPositive()) "inflow" else "outflow",
                currency = defaultCurrency,
                account = account?.trim(),
                sourceRowNumber = rowNumber,
            ),
        )
    }

    @Suppress("ReturnCount")
    private fun parseYnabJsonTransaction(
        obj: JsonObject,
        rowNumber: Int,
        defaultCurrency: Currency,
    ): RowResult {
        val errors = mutableListOf<String>()

        val dateStr = obj["date"]?.jsonPrimitive?.content
        val amountMilliunits = obj["amount"]?.jsonPrimitive?.content?.toLongOrNull()
        val payee = obj["payee_name"]?.jsonPrimitive?.content

        if (dateStr.isNullOrBlank()) errors.add("Missing date")
        if (amountMilliunits == null) errors.add("Missing or invalid amount")
        if (payee.isNullOrBlank()) errors.add("Missing payee_name")

        if (errors.isNotEmpty()) {
            return RowResult.Err(ImportRowError(rowNumber, listOf(obj.toString()), errors))
        }

        val date = GenericCsvImportParser.parseDate(dateStr!!)
        if (date == null) {
            return RowResult.Err(
                ImportRowError(rowNumber, listOf(obj.toString()), listOf("Cannot parse date: '$dateStr'")),
            )
        }

        // YNAB milliunits: 1000 = $1.00, so divide by 10 to get cents
        val cents = amountMilliunits!! / 10
        val amount = Cents(cents)

        if (amount.isZero()) {
            return RowResult.Err(
                ImportRowError(rowNumber, listOf(obj.toString()), listOf("Transaction amount is zero")),
            )
        }

        val category = obj["category_name"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        val memo = obj["memo"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
        val account = obj["account_name"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }

        return RowResult.Ok(
            ParsedTransaction(
                date = date,
                amount = amount,
                description = payee!!.trim(),
                category = category?.trim(),
                note = memo?.trim(),
                type = if (amount.isPositive()) "inflow" else "outflow",
                currency = defaultCurrency,
                account = account?.trim(),
                sourceRowNumber = rowNumber,
            ),
        )
    }

    private fun parseYnabAmount(str: String?): Cents? {
        if (str.isNullOrBlank()) return null
        return GenericCsvImportParser.parseAmount(str)
    }

    private fun buildCategoryFromParts(group: String?, sub: String?): String? {
        val g = group?.trim()?.takeIf { it.isNotBlank() }
        val s = sub?.trim()?.takeIf { it.isNotBlank() }
        return when {
            g != null && s != null -> "$g: $s"
            g != null -> g
            s != null -> s
            else -> null
        }
    }

    private fun getCol(fields: List<String>, colIndex: Map<String, Int>, header: String): String? {
        val idx = colIndex[header] ?: return null
        return if (idx < fields.size) fields[idx] else null
    }

    private fun buildYnabMappings(headers: List<String>): List<ColumnMapping> {
        return headers.map { header ->
            val role = when (header.trim().lowercase()) {
                "date" -> ColumnRole.DATE
                "payee" -> ColumnRole.DESCRIPTION
                "outflow", "inflow", "amount" -> ColumnRole.AMOUNT
                "category group/category", "master category", "sub category",
                "category group", "category" -> ColumnRole.CATEGORY
                "memo" -> ColumnRole.NOTE
                "account" -> ColumnRole.ACCOUNT
                else -> ColumnRole.IGNORED
            }
            ColumnMapping(header, role, if (role == ColumnRole.IGNORED) 0.0 else 1.0)
        }
    }

    private fun emptyPreview() = ImportPreview(
        transactions = emptyList(),
        errorRows = emptyList(),
        columnMappings = emptyList(),
        sourceFormat = ImportSourceFormat.YNAB4,
        totalRowCount = 0,
    )
}
