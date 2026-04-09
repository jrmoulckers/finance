// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Parses CSV content into domain model entities.
 *
 * Supports two CSV layouts:
 *
 * 1. **Multi-section** (round-trip from [com.finance.core.export.CsvExportSerializer]):
 *    Sections are delimited by `# SECTION_NAME` comment headers. Each section
 *    has its own column headers and data rows. Recognised sections: `METADATA`,
 *    `ACCOUNTS`, `TRANSACTIONS`, `CATEGORIES`, `BUDGETS`, `GOALS`.
 *
 * 2. **Flat transaction CSV** (bank statement imports):
 *    A single header row followed by data rows. Column mapping is flexible:
 *    common column names (`date`, `amount`, `description`, `payee`, `note`, etc.)
 *    are matched case-insensitively. This mode produces only transactions;
 *    other entity lists will be empty.
 *
 * The parser automatically detects the layout by checking for `#` comment lines
 * in the content.
 *
 * @see DataImportService for orchestration
 * @see CsvParser for low-level RFC 4180 parsing
 */
internal object CsvImportParser {

    // ═════════════════════════════════════════════════════════════════
    // Public API
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parses CSV content and returns an [ImportOutcome].
     *
     * @param content Raw CSV string content.
     * @param defaultCurrency Fallback currency for transactions that lack a
     *                        `currency` column. Defaults to [Currency.USD].
     * @param defaultHouseholdId Fallback household ID for rows that lack a
     *                           `household_id` column. Required for flat
     *                           transaction imports where household context
     *                           comes from the authenticated session.
     * @return [ImportOutcome.Success] with parsed data, or
     *         [ImportOutcome.Failure] if parsing fails fatally.
     */
    fun parse(
        content: String,
        defaultCurrency: Currency = Currency.USD,
        defaultHouseholdId: SyncId = SyncId("import-default"),
    ): ImportOutcome {
        if (content.isBlank()) {
            return ImportOutcome.Failure(ImportError.EmptyFile())
        }

        val isMultiSection = content.lines().any { it.trimStart().startsWith("#") }

        return if (isMultiSection) {
            parseMultiSection(content, defaultCurrency, defaultHouseholdId)
        } else {
            parseFlatTransactionCsv(content, defaultCurrency, defaultHouseholdId)
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Multi-section parser (round-trip from export)
    // ═════════════════════════════════════════════════════════════════

    private fun parseMultiSection(
        content: String,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): ImportOutcome {
        val sections = CsvParser.parseSections(content)

        val warnings = mutableListOf<ImportWarning>()
        var totalRows = 0
        var skippedRows = 0

        // Parse each entity type section
        val accounts = mutableListOf<Account>()
        val transactions = mutableListOf<Transaction>()
        val categories = mutableListOf<Category>()
        val budgets = mutableListOf<Budget>()
        val goals = mutableListOf<Goal>()

        sections["ACCOUNTS"]?.let { rows ->
            val result = parseAccountSection(rows, defaultCurrency, defaultHouseholdId)
            accounts.addAll(result.entities)
            warnings.addAll(result.warnings)
            totalRows += result.totalRows
            skippedRows += result.skippedRows
        }

        sections["TRANSACTIONS"]?.let { rows ->
            val result = parseTransactionSection(rows, defaultCurrency, defaultHouseholdId)
            transactions.addAll(result.entities)
            warnings.addAll(result.warnings)
            totalRows += result.totalRows
            skippedRows += result.skippedRows
        }

        sections["CATEGORIES"]?.let { rows ->
            val result = parseCategorySection(rows, defaultHouseholdId)
            categories.addAll(result.entities)
            warnings.addAll(result.warnings)
            totalRows += result.totalRows
            skippedRows += result.skippedRows
        }

        sections["BUDGETS"]?.let { rows ->
            val result = parseBudgetSection(rows, defaultCurrency, defaultHouseholdId)
            budgets.addAll(result.entities)
            warnings.addAll(result.warnings)
            totalRows += result.totalRows
            skippedRows += result.skippedRows
        }

        sections["GOALS"]?.let { rows ->
            val result = parseGoalSection(rows, defaultCurrency, defaultHouseholdId)
            goals.addAll(result.entities)
            warnings.addAll(result.warnings)
            totalRows += result.totalRows
            skippedRows += result.skippedRows
        }

        val data = ImportData(accounts, transactions, categories, budgets, goals)
        val successfulRows = data.totalRecords

        if (data.isEmpty && totalRows == 0) {
            return ImportOutcome.Failure(ImportError.EmptyFile("No data rows found in any section"))
        }

        return ImportOutcome.Success(
            ImportResult(
                data = data,
                warnings = warnings,
                stats = ImportStats(
                    totalRows = totalRows,
                    successfulRows = successfulRows,
                    skippedRows = skippedRows,
                    entityCounts = ImportEntityCounts(
                        accounts = accounts.size,
                        transactions = transactions.size,
                        categories = categories.size,
                        budgets = budgets.size,
                        goals = goals.size,
                    ),
                ),
            ),
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Flat transaction CSV parser (bank imports)
    // ═════════════════════════════════════════════════════════════════

    private fun parseFlatTransactionCsv(
        content: String,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): ImportOutcome {
        val allRows = CsvParser.parseRows(content)
        if (allRows.isEmpty()) {
            return ImportOutcome.Failure(ImportError.EmptyFile())
        }

        val headerRow = allRows.first()
        val dataRows = allRows.drop(1)

        if (dataRows.isEmpty()) {
            return ImportOutcome.Failure(ImportError.EmptyFile("CSV has a header but no data rows"))
        }

        val columnIndex = buildColumnIndex(headerRow)
        val warnings = mutableListOf<ImportWarning>()
        val transactions = mutableListOf<Transaction>()
        var skippedRows = 0

        for ((rowIdx, row) in dataRows.withIndex()) {
            val rowNum = rowIdx + 2 // 1-based, accounting for header
            val result = parseFlatTransactionRow(
                row, columnIndex, rowNum, defaultCurrency, defaultHouseholdId,
            )
            when (result) {
                is RowResult.Success -> {
                    transactions.add(result.entity)
                    warnings.addAll(result.warnings)
                }
                is RowResult.Skipped -> {
                    skippedRows++
                    warnings.add(result.warning)
                }
            }
        }

        if (transactions.isEmpty()) {
            return ImportOutcome.Failure(
                ImportError.InvalidFormat("No valid transaction rows could be parsed"),
            )
        }

        return ImportOutcome.Success(
            ImportResult(
                data = ImportData(
                    accounts = emptyList(),
                    transactions = transactions,
                    categories = emptyList(),
                    budgets = emptyList(),
                    goals = emptyList(),
                ),
                warnings = warnings,
                stats = ImportStats(
                    totalRows = dataRows.size,
                    successfulRows = transactions.size,
                    skippedRows = skippedRows,
                    entityCounts = ImportEntityCounts(
                        accounts = 0,
                        transactions = transactions.size,
                        categories = 0,
                        budgets = 0,
                        goals = 0,
                    ),
                ),
            ),
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Section parsers for multi-section format
    // ═════════════════════════════════════════════════════════════════

    private data class SectionParseResult<T>(
        val entities: List<T>,
        val warnings: List<ImportWarning>,
        val totalRows: Int,
        val skippedRows: Int,
    )

    private sealed class RowResult<T> {
        data class Success<T>(val entity: T, val warnings: List<ImportWarning> = emptyList()) : RowResult<T>()
        data class Skipped<T>(val warning: ImportWarning) : RowResult<T>()
    }

    /**
     * Parses the ACCOUNTS section rows into [Account] entities.
     */
    private fun parseAccountSection(
        rows: List<List<String>>,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): SectionParseResult<Account> {
        if (rows.isEmpty()) return SectionParseResult(emptyList(), emptyList(), 0, 0)

        val columnIndex = buildColumnIndex(rows.first())
        val dataRows = rows.drop(1)
        val entities = mutableListOf<Account>()
        val warnings = mutableListOf<ImportWarning>()
        var skipped = 0

        for ((idx, row) in dataRows.withIndex()) {
            val rowNum = idx + 1
            try {
                val id = getRequiredField(row, columnIndex, "id", "ACCOUNTS", rowNum)
                val name = getRequiredField(row, columnIndex, "name", "ACCOUNTS", rowNum)

                val account = Account(
                    id = SyncId(id),
                    householdId = SyncId(getField(row, columnIndex, "household_id") ?: defaultHouseholdId.value),
                    name = name,
                    type = parseEnum(getField(row, columnIndex, "type"), AccountType.entries) ?: AccountType.OTHER,
                    currency = parseCurrency(getField(row, columnIndex, "currency")) ?: defaultCurrency,
                    currentBalance = parseCentsFromDisplay(
                        getField(row, columnIndex, "current_balance"),
                        parseCurrency(getField(row, columnIndex, "currency")) ?: defaultCurrency,
                    ),
                    isArchived = getField(row, columnIndex, "is_archived")?.toBooleanStrictOrNull() ?: false,
                    sortOrder = getField(row, columnIndex, "sort_order")?.toIntOrNull() ?: 0,
                    icon = getField(row, columnIndex, "icon")?.ifEmpty { null },
                    color = getField(row, columnIndex, "color")?.ifEmpty { null },
                    createdAt = parseInstant(getField(row, columnIndex, "created_at")),
                    updatedAt = parseInstant(getField(row, columnIndex, "updated_at")),
                    deletedAt = getField(row, columnIndex, "deleted_at")?.ifEmpty { null }?.let { parseInstant(it) },
                )
                entities.add(account)
            } catch (e: RequiredFieldMissing) {
                skipped++
                warnings.add(ImportWarning(rowNum, e.column, e.message ?: "Missing required field"))
            } catch (e: Exception) {
                skipped++
                warnings.add(ImportWarning(rowNum, "", "Failed to parse account: ${e.message}"))
            }
        }

        return SectionParseResult(entities, warnings, dataRows.size, skipped)
    }

    /**
     * Parses the TRANSACTIONS section rows into [Transaction] entities.
     */
    private fun parseTransactionSection(
        rows: List<List<String>>,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): SectionParseResult<Transaction> {
        if (rows.isEmpty()) return SectionParseResult(emptyList(), emptyList(), 0, 0)

        val columnIndex = buildColumnIndex(rows.first())
        val dataRows = rows.drop(1)
        val entities = mutableListOf<Transaction>()
        val warnings = mutableListOf<ImportWarning>()
        var skipped = 0

        for ((idx, row) in dataRows.withIndex()) {
            val rowNum = idx + 1
            try {
                val id = getRequiredField(row, columnIndex, "id", "TRANSACTIONS", rowNum)
                val accountId = getRequiredField(row, columnIndex, "account_id", "TRANSACTIONS", rowNum)
                val amountStr = getRequiredField(row, columnIndex, "amount", "TRANSACTIONS", rowNum)
                val dateStr = getRequiredField(row, columnIndex, "date", "TRANSACTIONS", rowNum)

                val currency = parseCurrency(getField(row, columnIndex, "currency")) ?: defaultCurrency
                val type = parseEnum(getField(row, columnIndex, "type"), TransactionType.entries)
                    ?: TransactionType.EXPENSE
                val transferAccountId = getField(row, columnIndex, "transfer_account_id")?.ifEmpty { null }

                val transaction = Transaction(
                    id = SyncId(id),
                    householdId = SyncId(getField(row, columnIndex, "household_id") ?: defaultHouseholdId.value),
                    accountId = SyncId(accountId),
                    categoryId = getField(row, columnIndex, "category_id")?.ifEmpty { null }?.let { SyncId(it) },
                    type = type,
                    status = parseEnum(getField(row, columnIndex, "status"), TransactionStatus.entries)
                        ?: TransactionStatus.CLEARED,
                    amount = parseCentsFromDisplay(amountStr, currency),
                    currency = currency,
                    payee = getField(row, columnIndex, "payee")?.ifEmpty { null },
                    note = getField(row, columnIndex, "note")?.ifEmpty { null },
                    date = LocalDate.parse(dateStr),
                    transferAccountId = transferAccountId?.let { SyncId(it) },
                    transferTransactionId = getField(row, columnIndex, "transfer_transaction_id")
                        ?.ifEmpty { null }?.let { SyncId(it) },
                    isRecurring = getField(row, columnIndex, "is_recurring")?.toBooleanStrictOrNull() ?: false,
                    recurringRuleId = getField(row, columnIndex, "recurring_rule_id")
                        ?.ifEmpty { null }?.let { SyncId(it) },
                    tags = getField(row, columnIndex, "tags")?.ifEmpty { null }
                        ?.split(";")?.map { it.trim() }?.filter { it.isNotEmpty() }
                        ?: emptyList(),
                    createdAt = parseInstant(getField(row, columnIndex, "created_at")),
                    updatedAt = parseInstant(getField(row, columnIndex, "updated_at")),
                    deletedAt = getField(row, columnIndex, "deleted_at")?.ifEmpty { null }?.let { parseInstant(it) },
                )
                entities.add(transaction)
            } catch (e: RequiredFieldMissing) {
                skipped++
                warnings.add(ImportWarning(rowNum, e.column, e.message ?: "Missing required field"))
            } catch (e: Exception) {
                skipped++
                warnings.add(ImportWarning(rowNum, "", "Failed to parse transaction: ${e.message}"))
            }
        }

        return SectionParseResult(entities, warnings, dataRows.size, skipped)
    }

    /**
     * Parses the CATEGORIES section rows into [Category] entities.
     */
    private fun parseCategorySection(
        rows: List<List<String>>,
        defaultHouseholdId: SyncId,
    ): SectionParseResult<Category> {
        if (rows.isEmpty()) return SectionParseResult(emptyList(), emptyList(), 0, 0)

        val columnIndex = buildColumnIndex(rows.first())
        val dataRows = rows.drop(1)
        val entities = mutableListOf<Category>()
        val warnings = mutableListOf<ImportWarning>()
        var skipped = 0

        for ((idx, row) in dataRows.withIndex()) {
            val rowNum = idx + 1
            try {
                val id = getRequiredField(row, columnIndex, "id", "CATEGORIES", rowNum)
                val name = getRequiredField(row, columnIndex, "name", "CATEGORIES", rowNum)

                val category = Category(
                    id = SyncId(id),
                    householdId = SyncId(getField(row, columnIndex, "household_id") ?: defaultHouseholdId.value),
                    name = name,
                    icon = getField(row, columnIndex, "icon")?.ifEmpty { null },
                    color = getField(row, columnIndex, "color")?.ifEmpty { null },
                    parentId = getField(row, columnIndex, "parent_id")?.ifEmpty { null }?.let { SyncId(it) },
                    isIncome = getField(row, columnIndex, "is_income")?.toBooleanStrictOrNull() ?: false,
                    isSystem = getField(row, columnIndex, "is_system")?.toBooleanStrictOrNull() ?: false,
                    sortOrder = getField(row, columnIndex, "sort_order")?.toIntOrNull() ?: 0,
                    createdAt = parseInstant(getField(row, columnIndex, "created_at")),
                    updatedAt = parseInstant(getField(row, columnIndex, "updated_at")),
                    deletedAt = getField(row, columnIndex, "deleted_at")?.ifEmpty { null }?.let { parseInstant(it) },
                )
                entities.add(category)
            } catch (e: RequiredFieldMissing) {
                skipped++
                warnings.add(ImportWarning(rowNum, e.column, e.message ?: "Missing required field"))
            } catch (e: Exception) {
                skipped++
                warnings.add(ImportWarning(rowNum, "", "Failed to parse category: ${e.message}"))
            }
        }

        return SectionParseResult(entities, warnings, dataRows.size, skipped)
    }

    /**
     * Parses the BUDGETS section rows into [Budget] entities.
     */
    private fun parseBudgetSection(
        rows: List<List<String>>,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): SectionParseResult<Budget> {
        if (rows.isEmpty()) return SectionParseResult(emptyList(), emptyList(), 0, 0)

        val columnIndex = buildColumnIndex(rows.first())
        val dataRows = rows.drop(1)
        val entities = mutableListOf<Budget>()
        val warnings = mutableListOf<ImportWarning>()
        var skipped = 0

        for ((idx, row) in dataRows.withIndex()) {
            val rowNum = idx + 1
            try {
                val id = getRequiredField(row, columnIndex, "id", "BUDGETS", rowNum)
                val categoryId = getRequiredField(row, columnIndex, "category_id", "BUDGETS", rowNum)
                val name = getRequiredField(row, columnIndex, "name", "BUDGETS", rowNum)
                val amountStr = getRequiredField(row, columnIndex, "amount", "BUDGETS", rowNum)

                val currency = parseCurrency(getField(row, columnIndex, "currency")) ?: defaultCurrency

                val budget = Budget(
                    id = SyncId(id),
                    householdId = SyncId(getField(row, columnIndex, "household_id") ?: defaultHouseholdId.value),
                    categoryId = SyncId(categoryId),
                    name = name,
                    amount = parseCentsFromDisplay(amountStr, currency),
                    currency = currency,
                    period = parseEnum(getField(row, columnIndex, "period"), BudgetPeriod.entries) ?: BudgetPeriod.MONTHLY,
                    startDate = LocalDate.parse(
                        getField(row, columnIndex, "start_date") ?: Clock.System.now()
                            .toLocalDateTime(TimeZone.UTC).date.toString()
                    ),
                    endDate = getField(row, columnIndex, "end_date")?.ifEmpty { null }?.let { LocalDate.parse(it) },
                    isRollover = getField(row, columnIndex, "is_rollover")?.toBooleanStrictOrNull() ?: false,
                    createdAt = parseInstant(getField(row, columnIndex, "created_at")),
                    updatedAt = parseInstant(getField(row, columnIndex, "updated_at")),
                    deletedAt = getField(row, columnIndex, "deleted_at")?.ifEmpty { null }?.let { parseInstant(it) },
                )
                entities.add(budget)
            } catch (e: RequiredFieldMissing) {
                skipped++
                warnings.add(ImportWarning(rowNum, e.column, e.message ?: "Missing required field"))
            } catch (e: Exception) {
                skipped++
                warnings.add(ImportWarning(rowNum, "", "Failed to parse budget: ${e.message}"))
            }
        }

        return SectionParseResult(entities, warnings, dataRows.size, skipped)
    }

    /**
     * Parses the GOALS section rows into [Goal] entities.
     */
    private fun parseGoalSection(
        rows: List<List<String>>,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): SectionParseResult<Goal> {
        if (rows.isEmpty()) return SectionParseResult(emptyList(), emptyList(), 0, 0)

        val columnIndex = buildColumnIndex(rows.first())
        val dataRows = rows.drop(1)
        val entities = mutableListOf<Goal>()
        val warnings = mutableListOf<ImportWarning>()
        var skipped = 0

        for ((idx, row) in dataRows.withIndex()) {
            val rowNum = idx + 1
            try {
                val id = getRequiredField(row, columnIndex, "id", "GOALS", rowNum)
                val name = getRequiredField(row, columnIndex, "name", "GOALS", rowNum)
                val targetStr = getRequiredField(row, columnIndex, "target_amount", "GOALS", rowNum)

                val currency = parseCurrency(getField(row, columnIndex, "currency")) ?: defaultCurrency

                val goal = Goal(
                    id = SyncId(id),
                    householdId = SyncId(getField(row, columnIndex, "household_id") ?: defaultHouseholdId.value),
                    name = name,
                    targetAmount = parseCentsFromDisplay(targetStr, currency),
                    currentAmount = parseCentsFromDisplay(
                        getField(row, columnIndex, "current_amount") ?: "0",
                        currency,
                    ),
                    currency = currency,
                    targetDate = getField(row, columnIndex, "target_date")?.ifEmpty { null }?.let { LocalDate.parse(it) },
                    status = parseEnum(getField(row, columnIndex, "status"), GoalStatus.entries) ?: GoalStatus.ACTIVE,
                    icon = getField(row, columnIndex, "icon")?.ifEmpty { null },
                    color = getField(row, columnIndex, "color")?.ifEmpty { null },
                    accountId = getField(row, columnIndex, "account_id")?.ifEmpty { null }?.let { SyncId(it) },
                    createdAt = parseInstant(getField(row, columnIndex, "created_at")),
                    updatedAt = parseInstant(getField(row, columnIndex, "updated_at")),
                    deletedAt = getField(row, columnIndex, "deleted_at")?.ifEmpty { null }?.let { parseInstant(it) },
                )
                entities.add(goal)
            } catch (e: RequiredFieldMissing) {
                skipped++
                warnings.add(ImportWarning(rowNum, e.column, e.message ?: "Missing required field"))
            } catch (e: Exception) {
                skipped++
                warnings.add(ImportWarning(rowNum, "", "Failed to parse goal: ${e.message}"))
            }
        }

        return SectionParseResult(entities, warnings, dataRows.size, skipped)
    }

    // ═════════════════════════════════════════════════════════════════
    // Flat transaction row parser (bank imports)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parses a single row from a flat transaction CSV (bank statement import).
     *
     * Supports flexible column naming:
     * - `date` / `transaction_date` / `posted_date`
     * - `amount` / `value` / `transaction_amount`
     * - `description` / `payee` / `merchant` / `name`
     * - `note` / `memo` / `reference`
     * - `type` / `transaction_type`
     * - `category` / `category_name`
     */
    private fun parseFlatTransactionRow(
        row: List<String>,
        columnIndex: Map<String, Int>,
        rowNum: Int,
        defaultCurrency: Currency,
        defaultHouseholdId: SyncId,
    ): RowResult<Transaction> {
        try {
            // Date — required
            val dateStr = getFieldFlexible(row, columnIndex, listOf("date", "transaction_date", "posted_date"))
                ?: return RowResult.Skipped(ImportWarning(rowNum, "date", "Missing required date field"))

            val date = try {
                LocalDate.parse(dateStr)
            } catch (e: Exception) {
                return RowResult.Skipped(ImportWarning(rowNum, "date", "Invalid date format: $dateStr"))
            }

            // Amount — required
            val amountStr = getFieldFlexible(row, columnIndex, listOf("amount", "value", "transaction_amount"))
                ?: return RowResult.Skipped(ImportWarning(rowNum, "amount", "Missing required amount field"))

            val amountCents = parseAmountToCents(amountStr, defaultCurrency)
                ?: return RowResult.Skipped(ImportWarning(rowNum, "amount", "Invalid amount: $amountStr"))

            // Ensure non-zero amount (Transaction.init requires this)
            if (amountCents.amount == 0L) {
                return RowResult.Skipped(ImportWarning(rowNum, "amount", "Transaction amount cannot be zero"))
            }

            // Payee — optional
            val payee = getFieldFlexible(row, columnIndex, listOf("payee", "description", "merchant", "name"))
                ?.ifEmpty { null }

            // Note — optional
            val note = getFieldFlexible(row, columnIndex, listOf("note", "memo", "reference"))
                ?.ifEmpty { null }

            // Type — inferred from amount sign if not specified
            val typeStr = getFieldFlexible(row, columnIndex, listOf("type", "transaction_type"))
            val type = if (typeStr != null) {
                parseEnum(typeStr, TransactionType.entries) ?: inferTransactionType(amountCents)
            } else {
                inferTransactionType(amountCents)
            }

            // Category — optional
            val category = getFieldFlexible(row, columnIndex, listOf("category", "category_name", "category_id"))
                ?.ifEmpty { null }

            val warnings = mutableListOf<ImportWarning>()

            val transaction = Transaction(
                id = SyncId("import-${rowNum}-${date}"),
                householdId = defaultHouseholdId,
                accountId = SyncId(
                    getFieldFlexible(row, columnIndex, listOf("account_id", "account")) ?: "import-default-account"
                ),
                categoryId = category?.let { SyncId(it) },
                type = type,
                status = TransactionStatus.CLEARED,
                amount = if (amountCents.isNegative() && type == TransactionType.EXPENSE) -amountCents else amountCents,
                currency = parseCurrency(
                    getFieldFlexible(row, columnIndex, listOf("currency", "currency_code"))
                ) ?: defaultCurrency,
                payee = payee,
                note = note,
                date = date,
                createdAt = Clock.System.now(),
                updatedAt = Clock.System.now(),
            )

            return RowResult.Success(transaction, warnings)
        } catch (e: Exception) {
            return RowResult.Skipped(ImportWarning(rowNum, "", "Failed to parse row: ${e.message}"))
        }
    }

    // ═════════════════════════════════════════════════════════════════
    // Column indexing and field access
    // ═════════════════════════════════════════════════════════════════

    /**
     * Builds a case-insensitive column name → index map from a header row.
     */
    internal fun buildColumnIndex(headerRow: List<String>): Map<String, Int> {
        return headerRow.mapIndexed { index, header ->
            header.trim().lowercase() to index
        }.toMap()
    }

    /**
     * Gets a field value by column name from a row, using the column index.
     * Returns null if the column doesn't exist or the row is shorter than expected.
     */
    private fun getField(row: List<String>, columnIndex: Map<String, Int>, column: String): String? {
        val idx = columnIndex[column.lowercase()] ?: return null
        return if (idx < row.size) row[idx] else null
    }

    /**
     * Gets a field value using flexible column name matching.
     * Tries each candidate column name in order, returns the first match.
     */
    private fun getFieldFlexible(
        row: List<String>,
        columnIndex: Map<String, Int>,
        candidates: List<String>,
    ): String? {
        for (candidate in candidates) {
            val value = getField(row, columnIndex, candidate)
            if (value != null) return value
        }
        return null
    }

    /**
     * Gets a required field value, throwing [RequiredFieldMissing] if absent or blank.
     */
    private fun getRequiredField(
        row: List<String>,
        columnIndex: Map<String, Int>,
        column: String,
        section: String,
        rowNum: Int,
    ): String {
        val value = getField(row, columnIndex, column)
        if (value.isNullOrBlank()) {
            throw RequiredFieldMissing(column, section, rowNum)
        }
        return value
    }

    /** Internal exception for control flow within row parsing. Never escapes the parser. */
    private class RequiredFieldMissing(
        val column: String,
        val section: String,
        val rowNum: Int,
    ) : Exception("Required field '$column' is missing at row $rowNum in $section")

    // ═════════════════════════════════════════════════════════════════
    // Value parsing helpers
    // ═════════════════════════════════════════════════════════════════

    /**
     * Parses a display-format amount string (e.g., "12.50", "-3.50", "1000") into [Cents].
     *
     * Uses the currency's [Currency.decimalPlaces] to determine the multiplier.
     * Handles negative values, optional decimal point, and leading/trailing whitespace.
     */
    internal fun parseCentsFromDisplay(displayValue: String?, currency: Currency): Cents {
        if (displayValue.isNullOrBlank()) return Cents.ZERO

        val cleaned = displayValue.trim().replace(",", "")
        if (cleaned.isEmpty()) return Cents.ZERO

        return parseAmountToCents(cleaned, currency) ?: Cents.ZERO
    }

    /**
     * Parses an amount string to [Cents], returning null if unparseable.
     *
     * Supports:
     * - Simple decimal: "12.50" → 1250 cents (for USD)
     * - Negative: "-3.50" → -350 cents
     * - Whole number: "1000" → 100000 cents (for USD)
     * - Currency symbols stripped: "$12.50" → 1250 cents
     */
    internal fun parseAmountToCents(amountStr: String, currency: Currency): Cents? {
        // Strip common currency symbols and whitespace
        val cleaned = amountStr.trim()
            .removePrefix("$")
            .removePrefix("€")
            .removePrefix("£")
            .removePrefix("¥")
            .trim()

        if (cleaned.isEmpty()) return null

        val isNegative = cleaned.startsWith("-") || cleaned.startsWith("(")
        val absStr = cleaned
            .removePrefix("-")
            .removePrefix("(")
            .removeSuffix(")")
            .trim()

        if (absStr.isEmpty()) return null

        val decimals = currency.decimalPlaces
        val dotIndex = absStr.indexOf('.')

        val cents: Long = if (dotIndex >= 0) {
            val wholePart = absStr.substring(0, dotIndex).toLongOrNull() ?: return null
            val fracStr = absStr.substring(dotIndex + 1)
            // Pad or truncate fractional part to match currency decimal places
            val normalizedFrac = when {
                fracStr.length == decimals -> fracStr
                fracStr.length < decimals -> fracStr.padEnd(decimals, '0')
                else -> fracStr.substring(0, decimals) // truncate extra precision
            }
            val fracPart = if (decimals > 0) normalizedFrac.toLongOrNull() ?: return null else 0L
            var multiplier = 1L
            repeat(decimals) { multiplier *= 10 }
            wholePart * multiplier + fracPart
        } else {
            // No decimal point — treat as whole units
            val whole = absStr.toLongOrNull() ?: return null
            var multiplier = 1L
            repeat(decimals) { multiplier *= 10 }
            whole * multiplier
        }

        return Cents(if (isNegative) -cents else cents)
    }

    /**
     * Parses a 3-letter currency code string into a [Currency], or null if invalid.
     */
    internal fun parseCurrency(code: String?): Currency? {
        if (code.isNullOrBlank()) return null
        val upper = code.trim().uppercase()
        return try {
            Currency(upper)
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    /**
     * Parses an ISO 8601 instant string, returning the current time if null or unparseable.
     */
    private fun parseInstant(value: String?): Instant {
        if (value.isNullOrBlank()) return Clock.System.now()
        return try {
            Instant.parse(value)
        } catch (e: Exception) {
            Clock.System.now()
        }
    }

    /**
     * Parses an enum value case-insensitively, returning null if not matched.
     */
    private inline fun <reified T : Enum<T>> parseEnum(value: String?, entries: List<T>): T? {
        if (value.isNullOrBlank()) return null
        val upper = value.trim().uppercase()
        return entries.firstOrNull { it.name == upper }
    }

    /**
     * Infers transaction type from the sign of the amount.
     * Negative → EXPENSE, positive → INCOME.
     */
    private fun inferTransactionType(amount: Cents): TransactionType {
        return if (amount.isNegative()) TransactionType.EXPENSE else TransactionType.INCOME
    }
}
