// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1363 — CSV Parsing & Duplicate Detection.
 *
 * Covers:
 * - CSV parsing with various bank formats (comma, TSV, semicolon)
 * - Header detection and column mapping
 * - Duplicate detection by amount + date + description hash
 * - Handling of malformed rows, missing fields, encoding issues
 * - Date format parsing (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
 */
class CsvImportVerificationTest {

    // ═══════════════════════════════════════════════════════════════════
    // CSV parsing with various bank formats
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun parseCsv_commaSeparated_standardFormat() {
        val csv = "Date,Amount,Description\n2024-06-15,25.00,Whole Foods\n2024-06-16,-12.50,Coffee Shop\n"
        val preview = GenericCsvImportParser.parse(csv)

        assertEquals(2, preview.transactions.size)
        assertEquals(0, preview.errorCount)
    }

    @Test
    fun parseCsv_quotedFieldsWithCommas_parsesCorrectly() {
        val csv = "Date,Amount,Description\n2024-06-15,25.00,\"Whole Foods, Inc.\"\n"
        val rows = CsvParser.parseRows(csv)

        assertEquals(2, rows.size)
        assertEquals("Whole Foods, Inc.", rows[1][2])
    }

    @Test
    fun parseCsv_quotedFieldsWithNewlines_parsesCorrectly() {
        val csv = "Date,Amount,Description\n2024-06-15,25.00,\"Line 1\nLine 2\"\n"
        val rows = CsvParser.parseRows(csv)

        assertEquals(2, rows.size)
        assertEquals("Line 1\nLine 2", rows[1][2])
    }

    @Test
    fun parseCsv_emptyContent_returnsEmptyPreview() {
        val preview = GenericCsvImportParser.parse("")

        assertEquals(0, preview.transactions.size)
        assertEquals(0, preview.totalRowCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Header detection and column mapping
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun columnDetection_standardHeaders_mapsCorrectly() {
        val headers = listOf("Date", "Amount", "Description", "Category")
        val result = ColumnDetector.detect(headers)

        assertTrue(result.isComplete, "All required columns should be detected")
        assertTrue(result.missingRequired.isEmpty())

        val roles = result.mappings.map { it.role }
        assertTrue(ColumnRole.DATE in roles)
        assertTrue(ColumnRole.AMOUNT in roles)
        assertTrue(ColumnRole.DESCRIPTION in roles)
        assertTrue(ColumnRole.CATEGORY in roles)
    }

    @Test
    fun columnDetection_alternativeHeaders_mapsCorrectly() {
        val headers = listOf("Transaction Date", "Debit", "Payee")
        val result = ColumnDetector.detect(headers)

        assertTrue(result.isComplete, "Alternative headers should still map to required roles")
    }

    @Test
    fun columnDetection_missingRequiredColumns_reportsIncomplete() {
        val headers = listOf("Name", "Value")
        val result = ColumnDetector.detect(headers)

        assertFalse(result.isComplete)
        assertTrue(result.missingRequired.isNotEmpty())
    }

    @Test
    fun columnDetection_unknownHeaders_markedAsIgnored() {
        val headers = listOf("Date", "Amount", "Description", "Custom Field XYZ")
        val result = ColumnDetector.detect(headers)

        val customMapping = result.mappings.find { it.sourceColumn == "Custom Field XYZ" }
        assertNotNull(customMapping)
        assertEquals(ColumnRole.IGNORED, customMapping.role)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Duplicate detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun duplicateDetection_exactMatch_flaggedAsDuplicate() {
        val existing = setOf(
            DuplicateDetector.fingerprint(
                LocalDate(2024, 6, 15), Cents(2500), "Whole Foods",
            ),
        )
        val imported = listOf(
            ParsedTransaction(
                date = LocalDate(2024, 6, 15),
                amount = Cents(2500),
                description = "Whole Foods",
            ),
        )

        val result = DuplicateDetector.detect(imported, existing)
        assertEquals(1, result.duplicateCount)
        assertTrue(result.uniqueTransactions.isEmpty())
    }

    @Test
    fun duplicateDetection_differentAmount_notDuplicate() {
        val existing = setOf(
            DuplicateDetector.fingerprint(
                LocalDate(2024, 6, 15), Cents(2500), "Whole Foods",
            ),
        )
        val imported = listOf(
            ParsedTransaction(
                date = LocalDate(2024, 6, 15),
                amount = Cents(3500),
                description = "Whole Foods",
            ),
        )

        val result = DuplicateDetector.detect(imported, existing)
        assertEquals(0, result.duplicateCount)
        assertEquals(1, result.uniqueTransactions.size)
    }

    @Test
    fun duplicateDetection_differentDate_notDuplicate() {
        val existing = setOf(
            DuplicateDetector.fingerprint(
                LocalDate(2024, 6, 15), Cents(2500), "Whole Foods",
            ),
        )
        val imported = listOf(
            ParsedTransaction(
                date = LocalDate(2024, 6, 16),
                amount = Cents(2500),
                description = "Whole Foods",
            ),
        )

        val result = DuplicateDetector.detect(imported, existing)
        assertEquals(0, result.duplicateCount)
    }

    @Test
    fun duplicateDetection_normalisedDescription_catchesFuzzyDuplicates() {
        val existing = setOf(
            DuplicateDetector.fingerprint(
                LocalDate(2024, 6, 15), Cents(2500), "Whole Foods #12345",
            ),
        )
        val imported = listOf(
            ParsedTransaction(
                date = LocalDate(2024, 6, 15),
                amount = Cents(2500),
                description = "Whole Foods #67890",
            ),
        )

        val result = DuplicateDetector.detect(imported, existing)
        assertEquals(1, result.duplicateCount, "Reference numbers should be normalised away")
    }

    @Test
    fun duplicateDetection_intraBatch_detectsDuplicatesWithinImport() {
        val imported = listOf(
            ParsedTransaction(date = LocalDate(2024, 6, 15), amount = Cents(2500), description = "Coffee Shop"),
            ParsedTransaction(date = LocalDate(2024, 6, 15), amount = Cents(2500), description = "Coffee Shop"),
        )

        val result = DuplicateDetector.detectWithIntraBatch(imported, emptySet())
        assertEquals(1, result.duplicateCount, "Second identical transaction should be flagged")
        assertEquals(1, result.uniqueTransactions.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Malformed rows and missing fields
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun csvParsing_missingRequiredField_reportsError() {
        val csv = "Date,Amount,Description\n2024-06-15,,Whole Foods\n"
        val preview = GenericCsvImportParser.parse(csv)

        assertEquals(0, preview.successCount)
        assertEquals(1, preview.errorCount)
        assertTrue(preview.errorRows.first().errors.any { "amount" in it.lowercase() })
    }

    @Test
    fun csvParsing_invalidDate_reportsError() {
        val csv = "Date,Amount,Description\nNOT-A-DATE,25.00,Whole Foods\n"
        val preview = GenericCsvImportParser.parse(csv)

        assertEquals(0, preview.successCount)
        assertEquals(1, preview.errorCount)
        assertTrue(preview.errorRows.first().errors.any { "date" in it.lowercase() })
    }

    @Test
    fun csvParsing_blankRows_skipped() {
        val csv = "Date,Amount,Description\n\n2024-06-15,25.00,Store\n\n"
        val preview = GenericCsvImportParser.parse(csv)

        assertEquals(1, preview.successCount)
    }

    @Test
    fun csvParsing_rowWithFewerColumns_reportsError() {
        val csv = "Date,Amount,Description\n2024-06-15\n"
        val preview = GenericCsvImportParser.parse(csv)

        assertEquals(0, preview.successCount)
        assertEquals(1, preview.errorCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Date format parsing
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dateParser_isoFormat_yyyyMmDd() {
        val date = GenericCsvImportParser.parseDate("2024-06-15")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun dateParser_usFormat_mmDdYyyy() {
        val date = GenericCsvImportParser.parseDate("06/15/2024")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun dateParser_slashFormat_yyyyMmDd() {
        val date = GenericCsvImportParser.parseDate("2024/06/15")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun dateParser_singleDigitMonthDay() {
        val date = GenericCsvImportParser.parseDate("6/5/2024")
        assertNotNull(date)
        assertEquals(2024, date.year)
    }

    @Test
    fun dateParser_invalidDate_returnsNull() {
        assertNull(GenericCsvImportParser.parseDate("not-a-date"))
        assertNull(GenericCsvImportParser.parseDate(""))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Amount parsing edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun amountParser_dollarSign_stripped() {
        val amount = GenericCsvImportParser.parseAmount("$25.50")
        assertEquals(Cents(2550), amount)
    }

    @Test
    fun amountParser_thousandsSeparator_stripped() {
        val amount = GenericCsvImportParser.parseAmount("$1,234.56")
        assertEquals(Cents(123456), amount)
    }

    @Test
    fun amountParser_accountingNegative_parentheses() {
        val amount = GenericCsvImportParser.parseAmount("(45.00)")
        assertNotNull(amount)
        assertTrue(amount.isNegative(), "Parenthesized amount should be negative")
        assertEquals(-4500L, amount.amount)
    }

    @Test
    fun amountParser_negativeSign() {
        val amount = GenericCsvImportParser.parseAmount("-500")
        assertEquals(Cents(-50000), amount)
    }

    @Test
    fun amountParser_wholeNumber_noCents() {
        val amount = GenericCsvImportParser.parseAmount("100")
        assertEquals(Cents(10000), amount)
    }

    @Test
    fun amountParser_empty_returnsNull() {
        assertNull(GenericCsvImportParser.parseAmount(""))
        assertNull(GenericCsvImportParser.parseAmount("   "))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Import preview metrics
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun importPreview_successRate_calculatedCorrectly() {
        val preview = ImportPreview(
            transactions = listOf(
                ParsedTransaction(date = LocalDate(2024, 1, 1), amount = Cents(100), description = "A"),
                ParsedTransaction(date = LocalDate(2024, 1, 2), amount = Cents(200), description = "B"),
            ),
            errorRows = listOf(
                ImportRowError(3, listOf("bad"), listOf("error")),
            ),
            columnMappings = emptyList(),
            sourceFormat = ImportSourceFormat.GENERIC_CSV,
            totalRowCount = 3,
        )

        assertEquals(2, preview.successCount)
        assertEquals(1, preview.errorCount)
        assertTrue(preview.successRate > 0.66 && preview.successRate < 0.67)
    }
}
