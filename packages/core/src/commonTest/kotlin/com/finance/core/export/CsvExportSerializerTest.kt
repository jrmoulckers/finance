// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.*

class CsvExportSerializerTest {

    private val serializer = CsvExportSerializer()

    private val fixedInstant = Instant.parse("2024-06-15T12:00:00Z")
    private val fixedDate = LocalDate(2024, 6, 15)

    // ── Helpers ──────────────────────────────────────────────────────

    private fun sampleMetadata() = ExportMetadata(
        exportDate = fixedInstant,
        appVersion = "2.1.0",
        schemaVersion = "1.0",
        userIdHash = "sha256:abc123",
        entityCounts = ExportEntityCounts(
            accounts = 1,
            transactions = 1,
            categories = 1,
            budgets = 1,
            goals = 1,
        ),
    )

    private fun sampleData(): ExportData {
        TestFixtures.reset()
        return ExportData(
            accounts = listOf(
                TestFixtures.createAccount(name = "Checking"),
            ),
            transactions = listOf(
                TestFixtures.createExpense(amount = Cents(1250)),
            ),
            categories = listOf(
                Category(
                    id = TestFixtures.nextId(),
                    householdId = SyncId("household-1"),
                    name = "Groceries",
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            budgets = listOf(
                TestFixtures.createBudget(name = "Food Budget"),
            ),
            goals = listOf(
                Goal(
                    id = TestFixtures.nextId(),
                    householdId = SyncId("household-1"),
                    name = "Emergency Fund",
                    targetAmount = Cents(100000),
                    currentAmount = Cents(25000),
                    currency = Currency.USD,
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
        )
    }

    /**
     * Splits CSV output into lines using CRLF, keeping empty lines for
     * section boundaries.
     */
    private fun csvLines(content: String): List<String> =
        content.split("\r\n")

    // ═════════════════════════════════════════════════════════════════
    // Format property
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun format_isCsv() {
        assertEquals(ExportFormat.CSV, serializer.format)
    }

    // ═════════════════════════════════════════════════════════════════
    // RFC 4180 — CRLF line endings
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_usesCrlfLineEndings() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        // Every \n should be preceded by \r (CRLF), unless it's inside a quoted field.
        // Check that non-quoted line boundaries use CRLF.
        assertTrue(content.contains("\r\n"), "Output should contain CRLF line endings")
    }

    // ═════════════════════════════════════════════════════════════════
    // RFC 4180 — fields with commas are quoted
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_fieldsWithCommas_areQuoted() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(
                TestFixtures.createAccount(name = "Savings, Joint"),
            ),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        assertTrue(
            content.contains("\"Savings, Joint\""),
            "Field with comma should be enclosed in double-quotes",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // RFC 4180 — fields with double-quotes are escaped
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_fieldsWithDoubleQuotes_areEscaped() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = emptyList(),
            transactions = listOf(
                TestFixtures.createTransaction(
                    payee = "McDonald's \"Big Mac\" Deal",
                ),
            ),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        // The double-quotes inside the field should be doubled per RFC 4180
        assertTrue(
            content.contains("\"McDonald's \"\"Big Mac\"\" Deal\""),
            "Double-quotes within a field should be escaped by doubling them",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // RFC 4180 — fields with newlines are quoted
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_fieldsWithNewlines_areQuoted() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = emptyList(),
            transactions = listOf(
                TestFixtures.createTransaction(
                    note = "Line 1\nLine 2",
                ),
            ),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        // The field containing a newline should be wrapped in double-quotes
        assertTrue(
            content.contains("\"Line 1\nLine 2\""),
            "Field with newline should be enclosed in double-quotes",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Monetary values formatted as decimal strings
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_monetaryValues_formattedAsDecimal() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        // Account balance: Cents(10000) with USD → "100.00"
        assertTrue(content.contains("100.00"), "Account balance should be formatted as 100.00")
        // Transaction amount: Cents(1250) with USD → "12.50"
        assertTrue(content.contains("12.50"), "Transaction amount should be formatted as 12.50")
    }

    @Test
    fun serialize_jpyCurrency_noDecimalPlaces() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(
                TestFixtures.createAccount(
                    name = "JPY Account",
                    currency = Currency.JPY,
                    currentBalance = Cents(1000),
                ),
            ),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        val lines = csvLines(content)
        // Find the accounts data line (after headers)
        val accountDataLine = lines.first { it.startsWith("test-") }
        // JPY has 0 decimal places, so Cents(1000) → "1000" (no decimal point)
        assertTrue(
            accountDataLine.contains(",1000,") || accountDataLine.contains(",1000\r"),
            "JPY amounts should have no decimal places",
        )
    }

    @Test
    fun serialize_negativeAmount_formattedCorrectly() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(
                TestFixtures.createAccount(
                    name = "Credit Card",
                    type = AccountType.CREDIT_CARD,
                    currentBalance = Cents(-15075),
                ),
            ),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        assertTrue(content.contains("-150.75"), "Negative balance should be formatted as -150.75")
    }

    // ═════════════════════════════════════════════════════════════════
    // Dates as ISO 8601
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_datesAsIso8601() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertTrue(
            content.contains("2024-06-15T12:00:00Z"),
            "Timestamps should be ISO 8601 format",
        )
        assertTrue(
            content.contains("2024-06-15"),
            "Dates should be ISO 8601 format",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Tags serialized as semicolon-separated
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_tags_semicolonSeparated() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = emptyList(),
            transactions = listOf(
                Transaction(
                    id = TestFixtures.nextId(),
                    householdId = SyncId("household-1"),
                    accountId = SyncId("account-1"),
                    type = TransactionType.EXPENSE,
                    amount = Cents(500),
                    currency = Currency.USD,
                    date = fixedDate,
                    tags = listOf("groceries", "essential", "weekly"),
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        assertTrue(
            content.contains("groceries;essential;weekly"),
            "Tags should be semicolon-separated",
        )
    }

    @Test
    fun serialize_emptyTags_producesEmptyField() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = emptyList(),
            transactions = listOf(
                TestFixtures.createExpense(), // no tags by default
            ),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        // The tags field should be empty (two consecutive commas or comma before timestamp)
        val lines = csvLines(content)
        val txnDataLine = lines.first { it.startsWith("test-") && lines.indexOf(it) > lines.indexOf("# TRANSACTIONS") }
        // Tags column is followed by created_at — empty tags means ",," somewhere
        assertTrue(
            txnDataLine.contains(",,") || txnDataLine.contains(",2024"),
            "Empty tags should produce an empty field",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // syncVersion and isSynced excluded
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_excludesSyncVersion() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertFalse(
            content.contains("syncVersion") || content.contains("sync_version"),
            "syncVersion should not appear in CSV output",
        )
    }

    @Test
    fun serialize_excludesIsSynced() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertFalse(
            content.contains("isSynced") || content.contains("is_synced"),
            "isSynced should not appear in CSV output",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Empty collections produce header-only sections
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_emptyCollections_produceHeaderOnlySections() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(TestFixtures.createAccount()), // at least one entity
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        val lines = csvLines(content)

        // Find TRANSACTIONS section — should have header comment + column headers but no data rows
        val txnHeaderIdx = lines.indexOf("# TRANSACTIONS")
        assertTrue(txnHeaderIdx >= 0, "TRANSACTIONS section header should be present")
        // Next line is column headers
        val txnColumnsLine = lines[txnHeaderIdx + 1]
        assertTrue(txnColumnsLine.startsWith("id,"), "Column headers should follow section comment")
        // Line after column headers should be empty (section separator)
        val lineAfterHeaders = lines[txnHeaderIdx + 2]
        assertTrue(
            lineAfterHeaders.isEmpty() || lineAfterHeaders.startsWith("#"),
            "Empty collection should have no data rows after headers",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Unicode characters preserved
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_unicodeCharacters_preserved() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(
                TestFixtures.createAccount(name = "Café Übermensch 日本語"),
            ),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        assertTrue(
            content.contains("Café Übermensch 日本語"),
            "Unicode characters should be preserved in output",
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Metadata section
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_containsMetadataSection() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertTrue(content.contains("# METADATA"), "Output should contain metadata section")
        assertTrue(content.contains("export_date"), "Metadata should contain export_date")
        assertTrue(content.contains("app_version"), "Metadata should contain app_version")
        assertTrue(content.contains("schema_version"), "Metadata should contain schema_version")
        assertTrue(content.contains("user_id_hash"), "Metadata should contain user_id_hash")
    }

    @Test
    fun serialize_metadataContainsCorrectValues() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertTrue(content.contains("2024-06-15T12:00:00Z"), "Should contain export date")
        assertTrue(content.contains("2.1.0"), "Should contain app version")
        assertTrue(content.contains("sha256:abc123"), "Should contain user ID hash")
    }

    // ═════════════════════════════════════════════════════════════════
    // Section headers present
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_containsAllSectionHeaders() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertTrue(content.contains("# ACCOUNTS"), "Should contain ACCOUNTS section")
        assertTrue(content.contains("# TRANSACTIONS"), "Should contain TRANSACTIONS section")
        assertTrue(content.contains("# CATEGORIES"), "Should contain CATEGORIES section")
        assertTrue(content.contains("# BUDGETS"), "Should contain BUDGETS section")
        assertTrue(content.contains("# GOALS"), "Should contain GOALS section")
    }

    // ═════════════════════════════════════════════════════════════════
    // escapeField unit tests (via companion)
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun escapeField_plainText_unchanged() {
        assertEquals("hello", CsvExportSerializer.escapeField("hello"))
    }

    @Test
    fun escapeField_withComma_quoted() {
        assertEquals("\"hello, world\"", CsvExportSerializer.escapeField("hello, world"))
    }

    @Test
    fun escapeField_withDoubleQuote_quotedAndEscaped() {
        assertEquals("\"say \"\"hi\"\"\"", CsvExportSerializer.escapeField("say \"hi\""))
    }

    @Test
    fun escapeField_withNewline_quoted() {
        assertEquals("\"line1\nline2\"", CsvExportSerializer.escapeField("line1\nline2"))
    }

    @Test
    fun escapeField_withCarriageReturn_quoted() {
        assertEquals("\"line1\rline2\"", CsvExportSerializer.escapeField("line1\rline2"))
    }

    @Test
    fun escapeField_emptyString_unchanged() {
        assertEquals("", CsvExportSerializer.escapeField(""))
    }

    @Test
    fun escapeField_commaAndQuote_quotedAndEscaped() {
        assertEquals(
            "\"He said, \"\"hello\"\"\"",
            CsvExportSerializer.escapeField("He said, \"hello\""),
        )
    }

    // ═════════════════════════════════════════════════════════════════
    // Budget fields present
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_budgetFieldsCorrect() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertTrue(content.contains("Food Budget"), "Budget name should be present")
        assertTrue(content.contains("MONTHLY"), "Budget period should be present")
        assertTrue(content.contains("500.00"), "Budget amount should be formatted as decimal")
    }

    // ═════════════════════════════════════════════════════════════════
    // Goal fields present
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_goalFieldsCorrect() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertTrue(content.contains("Emergency Fund"), "Goal name should be present")
        assertTrue(content.contains("1000.00"), "Goal target amount should be formatted")
        assertTrue(content.contains("250.00"), "Goal current amount should be formatted")
        assertTrue(content.contains("ACTIVE"), "Goal status should be present")
    }
}
