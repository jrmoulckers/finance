package com.finance.core.data

import com.finance.core.TestFixtures
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.*

class CsvImporterTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // parseHeaders()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun parseHeaders_standardCsv() {
        val headers = CsvImporter.parseHeaders("Date,Amount,Payee,Category")
        assertEquals(listOf("Date", "Amount", "Payee", "Category"), headers)
    }

    @Test
    fun parseHeaders_quotedHeaders() {
        val headers = CsvImporter.parseHeaders("\"Date\",\"Amount\",\"Payee Name\"")
        assertEquals(listOf("Date", "Amount", "Payee Name"), headers)
    }

    @Test
    fun parseHeaders_trailingWhitespace() {
        val headers = CsvImporter.parseHeaders("  Date , Amount ,Payee  ")
        assertEquals(listOf("Date", "Amount", "Payee"), headers)
    }

    @Test
    fun parseHeaders_emptyLine() {
        assertEquals(emptyList(), CsvImporter.parseHeaders(""))
        assertEquals(emptyList(), CsvImporter.parseHeaders("   "))
    }

    @Test
    fun parseHeaders_singleColumn() {
        assertEquals(listOf("Date"), CsvImporter.parseHeaders("Date"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // mapColumns()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun mapColumns_standardHeaders() {
        val mapping = CsvImporter.mapColumns(listOf("Date", "Amount", "Payee", "Category", "Note"))
        assertEquals(0, mapping.dateColumn)
        assertEquals(1, mapping.amountColumn)
        assertEquals(2, mapping.payeeColumn)
        assertEquals(3, mapping.categoryColumn)
        assertEquals(4, mapping.noteColumn)
    }

    @Test
    fun mapColumns_bankStyleHeaders() {
        val mapping = CsvImporter.mapColumns(
            listOf("Posting Date", "Transaction Amount", "Description", "Memo")
        )
        assertEquals(0, mapping.dateColumn)
        assertEquals(1, mapping.amountColumn)
        assertEquals(2, mapping.payeeColumn)
        assertEquals(3, mapping.noteColumn)
    }

    @Test
    fun mapColumns_caseInsensitive() {
        val mapping = CsvImporter.mapColumns(listOf("DATE", "AMOUNT", "PAYEE"))
        assertEquals(0, mapping.dateColumn)
        assertEquals(1, mapping.amountColumn)
        assertEquals(2, mapping.payeeColumn)
    }

    @Test
    fun mapColumns_missingDate_throws() {
        assertFailsWith<IllegalArgumentException> {
            CsvImporter.mapColumns(listOf("Amount", "Payee"))
        }
    }

    @Test
    fun mapColumns_missingAmount_throws() {
        assertFailsWith<IllegalArgumentException> {
            CsvImporter.mapColumns(listOf("Date", "Payee"))
        }
    }

    @Test
    fun mapColumns_optionalColumnsAbsent() {
        val mapping = CsvImporter.mapColumns(listOf("Date", "Amount"))
        assertEquals(0, mapping.dateColumn)
        assertEquals(1, mapping.amountColumn)
        assertNull(mapping.payeeColumn)
        assertNull(mapping.categoryColumn)
        assertNull(mapping.noteColumn)
    }

    // ═══════════════════════════════════════════════════════════════════
    // parseDate()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun parseDate_isoFormat() {
        val date = CsvImporter.parseDate("2024-06-15")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun parseDate_usSlashFormat() {
        val date = CsvImporter.parseDate("06/15/2024")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun parseDate_usSlashShortYear() {
        val date = CsvImporter.parseDate("06/15/24")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun parseDate_euDotFormat() {
        val date = CsvImporter.parseDate("15.06.2024")
        assertEquals(LocalDate(2024, 6, 15), date)
    }

    @Test
    fun parseDate_singleDigitMonthDay() {
        val date = CsvImporter.parseDate("6/5/2024")
        assertEquals(LocalDate(2024, 6, 5), date)
    }

    @Test
    fun parseDate_invalidDate() {
        assertNull(CsvImporter.parseDate("not-a-date"))
        assertNull(CsvImporter.parseDate(""))
        assertNull(CsvImporter.parseDate("13/32/2024"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // parseAmount()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun parseAmount_simple() {
        assertEquals(Cents(1234), CsvImporter.parseAmount("12.34"))
    }

    @Test
    fun parseAmount_negative() {
        assertEquals(Cents(-1234), CsvImporter.parseAmount("-12.34"))
    }

    @Test
    fun parseAmount_parenthesesNegative() {
        assertEquals(Cents(-1234), CsvImporter.parseAmount("(12.34)"))
    }

    @Test
    fun parseAmount_withCurrencySymbol() {
        assertEquals(Cents(1234), CsvImporter.parseAmount("$12.34"))
        assertEquals(Cents(1234), CsvImporter.parseAmount("€12.34"))
    }

    @Test
    fun parseAmount_withThousandsSeparator() {
        assertEquals(Cents(123456), CsvImporter.parseAmount("1,234.56"))
    }

    @Test
    fun parseAmount_euFormat() {
        assertEquals(Cents(123456), CsvImporter.parseAmount("1.234,56"))
    }

    @Test
    fun parseAmount_wholeNumber() {
        assertEquals(Cents(1200), CsvImporter.parseAmount("12"))
    }

    @Test
    fun parseAmount_invalid() {
        assertNull(CsvImporter.parseAmount(""))
        assertNull(CsvImporter.parseAmount("abc"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // importTransactions() — end-to-end
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun importTransactions_basicCsv() {
        val csv = """
            Date,Amount,Payee,Note
            2024-06-15,25.00,Coffee Shop,Morning latte
            2024-06-16,-42.50,Grocery Store,Weekly groceries
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2, noteColumn = 3)
        val accountId = SyncId("acct-1")

        val result = CsvImporter.importTransactions(csv, mapping, accountId)

        assertEquals(2, result.importedCount)
        assertEquals(0, result.errorCount)
        assertEquals(0, result.skippedCount)

        val first = result.imported[0]
        assertEquals(LocalDate(2024, 6, 15), first.date)
        assertEquals(Cents(2500), first.amount)
        assertEquals("Coffee Shop", first.payee)
        assertEquals(TransactionType.INCOME, first.type)

        val second = result.imported[1]
        assertEquals(LocalDate(2024, 6, 16), second.date)
        assertEquals(Cents(4250), second.amount) // stored as positive
        assertEquals("Grocery Store", second.payee)
        assertEquals(TransactionType.EXPENSE, second.type)
    }

    @Test
    fun importTransactions_withExistingDuplicates() {
        val csv = """
            Date,Amount,Payee
            2024-06-15,25.00,Coffee Shop
        """.trimIndent()

        val existing = listOf(
            TestFixtures.createTransaction(
                date = LocalDate(2024, 6, 15),
                amount = Cents(2500),
                payee = "Coffee Shop",
                type = TransactionType.INCOME,
            )
        )

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2)
        val result = CsvImporter.importTransactions(
            csv, mapping, SyncId("acct-1"),
            existingTransactions = existing,
        )

        assertEquals(0, result.importedCount)
        assertEquals(1, result.skippedCount)
        assertEquals(1, result.duplicates.size)
    }

    @Test
    fun importTransactions_invalidRows_recordedAsErrors() {
        val csv = """
            Date,Amount,Payee
            2024-06-15,25.00,Valid
            not-a-date,abc,Invalid
            2024-06-17,10.00,Also Valid
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2)
        val result = CsvImporter.importTransactions(csv, mapping, SyncId("acct-1"))

        assertEquals(2, result.importedCount)
        assertEquals(1, result.errorCount)
        assertEquals(2, result.errors[0].row)
    }

    @Test
    fun importTransactions_emptyFile() {
        val result = CsvImporter.importTransactions(
            csv = "Date,Amount",
            mapping = ColumnMapping(dateColumn = 0, amountColumn = 1),
            accountId = SyncId("acct-1"),
        )

        assertEquals(0, result.importedCount)
        assertEquals(1, result.errorCount)
        assertTrue(result.errors[0].message.contains("no data rows"))
    }

    @Test
    fun importTransactions_usDateFormat() {
        val csv = """
            Date,Amount
            06/15/2024,50.00
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1)
        val result = CsvImporter.importTransactions(csv, mapping, SyncId("acct-1"))

        assertEquals(1, result.importedCount)
        assertEquals(LocalDate(2024, 6, 15), result.imported[0].date)
    }

    @Test
    fun importTransactions_euDateAndAmountFormat() {
        val csv = """
            Date,Amount
            15.06.2024,"1.234,56"
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1)
        val result = CsvImporter.importTransactions(csv, mapping, SyncId("acct-1"))

        assertEquals(1, result.importedCount)
        assertEquals(LocalDate(2024, 6, 15), result.imported[0].date)
        assertEquals(Cents(123456), result.imported[0].amount)
    }

    @Test
    fun importTransactions_quotedFieldWithComma() {
        val csv = """
            Date,Amount,Payee
            2024-06-15,25.00,"Smith, John"
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2)
        val result = CsvImporter.importTransactions(csv, mapping, SyncId("acct-1"))

        assertEquals(1, result.importedCount)
        assertEquals("Smith, John", result.imported[0].payee)
    }

    @Test
    fun importTransactions_customCurrency() {
        val csv = """
            Date,Amount
            2024-06-15,100.00
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1)
        val result = CsvImporter.importTransactions(
            csv, mapping, SyncId("acct-1"),
            currency = Currency.EUR,
        )

        assertEquals(1, result.importedCount)
        assertEquals(Currency.EUR, result.imported[0].currency)
    }

    @Test
    fun importTransactions_tooFewColumns_errorNotCrash() {
        val csv = """
            Date,Amount,Payee
            2024-06-15
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2)
        val result = CsvImporter.importTransactions(csv, mapping, SyncId("acct-1"))

        assertEquals(0, result.importedCount)
        assertEquals(1, result.errorCount)
    }

    @Test
    fun importTransactions_categoryInNote() {
        val csv = """
            Date,Amount,Payee,Category,Note
            2024-06-15,25.00,Shop,Food,Lunch
        """.trimIndent()

        val mapping = ColumnMapping(
            dateColumn = 0, amountColumn = 1, payeeColumn = 2,
            categoryColumn = 3, noteColumn = 4,
        )
        val result = CsvImporter.importTransactions(csv, mapping, SyncId("acct-1"))

        assertEquals(1, result.importedCount)
        assertTrue(result.imported[0].note?.contains("Category: Food") == true)
        assertTrue(result.imported[0].note?.contains("Lunch") == true)
    }

    // ═══════════════════════════════════════════════════════════════════
    // detectDuplicates()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectDuplicates_noExisting_noDuplicates() {
        val imported = listOf(
            TestFixtures.createTransaction(date = LocalDate(2024, 6, 15), amount = Cents(1000))
        )
        val result = CsvImporter.detectDuplicates(imported, emptyList())
        assertTrue(result.isEmpty())
    }

    @Test
    fun detectDuplicates_matchByDateAmountPayee() {
        val txn = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 15),
            amount = Cents(2500),
            payee = "Coffee Shop",
            type = TransactionType.INCOME,
        )
        val existing = listOf(txn.copy(id = SyncId("existing-1")))

        val result = CsvImporter.detectDuplicates(listOf(txn), existing)
        assertEquals(1, result.size)
        assertEquals(txn.id, result[0].imported.id)
        assertEquals(SyncId("existing-1"), result[0].existing.id)
    }

    @Test
    fun detectDuplicates_caseInsensitivePayee() {
        val imported = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 15),
            amount = Cents(2500),
            payee = "COFFEE SHOP",
            type = TransactionType.INCOME,
        )
        val existing = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 15),
            amount = Cents(2500),
            payee = "coffee shop",
            type = TransactionType.INCOME,
        )

        val result = CsvImporter.detectDuplicates(listOf(imported), listOf(existing))
        assertEquals(1, result.size)
    }

    @Test
    fun detectDuplicates_differentAmount_notDuplicate() {
        val imported = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 15),
            amount = Cents(2500),
            payee = "Coffee Shop",
            type = TransactionType.INCOME,
        )
        val existing = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 15),
            amount = Cents(3000),
            payee = "Coffee Shop",
            type = TransactionType.INCOME,
        )

        val result = CsvImporter.detectDuplicates(listOf(imported), listOf(existing))
        assertTrue(result.isEmpty())
    }

    @Test
    fun detectDuplicates_differentDate_notDuplicate() {
        val imported = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 15),
            amount = Cents(2500),
            payee = "Coffee Shop",
            type = TransactionType.INCOME,
        )
        val existing = TestFixtures.createTransaction(
            date = LocalDate(2024, 6, 16),
            amount = Cents(2500),
            payee = "Coffee Shop",
            type = TransactionType.INCOME,
        )

        val result = CsvImporter.detectDuplicates(listOf(imported), listOf(existing))
        assertTrue(result.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // parseCsvLine() — RFC 4180 edge cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun parseCsvLine_escapedQuotes() {
        val fields = CsvImporter.parseCsvLine("""hello,"world ""quoted""",end""")
        assertEquals(3, fields.size)
        assertEquals("hello", fields[0])
        assertEquals("world \"quoted\"", fields[1])
        assertEquals("end", fields[2])
    }

    @Test
    fun parseCsvLine_emptyFields() {
        val fields = CsvImporter.parseCsvLine("a,,c,")
        assertEquals(4, fields.size)
        assertEquals("a", fields[0])
        assertEquals("", fields[1])
        assertEquals("c", fields[2])
        assertEquals("", fields[3])
    }

    // ═══════════════════════════════════════════════════════════════════
    // ColumnMapping validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun columnMapping_sameColumnForDateAndAmount_throws() {
        assertFailsWith<IllegalArgumentException> {
            ColumnMapping(dateColumn = 0, amountColumn = 0)
        }
    }

    @Test
    fun columnMapping_negativeIndex_throws() {
        assertFailsWith<IllegalArgumentException> {
            ColumnMapping(dateColumn = -1, amountColumn = 1)
        }
    }
}
