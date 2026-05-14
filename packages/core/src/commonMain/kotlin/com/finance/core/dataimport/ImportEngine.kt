// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Currency

/**
 * Orchestrates the full data import pipeline: format detection, parsing,
 * column mapping, duplicate detection, and category mapping.
 *
 * This engine is the single entry point for all import operations in the
 * Finance app. It delegates to format-specific parsers ([GenericCsvImportParser],
 * [MintImportParser], [YnabImportParser]) and post-processing services
 * ([DuplicateDetector], [CategoryMapper]).
 *
 * The engine runs entirely client-side — it does not access the database
 * or network. The caller provides existing transaction fingerprints and
 * category lists for duplicate detection and category mapping.
 *
 * Usage:
 * ```
 * val preview = ImportEngine.importFile(
 *     content = fileContent,
 *     defaultCurrency = Currency.USD,
 * )
 * // Show preview to user, let them adjust mappings
 * val finalPreview = ImportEngine.applyDuplicateDetection(
 *     preview = preview,
 *     existingFingerprints = existingTxFingerprints,
 * )
 * ```
 *
 * @see ImportPreview for the result type
 * @see ImportSourceFormat for supported formats
 */
object ImportEngine {

    /**
     * Import a file by auto-detecting its format and parsing it.
     *
     * Detection order:
     * 1. If content is JSON with a `transactions` key → nYNAB JSON.
     * 2. Parse CSV headers and check for Mint-specific columns → Mint.
     * 3. Parse CSV headers and check for YNAB-specific columns → YNAB4/nYNAB CSV.
     * 4. Fallback → Generic CSV with auto-detected column mapping.
     *
     * @param content Raw file content (CSV or JSON).
     * @param defaultCurrency Fallback currency for transactions without currency info.
     * @param columnMappings Optional user-supplied column mappings for generic CSV.
     * @return [ImportPreview] with parsed data and diagnostics.
     */
    @Suppress("ReturnCount")
    fun importFile(
        content: String,
        defaultCurrency: Currency = Currency.USD,
        columnMappings: List<ColumnMapping>? = null,
    ): ImportPreview {
        if (content.isBlank()) {
            return ImportPreview(
                transactions = emptyList(),
                errorRows = emptyList(),
                columnMappings = emptyList(),
                sourceFormat = ImportSourceFormat.GENERIC_CSV,
                totalRowCount = 0,
            )
        }

        // 1. Try nYNAB JSON
        if (YnabImportParser.detectJson(content)) {
            return YnabImportParser.parseJson(content, defaultCurrency)
        }

        // 2. Parse as CSV and inspect headers
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

        // 3. Try Mint
        if (MintImportParser.detect(headers)) {
            return MintImportParser.parse(content, defaultCurrency)
        }

        // 4. Try YNAB CSV
        if (YnabImportParser.detectCsv(headers)) {
            return YnabImportParser.parseCsv(content, defaultCurrency)
        }

        // 5. Generic CSV
        return GenericCsvImportParser.parse(content, columnMappings, defaultCurrency)
    }

    /**
     * Apply duplicate detection to an existing [ImportPreview].
     *
     * @param preview The import preview to filter.
     * @param existingFingerprints Fingerprints of transactions already in the database.
     * @return A new [ImportPreview] with [ImportPreview.duplicateCount] updated.
     */
    fun applyDuplicateDetection(
        preview: ImportPreview,
        existingFingerprints: Set<DuplicateDetector.TransactionFingerprint>,
    ): ImportPreview {
        val result = DuplicateDetector.detectWithIntraBatch(
            imported = preview.transactions,
            existing = existingFingerprints,
        )
        return preview.copy(
            duplicateCount = result.duplicateCount,
        )
    }

    /**
     * Apply category mapping to parsed transactions.
     *
     * @param preview The import preview containing parsed transactions.
     * @param appCategories Available categories in the Finance app.
     * @param userOverrides User-configured category mappings.
     * @return [CategoryMapper.CategoryMappingResult] with all mappings.
     */
    fun mapCategories(
        preview: ImportPreview,
        appCategories: List<CategoryMapper.AppCategory>,
        userOverrides: Map<String, String> = emptyMap(),
    ): CategoryMapper.CategoryMappingResult {
        val sourceCategories = preview.transactions
            .mapNotNull { it.category }
            .distinct()

        return CategoryMapper.map(
            sourceCategories = sourceCategories,
            appCategories = appCategories,
            userOverrides = userOverrides,
        )
    }

    /**
     * Detect the format of a file without fully parsing it.
     *
     * @param content Raw file content.
     * @return The detected [ImportSourceFormat].
     */
    @Suppress("ReturnCount")
    fun detectFormat(content: String): ImportSourceFormat {
        if (content.isBlank()) return ImportSourceFormat.GENERIC_CSV

        if (YnabImportParser.detectJson(content)) return ImportSourceFormat.NYNAB

        val rows = CsvParser.parseRows(content)
        if (rows.isEmpty()) return ImportSourceFormat.GENERIC_CSV

        val headers = rows.first()
        if (MintImportParser.detect(headers)) return ImportSourceFormat.MINT
        if (YnabImportParser.detectCsv(headers)) {
            val normalised = headers.map { it.trim().lowercase() }
            return if ("master category" in normalised || "sub category" in normalised) {
                ImportSourceFormat.YNAB4
            } else {
                ImportSourceFormat.NYNAB
            }
        }

        return ImportSourceFormat.GENERIC_CSV
    }
}
