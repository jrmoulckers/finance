package com.finance.core.data

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import kotlin.test.*

class DataExporterTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // exportTransactionsJson()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exportTransactionsJson_producesValidJson() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(2500), date = LocalDate(2024, 6, 15)),
            TestFixtures.createIncome(amount = Cents(5000), date = LocalDate(2024, 6, 16)),
        )

        val json = DataExporter.exportTransactionsJson(transactions)
        val array = Json.parseToJsonElement(json).jsonArray
        assertEquals(2, array.size)

        val first = array[0].jsonObject
        assertEquals(2500, first["amountCents"]?.jsonPrimitive?.int)
    }

    @Test
    fun exportTransactionsJson_emptyList() {
        val json = DataExporter.exportTransactionsJson(emptyList())
        val array = Json.parseToJsonElement(json).jsonArray
        assertEquals(0, array.size)
    }

    @Test
    fun exportTransactionsJson_preservesAllFields() {
        val txn = TestFixtures.createTransaction(
            payee = "Test Payee",
            note = "Test Note",
        )
        val json = DataExporter.exportTransactionsJson(listOf(txn))
        val obj = Json.parseToJsonElement(json).jsonArray[0].jsonObject

        assertEquals("Test Payee", obj["payee"]?.jsonPrimitive?.content)
        assertEquals("Test Note", obj["note"]?.jsonPrimitive?.content)
        assertEquals("EXPENSE", obj["type"]?.jsonPrimitive?.content)
        assertEquals("CLEARED", obj["status"]?.jsonPrimitive?.content)
        assertEquals("USD", obj["currency"]?.jsonPrimitive?.content)
    }

    // ═══════════════════════════════════════════════════════════════════
    // exportTransactionsCsv()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exportTransactionsCsv_hasHeaderAndDataRows() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(2500), date = LocalDate(2024, 6, 15)),
        )

        val csv = DataExporter.exportTransactionsCsv(transactions)
        val lines = csv.lines().filter { it.isNotBlank() }

        assertEquals(2, lines.size)
        assertTrue(lines[0].startsWith("Date,"))
        assertTrue(lines[1].startsWith("2024-06-15,"))
    }

    @Test
    fun exportTransactionsCsv_emptyList_headerOnly() {
        val csv = DataExporter.exportTransactionsCsv(emptyList())
        val lines = csv.lines().filter { it.isNotBlank() }
        assertEquals(1, lines.size)
    }

    @Test
    fun exportTransactionsCsv_specialCharactersEscaped() {
        val txn = TestFixtures.createTransaction(
            payee = "Smith, John",
            note = "Includes \"quotes\"",
        )
        val csv = DataExporter.exportTransactionsCsv(listOf(txn))

        assertTrue(csv.contains("\"Smith, John\""))
        assertTrue(csv.contains("\"Includes \"\"quotes\"\"\""))
    }

    @Test
    fun exportTransactionsCsv_amountFormatted() {
        val txn = TestFixtures.createTransaction(amount = Cents(12345))
        val csv = DataExporter.exportTransactionsCsv(listOf(txn))
        assertTrue(csv.contains("123.45"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // exportFullBackup() — GDPR completeness
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exportFullBackup_containsAllEntityTypes() {
        val accounts = listOf(TestFixtures.createAccount())
        val transactions = listOf(TestFixtures.createExpense())
        val budgets = listOf(TestFixtures.createBudget())
        val goals = listOf(createTestGoal())
        val categories = listOf(createTestCategory())

        val json = DataExporter.exportFullBackup(
            accounts, transactions, budgets, goals, categories,
        )

        val obj = Json.parseToJsonElement(json).jsonObject
        assertEquals(1, obj["schemaVersion"]?.jsonPrimitive?.int)
        assertTrue(obj.containsKey("exportedAt"))
        assertEquals(1, obj["accounts"]?.jsonArray?.size)
        assertEquals(1, obj["transactions"]?.jsonArray?.size)
        assertEquals(1, obj["budgets"]?.jsonArray?.size)
        assertEquals(1, obj["goals"]?.jsonArray?.size)
        assertEquals(1, obj["categories"]?.jsonArray?.size)
    }

    @Test
    fun exportFullBackup_countsMatchEntities() {
        val accounts = listOf(TestFixtures.createAccount(), TestFixtures.createAccount())
        val transactions = listOf(
            TestFixtures.createExpense(),
            TestFixtures.createIncome(),
            TestFixtures.createExpense(),
        )

        val json = DataExporter.exportFullBackup(
            accounts, transactions,
            budgets = emptyList(),
            goals = emptyList(),
            categories = emptyList(),
        )

        val counts = Json.parseToJsonElement(json).jsonObject["counts"]?.jsonObject
        assertEquals(2, counts?.get("accounts")?.jsonPrimitive?.int)
        assertEquals(3, counts?.get("transactions")?.jsonPrimitive?.int)
        assertEquals(0, counts?.get("budgets")?.jsonPrimitive?.int)
        assertEquals(0, counts?.get("goals")?.jsonPrimitive?.int)
        assertEquals(0, counts?.get("categories")?.jsonPrimitive?.int)
    }

    @Test
    fun exportFullBackup_emptyData() {
        val json = DataExporter.exportFullBackup(
            accounts = emptyList(),
            transactions = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
            categories = emptyList(),
        )

        val obj = Json.parseToJsonElement(json).jsonObject
        assertEquals(0, obj["accounts"]?.jsonArray?.size)
        assertEquals(0, obj["transactions"]?.jsonArray?.size)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Roundtrip: CSV import → export
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun roundtrip_csvImportThenExport_preservesData() {
        val originalCsv = """
            Date,Amount,Payee,Note
            2024-06-15,25.00,Coffee Shop,Morning latte
            2024-06-16,-42.50,Grocery Store,Weekly groceries
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2, noteColumn = 3)
        val importResult = CsvImporter.importTransactions(originalCsv, mapping, SyncId("acct-1"))

        assertEquals(2, importResult.importedCount)

        val exportedCsv = DataExporter.exportTransactionsCsv(importResult.imported)
        val lines = exportedCsv.lines().filter { it.isNotBlank() }

        assertEquals(3, lines.size)
        assertTrue(lines[1].startsWith("2024-06-15,"))
        assertTrue(lines[2].startsWith("2024-06-16,"))
        assertTrue(lines[1].contains("25.00"))
        assertTrue(lines[2].contains("42.50"))
        assertTrue(lines[1].contains("Coffee Shop"))
        assertTrue(lines[2].contains("Grocery Store"))
    }

    @Test
    fun roundtrip_jsonImportExport_preservesData() {
        val originalCsv = """
            Date,Amount,Payee
            2024-06-15,25.00,Coffee Shop
        """.trimIndent()

        val mapping = ColumnMapping(dateColumn = 0, amountColumn = 1, payeeColumn = 2)
        val importResult = CsvImporter.importTransactions(originalCsv, mapping, SyncId("acct-1"))

        val json = DataExporter.exportTransactionsJson(importResult.imported)
        val array = Json.parseToJsonElement(json).jsonArray
        assertEquals(1, array.size)

        val obj = array[0].jsonObject
        assertEquals("2024-06-15", obj["date"]?.jsonPrimitive?.content)
        assertEquals(2500, obj["amountCents"]?.jsonPrimitive?.int)
        assertEquals("Coffee Shop", obj["payee"]?.jsonPrimitive?.content)
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatCents()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatCents_positive() {
        assertEquals("12.34", DataExporter.formatCents(Cents(1234)))
    }

    @Test
    fun formatCents_negative() {
        assertEquals("-12.34", DataExporter.formatCents(Cents(-1234)))
    }

    @Test
    fun formatCents_zero() {
        assertEquals("0.00", DataExporter.formatCents(Cents(0)))
    }

    @Test
    fun formatCents_singleDigitFraction() {
        assertEquals("1.05", DataExporter.formatCents(Cents(105)))
    }

    @Test
    fun formatCents_wholeAmount() {
        assertEquals("100.00", DataExporter.formatCents(Cents(10000)))
    }

    // ═══════════════════════════════════════════════════════════════════
    // escapeCsvField()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun escapeCsvField_noSpecialChars() {
        assertEquals("hello", DataExporter.escapeCsvField("hello"))
    }

    @Test
    fun escapeCsvField_withComma() {
        assertEquals("\"hello, world\"", DataExporter.escapeCsvField("hello, world"))
    }

    @Test
    fun escapeCsvField_withQuotes() {
        assertEquals("\"say \"\"hello\"\"\"", DataExporter.escapeCsvField("say \"hello\""))
    }

    @Test
    fun escapeCsvField_withNewline() {
        assertEquals("\"line1\nline2\"", DataExporter.escapeCsvField("line1\nline2"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun createTestGoal(): Goal = Goal(
        id = TestFixtures.nextId(),
        householdId = SyncId("household-1"),
        name = "Emergency Fund",
        targetAmount = Cents(100000),
        currentAmount = Cents(25000),
        currency = Currency.USD,
        createdAt = TestFixtures.fixedInstant,
        updatedAt = TestFixtures.fixedInstant,
    )

    private fun createTestCategory(): Category = Category(
        id = TestFixtures.nextId(),
        householdId = SyncId("household-1"),
        name = "Groceries",
        createdAt = TestFixtures.fixedInstant,
        updatedAt = TestFixtures.fixedInstant,
    )
}
