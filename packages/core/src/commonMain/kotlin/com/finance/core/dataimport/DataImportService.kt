// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Currency
import com.finance.models.types.SyncId

/**
 * Orchestrates data import from portable file formats into domain models.
 *
 * This service validates the input, delegates to format-specific parsers,
 * and returns structured results with warnings and statistics. It is the
 * import counterpart of [com.finance.core.export.DataExportService].
 *
 * Imports run entirely client-side — parsed entities are returned to the
 * caller for persistence. The service does **not** write to SQLite directly;
 * the platform layer is responsible for inserting parsed records into the
 * local database and triggering sync.
 *
 * Usage:
 * ```
 * val outcome = DataImportService.importCsv(
 *     content = csvFileContent,
 *     defaultCurrency = Currency.USD,
 *     householdId = currentHouseholdId,
 * )
 * when (outcome) {
 *     is ImportOutcome.Success -> {
 *         val data = outcome.result.data
 *         // persist data.accounts, data.transactions, etc.
 *         showSummary(outcome.result.stats)
 *         if (outcome.result.warnings.isNotEmpty()) {
 *             showWarnings(outcome.result.warnings)
 *         }
 *     }
 *     is ImportOutcome.Failure -> showError(outcome.error)
 * }
 * ```
 *
 * @see ImportOutcome for the result type
 * @see ImportData for the parsed data container
 * @see CsvImportParser for CSV parsing implementation
 */
object DataImportService {

    /**
     * Imports financial data from CSV content.
     *
     * Supports two CSV layouts (auto-detected):
     *
     * 1. **Multi-section** (round-trip from Finance app export):
     *    Sections are delimited by `# SECTION_NAME` comment headers.
     *    Recognised sections: ACCOUNTS, TRANSACTIONS, CATEGORIES, BUDGETS, GOALS.
     *    The METADATA section is parsed but not returned as entities.
     *
     * 2. **Flat transaction CSV** (bank statement import):
     *    A single header row followed by data rows. Only transactions are
     *    produced. Flexible column matching supports common bank export
     *    column names (date, amount, description, etc.).
     *
     * The parser is resilient to missing optional columns and gracefully
     * degrades with warnings rather than failing the entire import.
     *
     * @param content Raw CSV string content. Must not be blank.
     * @param defaultCurrency Fallback currency when a row lacks a `currency` column.
     *                        Defaults to [Currency.USD].
     * @param householdId The authenticated user's household ID. Used as fallback
     *                    when rows lack a `household_id` column (common in
     *                    bank statement imports).
     * @return [ImportOutcome.Success] with parsed data, warnings, and stats;
     *         or [ImportOutcome.Failure] with error details.
     */
    fun importCsv(
        content: String,
        defaultCurrency: Currency = Currency.USD,
        householdId: SyncId = SyncId("import-default"),
    ): ImportOutcome {
        return CsvImportParser.parse(
            content = content,
            defaultCurrency = defaultCurrency,
            defaultHouseholdId = householdId,
        )
    }
}
