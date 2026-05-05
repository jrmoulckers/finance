// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ImportEngineTest {

    // ═════════════════════════════════════════════════════════════════
    // Format detection
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun detectFormat_mintCsv() {
        val csv = "Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes\n" +
            "01/15/2024,Coffee Shop,COFFEE SHOP #123,4.50,debit,Food & Dining,Checking,,\n"
        assertEquals(ImportSourceFormat.MINT, ImportEngine.detectFormat(csv))
    }

    @Test
    fun detectFormat_ynab4Csv() {
        val csv = "Account,Flag,Date,Payee,Category Group/Category,Master Category,Sub Category,Memo,Outflow,Inflow,Cleared\n" +
            "Checking,,01/15/2024,Coffee Shop,Food:Coffee,,Coffee,,4.50,,Cleared\n"
        assertEquals(ImportSourceFormat.YNAB4, ImportEngine.detectFormat(csv))
    }

    @Test
    fun detectFormat_nynabJson() {
        val json = """{"transactions": [{"date": "2024-01-15", "amount": -4500, "payee_name": "Coffee"}]}"""
        assertEquals(ImportSourceFormat.NYNAB, ImportEngine.detectFormat(json))
    }

    @Test
    fun detectFormat_genericCsv() {
        val csv = "Date,Amount,Description,Category\n2024-01-15,-25.00,Grocery Store,Food\n"
        assertEquals(ImportSourceFormat.GENERIC_CSV, ImportEngine.detectFormat(csv))
    }

    @Test
    fun detectFormat_blankContent() {
        assertEquals(ImportSourceFormat.GENERIC_CSV, ImportEngine.detectFormat(""))
    }

    // ═════════════════════════════════════════════════════════════════
    // Generic CSV import
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun genericCsv_parsesBasicTransactions() {
        val csv = "Date,Amount,Description,Category\n" +
            "2024-01-15,-25.00,Grocery Store,Food\n" +
            "2024-01-16,1500.00,Salary,Income\n"

        val preview = ImportEngine.importFile(csv)
        assertEquals(ImportSourceFormat.GENERIC_CSV, preview.sourceFormat)
        assertEquals(2, preview.successCount)
        assertEquals(0, preview.errorCount)

        val tx1 = preview.transactions[0]
        assertEquals(LocalDate(2024, 1, 15), tx1.date)
        assertEquals(Cents(-2500L), tx1.amount)
        assertEquals("Grocery Store", tx1.description)
        assertEquals("Food", tx1.category)

        val tx2 = preview.transactions[1]
        assertEquals(Cents(150000L), tx2.amount)
    }

    @Test
    fun genericCsv_handlesSlashDates() {
        val csv = "Date,Amount,Description\n" +
            "01/15/2024,-10.00,Coffee\n" +
            "2024/02/28,20.00,Refund\n"

        val preview = ImportEngine.importFile(csv)
        assertEquals(2, preview.successCount)
        assertEquals(LocalDate(2024, 1, 15), preview.transactions[0].date)
        assertEquals(LocalDate(2024, 2, 28), preview.transactions[1].date)
    }

    @Test
    fun genericCsv_reportsErrorRows() {
        val csv = "Date,Amount,Description\n" +
            "2024-01-15,-25.00,Valid Row\n" +
            "not-a-date,abc,Bad Row\n" +
            "2024-01-17,,Missing Amount\n"

        val preview = ImportEngine.importFile(csv)
        assertEquals(1, preview.successCount)
        assertEquals(2, preview.errorCount)
        assertEquals(3, preview.totalRowCount)
    }

    @Test
    fun genericCsv_handlesAccountingNegative() {
        val csv = "Date,Amount,Description\n2024-01-15,(45.00),Returns\n"
        val preview = ImportEngine.importFile(csv)
        assertEquals(1, preview.successCount)
        assertEquals(Cents(-4500L), preview.transactions[0].amount)
    }

    @Test
    fun genericCsv_handlesCurrencySymbols() {
        val csv = "Date,Amount,Description\n2024-01-15,\"$1,234.56\",Big Purchase\n"
        val preview = ImportEngine.importFile(csv)
        assertEquals(1, preview.successCount)
        assertEquals(Cents(123456L), preview.transactions[0].amount)
    }

    @Test
    fun genericCsv_emptyContent() {
        val preview = ImportEngine.importFile("")
        assertEquals(0, preview.totalRowCount)
        assertEquals(0, preview.successCount)
    }

    @Test
    fun genericCsv_customColumnMappings() {
        val csv = "TransDate,Value,Merchant,Type\n2024-01-15,-10.00,Coffee,Expense\n"
        val mappings = listOf(
            ColumnMapping("TransDate", ColumnRole.DATE),
            ColumnMapping("Value", ColumnRole.AMOUNT),
            ColumnMapping("Merchant", ColumnRole.DESCRIPTION),
            ColumnMapping("Type", ColumnRole.TYPE),
        )

        val preview = GenericCsvImportParser.parse(csv, mappings)
        assertEquals(1, preview.successCount)
        assertEquals("Coffee", preview.transactions[0].description)
    }

    // ═════════════════════════════════════════════════════════════════
    // Mint import
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun mint_parsesStandardExport() {
        val csv = "Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes\n" +
            "01/15/2024,Coffee Shop,COFFEE SHOP #123,4.50,debit,Food & Dining,Checking,,\n" +
            "01/16/2024,Direct Deposit,EMPLOYER PAYROLL,2500.00,credit,Income,Checking,,\n"

        val preview = ImportEngine.importFile(csv)
        assertEquals(ImportSourceFormat.MINT, preview.sourceFormat)
        assertEquals(2, preview.successCount)

        // Debit should be negative
        assertTrue(preview.transactions[0].amount.isNegative())
        assertEquals("Coffee Shop", preview.transactions[0].description)

        // Credit should be positive
        assertTrue(preview.transactions[1].amount.isPositive())
    }

    @Test
    fun mint_preservesOriginalDescription() {
        val csv = "Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes\n" +
            "01/15/2024,Coffee Shop,COFFEE SHOP #123 TXN987,4.50,debit,Food & Dining,Checking,,\n"

        val preview = MintImportParser.parse(csv)
        assertNotNull(preview.transactions[0].note)
        assertTrue(preview.transactions[0].note!!.contains("COFFEE SHOP #123 TXN987"))
    }

    @Test
    fun mint_detect_returnsTrueForMintHeaders() {
        val headers = listOf("Date", "Description", "Original Description", "Amount", "Transaction Type", "Category", "Account Name", "Labels", "Notes")
        assertTrue(MintImportParser.detect(headers))
    }

    @Test
    fun mint_detect_returnsFalseForNonMintHeaders() {
        val headers = listOf("Date", "Payee", "Outflow", "Inflow")
        assertFalse(MintImportParser.detect(headers))
    }

    // ═════════════════════════════════════════════════════════════════
    // YNAB CSV import
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun ynabCsv_parsesYnab4Format() {
        val csv = "Account,Flag,Date,Payee,Category Group/Category,Master Category,Sub Category,Memo,Outflow,Inflow,Cleared\n" +
            "Checking,,01/15/2024,Coffee Shop,Food:Coffee,Food,Coffee,Morning latte,4.50,,Cleared\n" +
            "Checking,,01/16/2024,Employer,,Income,Salary,Monthly pay,,2500.00,Cleared\n"

        val preview = ImportEngine.importFile(csv)
        assertEquals(ImportSourceFormat.YNAB4, preview.sourceFormat)
        assertEquals(2, preview.successCount)

        // Outflow → negative
        assertTrue(preview.transactions[0].amount.isNegative())
        assertEquals("Coffee Shop", preview.transactions[0].description)

        // Inflow → positive
        assertTrue(preview.transactions[1].amount.isPositive())
    }

    @Test
    fun ynabCsv_parsesNynabFormat() {
        val csv = "Account,Flag,Date,Payee,Category Group/Category,Category Group,Category,Memo,Outflow,Inflow,Cleared\n" +
            "Checking,,01/15/2024,Grocery Store,Food:Groceries,Food,Groceries,Weekly shop,85.50,,Cleared\n"

        val preview = YnabImportParser.parseCsv(csv)
        assertEquals(ImportSourceFormat.NYNAB, preview.sourceFormat)
        assertEquals(1, preview.successCount)
    }

    // ═════════════════════════════════════════════════════════════════
    // YNAB JSON import
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun ynabJson_parsesNynabBudgetExport() {
        val json = """{
            "transactions": [
                {
                    "date": "2024-01-15",
                    "amount": -45000,
                    "payee_name": "Coffee Shop",
                    "category_name": "Food & Dining",
                    "memo": "Morning coffee",
                    "account_name": "Checking",
                    "cleared": "cleared"
                },
                {
                    "date": "2024-01-16",
                    "amount": 25000000,
                    "payee_name": "Employer",
                    "category_name": "Income",
                    "memo": "Monthly salary",
                    "account_name": "Checking",
                    "cleared": "cleared"
                }
            ]
        }"""

        val preview = ImportEngine.importFile(json)
        assertEquals(ImportSourceFormat.NYNAB, preview.sourceFormat)
        assertEquals(2, preview.successCount)

        // -45000 milliunits = -4500 cents = -$45.00
        assertEquals(Cents(-4500L), preview.transactions[0].amount)
        assertEquals("Coffee Shop", preview.transactions[0].description)

        // 25000000 milliunits = 2500000 cents = $25,000.00
        assertEquals(Cents(2500000L), preview.transactions[1].amount)
    }

    @Test
    fun ynabJson_detectsJsonFormat() {
        val json = """{"transactions": []}"""
        assertTrue(YnabImportParser.detectJson(json))
    }

    @Test
    fun ynabJson_rejectsNonYnabJson() {
        val json = """{"accounts": []}"""
        assertFalse(YnabImportParser.detectJson(json))
    }

    // ═════════════════════════════════════════════════════════════════
    // Column detection
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun columnDetector_detectsStandardHeaders() {
        val headers = listOf("Date", "Amount", "Description", "Category", "Notes")
        val result = ColumnDetector.detect(headers)

        assertTrue(result.isComplete)
        assertEquals(0, result.missingRequired.size)

        val roles = result.mappings.associate { it.sourceColumn to it.role }
        assertEquals(ColumnRole.DATE, roles["Date"])
        assertEquals(ColumnRole.AMOUNT, roles["Amount"])
        assertEquals(ColumnRole.DESCRIPTION, roles["Description"])
        assertEquals(ColumnRole.CATEGORY, roles["Category"])
    }

    @Test
    fun columnDetector_handlesCaseInsensitiveHeaders() {
        val headers = listOf("DATE", "AMOUNT", "DESCRIPTION")
        val result = ColumnDetector.detect(headers)
        assertTrue(result.isComplete)
    }

    @Test
    fun columnDetector_reportsMissingRequired() {
        val headers = listOf("Date", "Category", "Notes")
        val result = ColumnDetector.detect(headers)
        assertFalse(result.isComplete)
        assertTrue(ColumnRole.AMOUNT in result.missingRequired)
        assertTrue(ColumnRole.DESCRIPTION in result.missingRequired)
    }

    @Test
    fun columnDetector_handlesAlternateNames() {
        val headers = listOf("Transaction Date", "Debit", "Payee", "Memo")
        val result = ColumnDetector.detect(headers)
        assertTrue(result.isComplete)
    }

    // ═════════════════════════════════════════════════════════════════
    // Duplicate detection
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun duplicateDetector_findsDuplicates() {
        val existing = setOf(
            DuplicateDetector.fingerprint(LocalDate(2024, 1, 15), Cents(-2500L), "Grocery Store"),
        )

        val imported = listOf(
            ParsedTransaction(
                date = LocalDate(2024, 1, 15),
                amount = Cents(-2500L),
                description = "Grocery Store",
            ),
            ParsedTransaction(
                date = LocalDate(2024, 1, 16),
                amount = Cents(-1000L),
                description = "Coffee Shop",
            ),
        )

        val result = DuplicateDetector.detect(imported, existing)
        assertEquals(1, result.duplicateCount)
        assertEquals(1, result.uniqueTransactions.size)
        assertEquals(1, result.duplicateTransactions.size)
        assertEquals("Coffee Shop", result.uniqueTransactions[0].description)
    }

    @Test
    fun duplicateDetector_findsIntraBatchDuplicates() {
        val imported = listOf(
            ParsedTransaction(date = LocalDate(2024, 1, 15), amount = Cents(-2500L), description = "Store"),
            ParsedTransaction(date = LocalDate(2024, 1, 15), amount = Cents(-2500L), description = "Store"),
            ParsedTransaction(date = LocalDate(2024, 1, 16), amount = Cents(-1000L), description = "Coffee"),
        )

        val result = DuplicateDetector.detectWithIntraBatch(imported, emptySet())
        assertEquals(1, result.duplicateCount)
        assertEquals(2, result.uniqueTransactions.size)
    }

    @Test
    fun duplicateDetector_normalisesDescriptions() {
        val fp = DuplicateDetector.fingerprint(
            LocalDate(2024, 1, 15),
            Cents(-2500L),
            "  GROCERY  STORE  #12345  ",
        )
        assertEquals("grocery store", fp.normalisedDescription)
    }

    // ═════════════════════════════════════════════════════════════════
    // Category mapping
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun categoryMapper_exactMatch() {
        val appCategories = listOf(
            CategoryMapper.AppCategory("cat-1", "Food & Dining"),
            CategoryMapper.AppCategory("cat-2", "Transportation"),
        )

        val result = CategoryMapper.map(
            sourceCategories = listOf("Food & Dining", "Unknown"),
            appCategories = appCategories,
        )

        assertEquals(1, result.mappedCount)
        assertEquals("cat-1", result.mappings[0].targetCategoryId)
        assertEquals(1.0, result.mappings[0].confidence)
        assertNull(result.mappings[1].targetCategoryId)
        assertEquals(listOf("Unknown"), result.unmappedCategories)
    }

    @Test
    fun categoryMapper_userOverrideTakesPrecedence() {
        val appCategories = listOf(
            CategoryMapper.AppCategory("cat-1", "Food"),
            CategoryMapper.AppCategory("cat-2", "Dining"),
        )

        val result = CategoryMapper.map(
            sourceCategories = listOf("Food"),
            appCategories = appCategories,
            userOverrides = mapOf("Food" to "cat-2"),
        )

        assertEquals("cat-2", result.mappings[0].targetCategoryId)
        assertTrue(result.mappings[0].isUserOverride)
    }

    @Test
    fun categoryMapper_keywordMatch() {
        val appCategories = listOf(
            CategoryMapper.AppCategory("cat-1", "Groceries"),
        )

        val result = CategoryMapper.map(
            sourceCategories = listOf("Supermarket"),
            appCategories = appCategories,
        )

        assertEquals(1, result.mappedCount)
        assertEquals("cat-1", result.mappings[0].targetCategoryId)
        assertTrue(result.mappings[0].confidence < 1.0)
    }

    // ═════════════════════════════════════════════════════════════════
    // Import preview
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importPreview_successRate() {
        val preview = ImportPreview(
            transactions = listOf(
                ParsedTransaction(date = LocalDate(2024, 1, 15), amount = Cents(-100L), description = "A"),
                ParsedTransaction(date = LocalDate(2024, 1, 16), amount = Cents(-200L), description = "B"),
            ),
            errorRows = listOf(ImportRowError(3, listOf("bad"), listOf("error"))),
            columnMappings = emptyList(),
            sourceFormat = ImportSourceFormat.GENERIC_CSV,
            totalRowCount = 3,
        )

        assertEquals(2, preview.successCount)
        assertEquals(1, preview.errorCount)
        assertTrue(preview.successRate > 0.6)
        assertTrue(preview.successRate < 0.7)
    }

    // ═════════════════════════════════════════════════════════════════
    // Date parsing edge cases
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseDate_isoFormat() {
        assertEquals(LocalDate(2024, 3, 15), GenericCsvImportParser.parseDate("2024-03-15"))
    }

    @Test
    fun parseDate_usSlashFormat() {
        assertEquals(LocalDate(2024, 1, 15), GenericCsvImportParser.parseDate("01/15/2024"))
    }

    @Test
    fun parseDate_yearSlashFormat() {
        assertEquals(LocalDate(2024, 2, 28), GenericCsvImportParser.parseDate("2024/02/28"))
    }

    @Test
    fun parseDate_invalidReturnsNull() {
        assertNull(GenericCsvImportParser.parseDate("not-a-date"))
    }

    // ═════════════════════════════════════════════════════════════════
    // Amount parsing edge cases
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun parseAmount_simpleNegative() {
        assertEquals(Cents(-2500L), GenericCsvImportParser.parseAmount("-25.00"))
    }

    @Test
    fun parseAmount_accountingNegative() {
        assertEquals(Cents(-4500L), GenericCsvImportParser.parseAmount("(45.00)"))
    }

    @Test
    fun parseAmount_withCurrencySymbol() {
        assertEquals(Cents(123456L), GenericCsvImportParser.parseAmount("$1,234.56"))
    }

    @Test
    fun parseAmount_wholeNumber() {
        assertEquals(Cents(50000L), GenericCsvImportParser.parseAmount("500"))
    }

    @Test
    fun parseAmount_emptyReturnsNull() {
        assertNull(GenericCsvImportParser.parseAmount(""))
    }

    // ═════════════════════════════════════════════════════════════════
    // Large dataset handling
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun genericCsv_handles10kRows() {
        val header = "Date,Amount,Description\n"
        val rows = (1..10_000).joinToString("\n") { i ->
            "2024-01-${(i % 28 + 1).toString().padStart(2, '0')},-${i}.00,Merchant $i"
        }
        val csv = header + rows

        val preview = ImportEngine.importFile(csv)
        assertEquals(10_000, preview.successCount)
        assertEquals(0, preview.errorCount)
    }

    // ═════════════════════════════════════════════════════════════════
    // Duplicate detection with engine
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importEngine_applyDuplicateDetection() {
        val csv = "Date,Amount,Description\n" +
            "2024-01-15,-25.00,Grocery Store\n" +
            "2024-01-16,-10.00,Coffee\n"

        val preview = ImportEngine.importFile(csv)
        val existing = setOf(
            DuplicateDetector.fingerprint(LocalDate(2024, 1, 15), Cents(-2500L), "Grocery Store"),
        )

        val updated = ImportEngine.applyDuplicateDetection(preview, existing)
        assertEquals(1, updated.duplicateCount)
    }

    // ═════════════════════════════════════════════════════════════════
    // Category mapping with engine
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun importEngine_mapCategories() {
        val csv = "Date,Amount,Description,Category\n" +
            "2024-01-15,-25.00,Store,Food\n" +
            "2024-01-16,-10.00,Coffee,Dining\n"

        val preview = ImportEngine.importFile(csv)
        val appCategories = listOf(
            CategoryMapper.AppCategory("cat-1", "Food"),
            CategoryMapper.AppCategory("cat-2", "Entertainment"),
        )

        val result = ImportEngine.mapCategories(preview, appCategories)
        assertEquals(2, result.mappings.size)
        assertEquals("cat-1", result.mappings.first { it.sourceCategory == "Food" }.targetCategoryId)
    }
}
