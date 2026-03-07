package com.finance.core.data

import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate

/**
 * Parses bank-exported CSV files into [Transaction] instances.
 *
 * Typical workflow:
 * ```
 * val headers  = CsvImporter.parseHeaders(firstLine)
 * val mapping  = CsvImporter.mapColumns(headers)
 * val result   = CsvImporter.importTransactions(csv, mapping, accountId)
 * val dupes    = CsvImporter.detectDuplicates(result.imported, existingTxns)
 * ```
 *
 * **Design rules applied:**
 * - Monetary values stored as [Cents] (Long) — never Double/Float.
 * - Dates parsed via [kotlinx.datetime.LocalDate] — no java.time.
 * - Errors returned in [ImportResult], never thrown for business logic.
 */
object CsvImporter {

    // ── Public API ────────────────────────────────────────────────────

    /**
     * Split the first line of a CSV into individual header tokens,
     * trimming whitespace and surrounding quotes from each token.
     */
    fun parseHeaders(firstLine: String): List<String> {
        if (firstLine.isBlank()) return emptyList()
        return parseCsvLine(firstLine).map { it.trim().removeSurrounding("\"").trim() }
    }

    /**
     * Auto-detect which header columns map to [Transaction] fields
     * by matching header names against well-known synonyms.
     *
     * @throws IllegalArgumentException if neither a date nor an amount
     *         column can be detected (those two are mandatory).
     */
    fun mapColumns(headers: List<String>): ColumnMapping {
        val lower = headers.map { it.lowercase().trim() }

        val dateIdx = lower.indexOfFirst { it in ColumnMapping.DATE_SYNONYMS }
        val amountIdx = lower.indexOfFirst { it in ColumnMapping.AMOUNT_SYNONYMS }

        require(dateIdx >= 0) {
            "Cannot detect a date column. Headers: $headers"
        }
        require(amountIdx >= 0) {
            "Cannot detect an amount column. Headers: $headers"
        }

        return ColumnMapping(
            dateColumn = dateIdx,
            amountColumn = amountIdx,
            payeeColumn = lower.indexOfFirstOrNull { it in ColumnMapping.PAYEE_SYNONYMS },
            categoryColumn = lower.indexOfFirstOrNull { it in ColumnMapping.CATEGORY_SYNONYMS },
            noteColumn = lower.indexOfFirstOrNull { it in ColumnMapping.NOTE_SYNONYMS },
        )
    }

    /**
     * Parse every data row of [csv] into [Transaction] instances using
     * the supplied [mapping].
     *
     * The first line is assumed to be a header and is skipped.
     * Rows that cannot be parsed are recorded as [ImportError]s inside
     * the returned [ImportResult] — the importer never throws for
     * individual row failures.
     *
     * @param csv       Full CSV text (header + data rows).
     * @param mapping   Column-to-field mapping (may come from [mapColumns]).
     * @param accountId The account these transactions belong to.
     * @param currency  ISO 4217 currency; defaults to USD.
     * @param householdId  Household that owns these transactions.
     * @param existingTransactions  Optional list of existing transactions for
     *                              inline duplicate detection.
     * @param idGenerator  Factory for [SyncId]; injectable for testing.
     * @param clock     Clock for timestamps; injectable for testing.
     */
    fun importTransactions(
        csv: String,
        mapping: ColumnMapping,
        accountId: SyncId,
        currency: Currency = Currency.USD,
        householdId: SyncId = SyncId("default"),
        existingTransactions: List<Transaction> = emptyList(),
        idGenerator: () -> SyncId = { SyncId(generateSimpleId()) },
        clock: Clock = Clock.System,
    ): ImportResult {
        val lines = csv.lines().filter { it.isNotBlank() }
        if (lines.size < 2) {
            return ImportResult(
                imported = emptyList(),
                skippedCount = 0,
                duplicates = emptyList(),
                errors = listOf(ImportError(row = 0, message = "CSV contains no data rows")),
            )
        }

        val dataLines = lines.drop(1) // skip header
        val imported = mutableListOf<Transaction>()
        val errors = mutableListOf<ImportError>()
        val now = clock.now()

        for ((index, line) in dataLines.withIndex()) {
            val rowNumber = index + 1
            val result = parseRow(
                line = line,
                mapping = mapping,
                accountId = accountId,
                currency = currency,
                householdId = householdId,
                rowNumber = rowNumber,
                idGenerator = idGenerator,
                now = now,
            )
            result.fold(
                onSuccess = { imported.add(it) },
                onFailure = { errors.add(ImportError(row = rowNumber, message = it.message ?: "Unknown error")) },
            )
        }

        val duplicates = detectDuplicates(imported, existingTransactions)
        val duplicateSet = duplicates.map { it.imported }.toSet()
        val deduplicated = imported.filter { it !in duplicateSet }

        return ImportResult(
            imported = deduplicated,
            skippedCount = duplicates.size,
            duplicates = duplicates,
            errors = errors,
        )
    }

    /**
     * Find probable duplicates by comparing date, amount, and payee
     * between two lists of transactions.
     *
     * A match requires **all three** to be equal (payee comparison is
     * case-insensitive and ignores leading/trailing whitespace).
     */
    fun detectDuplicates(
        imported: List<Transaction>,
        existing: List<Transaction>,
    ): List<DuplicateMatch> {
        if (existing.isEmpty()) return emptyList()

        // Build a lookup key → existing-transaction map for O(n+m) matching.
        data class DupeKey(val date: LocalDate, val amount: Long, val payee: String?)
        val existingByKey = existing.groupBy { txn ->
            DupeKey(txn.date, txn.amount.amount, txn.payee?.lowercase()?.trim())
        }

        return imported.mapNotNull { imp ->
            val key = DupeKey(imp.date, imp.amount.amount, imp.payee?.lowercase()?.trim())
            val match = existingByKey[key]?.firstOrNull()
            if (match != null) DuplicateMatch(imported = imp, existing = match) else null
        }
    }

    // ── Internals ─────────────────────────────────────────────────────

    /**
     * Parse a single CSV data row into a [Transaction].
     * Returns [Result.failure] for any row-level issue so the caller
     * can collect errors without aborting the whole import.
     */
    internal fun parseRow(
        line: String,
        mapping: ColumnMapping,
        accountId: SyncId,
        currency: Currency,
        householdId: SyncId,
        rowNumber: Int,
        idGenerator: () -> SyncId,
        now: kotlinx.datetime.Instant,
    ): Result<Transaction> = runCatching {
        val fields = parseCsvLine(line).map { it.trim().removeSurrounding("\"").trim() }

        val maxRequired = maxOf(mapping.dateColumn, mapping.amountColumn)
        require(fields.size > maxRequired) {
            "Row $rowNumber has ${fields.size} columns but mapping requires at least ${maxRequired + 1}"
        }

        val date = parseDate(fields[mapping.dateColumn])
            ?: error("Row $rowNumber: cannot parse date '${fields[mapping.dateColumn]}'")

        val amount = parseAmount(fields[mapping.amountColumn])
            ?: error("Row $rowNumber: cannot parse amount '${fields[mapping.amountColumn]}'")

        val payee = mapping.payeeColumn?.let { fields.getOrNull(it)?.takeIf(String::isNotBlank) }
        val note = mapping.noteColumn?.let { fields.getOrNull(it)?.takeIf(String::isNotBlank) }
        val category = mapping.categoryColumn?.let { fields.getOrNull(it)?.takeIf(String::isNotBlank) }

        val type = if (amount.amount >= 0) TransactionType.INCOME else TransactionType.EXPENSE

        Transaction(
            id = idGenerator(),
            householdId = householdId,
            accountId = accountId,
            categoryId = null, // category names need lookup — left for the caller
            type = type,
            status = TransactionStatus.CLEARED,
            amount = if (amount.amount < 0) Cents(-amount.amount) else amount,
            currency = currency,
            payee = payee,
            note = buildImportNote(note, category),
            date = date,
            createdAt = now,
            updatedAt = now,
        )
    }

    /**
     * Parse a single CSV line respecting quoted fields that may
     * contain commas, newlines, or escaped quotes (`""`).
     */
    internal fun parseCsvLine(line: String): List<String> {
        val fields = mutableListOf<String>()
        val current = StringBuilder()
        var inQuotes = false
        var i = 0

        while (i < line.length) {
            val ch = line[i]
            when {
                ch == '"' && !inQuotes -> {
                    inQuotes = true
                }
                ch == '"' && inQuotes -> {
                    // Peek at next char for escaped quote
                    if (i + 1 < line.length && line[i + 1] == '"') {
                        current.append('"')
                        i++ // skip the second quote
                    } else {
                        inQuotes = false
                    }
                }
                ch == ',' && !inQuotes -> {
                    fields.add(current.toString())
                    current.clear()
                }
                else -> current.append(ch)
            }
            i++
        }
        fields.add(current.toString())
        return fields
    }

    /**
     * Best-effort date parser supporting common bank export formats:
     * - ISO 8601: `2024-06-15`
     * - US: `06/15/2024`, `6/15/2024`
     * - EU: `15.06.2024`
     * - Short year: `06/15/24`
     */
    internal fun parseDate(raw: String): LocalDate? {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return null

        // ISO 8601: yyyy-MM-dd
        ISO_DATE_REGEX.matchEntire(trimmed)?.let { m ->
            return tryLocalDate(
                m.groupValues[1].toInt(),
                m.groupValues[2].toInt(),
                m.groupValues[3].toInt(),
            )
        }

        // Slash-separated: M/d/yyyy or M/d/yy
        SLASH_DATE_REGEX.matchEntire(trimmed)?.let { m ->
            val p1 = m.groupValues[1].toInt()
            val p2 = m.groupValues[2].toInt()
            var p3 = m.groupValues[3].toInt()
            if (p3 < 100) p3 += 2000 // 24 → 2024
            return tryLocalDate(year = p3, month = p1, day = p2)
        }

        // Dot-separated (EU): d.M.yyyy
        DOT_DATE_REGEX.matchEntire(trimmed)?.let { m ->
            val day = m.groupValues[1].toInt()
            val month = m.groupValues[2].toInt()
            var year = m.groupValues[3].toInt()
            if (year < 100) year += 2000
            return tryLocalDate(year = year, month = month, day = day)
        }

        return null
    }

    /**
     * Parse a monetary amount string into [Cents].
     * Handles: `$1,234.56`, `-1234.56`, `(1234.56)`, `1.234,56` (EU).
     */
    internal fun parseAmount(raw: String): Cents? {
        var cleaned = raw.trim()
        if (cleaned.isBlank()) return null

        // Detect negative via parentheses: (123.45)
        val isParenNegative = cleaned.startsWith('(') && cleaned.endsWith(')')
        if (isParenNegative) cleaned = cleaned.drop(1).dropLast(1)

        // Strip currency symbols and whitespace
        cleaned = cleaned.replace(CURRENCY_SYMBOL_REGEX, "").trim()

        // Detect EU format: 1.234,56 — period as thousands separator, comma as decimal
        val isEuFormat = cleaned.contains(',') &&
            cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')

        cleaned = if (isEuFormat) {
            cleaned.replace(".", "").replace(",", ".")
        } else {
            cleaned.replace(",", "")
        }

        val value = cleaned.toDoubleOrNull() ?: return null
        val cents = (value * 100).toLong()
        return if (isParenNegative) Cents(-kotlin.math.abs(cents)) else Cents(cents)
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private fun buildImportNote(note: String?, category: String?): String? {
        val parts = listOfNotNull(note, category?.let { "Category: $it" })
        return parts.joinToString("; ").takeIf { it.isNotBlank() }
    }

    private fun tryLocalDate(year: Int, month: Int, day: Int): LocalDate? =
        try {
            LocalDate(year, month, day)
        } catch (_: IllegalArgumentException) {
            null
        }

    private fun <T> List<T>.indexOfFirstOrNull(predicate: (T) -> Boolean): Int? {
        val idx = indexOfFirst(predicate)
        return if (idx >= 0) idx else null
    }

    /**
     * Simple monotonic ID generator for imported transactions.
     * Production code should supply a UUID-based [idGenerator] instead.
     */
    private var idCounter = 0L
    internal fun generateSimpleId(): String = "import-${++idCounter}"

    // Regex patterns — compiled once
    private val ISO_DATE_REGEX = Regex("""(\d{4})-(\d{1,2})-(\d{1,2})""")
    private val SLASH_DATE_REGEX = Regex("""(\d{1,2})/(\d{1,2})/(\d{2,4})""")
    private val DOT_DATE_REGEX = Regex("""(\d{1,2})\.(\d{1,2})\.(\d{2,4})""")
    private val CURRENCY_SYMBOL_REGEX = Regex("""[$€£¥₹]""")
}
