// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.*
import kotlin.test.*

class JsonExportSerializerTest {

    private val serializer = JsonExportSerializer()

    /** Lenient parser for round-trip validation of serializer output. */
    private val jsonParser = Json { ignoreUnknownKeys = true }

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

    private fun emptyData(): ExportData = ExportData(
        accounts = emptyList(),
        transactions = emptyList(),
        categories = emptyList(),
        budgets = emptyList(),
        goals = emptyList(),
    )

    /** Parses the serializer output into a [JsonObject] for assertions. */
    private fun serializeAndParse(
        data: ExportData = sampleData(),
        metadata: ExportMetadata = sampleMetadata(),
    ): JsonObject {
        val content = serializer.serialize(data, metadata)
        return jsonParser.parseToJsonElement(content).jsonObject
    }

    // ═════════════════════════════════════════════════════════════════
    // Output is valid JSON (round-trip parse test)
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_producesValidJson() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        // Should not throw — valid JSON
        val parsed = jsonParser.parseToJsonElement(content)
        assertIs<JsonObject>(parsed)
    }

    // ═════════════════════════════════════════════════════════════════
    // Schema version and metadata
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_containsExportVersion() {
        val root = serializeAndParse()
        assertEquals("1.0", root["export_version"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_metadataContainsExportDate() {
        val root = serializeAndParse()
        val metadata = root["metadata"]!!.jsonObject
        assertEquals(fixedInstant.toString(), metadata["export_date"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_metadataContainsAppVersion() {
        val root = serializeAndParse()
        val metadata = root["metadata"]!!.jsonObject
        assertEquals("2.1.0", metadata["app_version"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_metadataContainsSchemaVersion() {
        val root = serializeAndParse()
        val metadata = root["metadata"]!!.jsonObject
        assertEquals("1.0", metadata["schema_version"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_metadataContainsUserIdHash() {
        val root = serializeAndParse()
        val metadata = root["metadata"]!!.jsonObject
        assertEquals("sha256:abc123", metadata["user_id_hash"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_metadataContainsEntityCounts() {
        val root = serializeAndParse()
        val counts = root["metadata"]!!.jsonObject["entity_counts"]!!.jsonObject
        assertEquals(1, counts["accounts"]?.jsonPrimitive?.int)
        assertEquals(1, counts["transactions"]?.jsonPrimitive?.int)
        assertEquals(1, counts["categories"]?.jsonPrimitive?.int)
        assertEquals(1, counts["budgets"]?.jsonPrimitive?.int)
        assertEquals(1, counts["goals"]?.jsonPrimitive?.int)
    }

    // ═════════════════════════════════════════════════════════════════
    // All entity types serialized correctly
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_containsDataSection() {
        val root = serializeAndParse()
        assertNotNull(root["data"])
        val data = root["data"]!!.jsonObject
        assertNotNull(data["accounts"])
        assertNotNull(data["transactions"])
        assertNotNull(data["categories"])
        assertNotNull(data["budgets"])
        assertNotNull(data["goals"])
    }

    @Test
    fun serialize_accountsHaveCorrectFields() {
        val root = serializeAndParse()
        val account = root["data"]!!.jsonObject["accounts"]!!.jsonArray[0].jsonObject
        assertEquals("Checking", account["name"]?.jsonPrimitive?.content)
        assertEquals("CHECKING", account["type"]?.jsonPrimitive?.content)
        assertEquals("USD", account["currency"]?.jsonPrimitive?.content)
        assertNotNull(account["id"])
        assertNotNull(account["household_id"])
        assertNotNull(account["created_at"])
        assertNotNull(account["updated_at"])
    }

    @Test
    fun serialize_transactionsHaveCorrectFields() {
        val root = serializeAndParse()
        val txn = root["data"]!!.jsonObject["transactions"]!!.jsonArray[0].jsonObject
        assertEquals("EXPENSE", txn["type"]?.jsonPrimitive?.content)
        assertEquals("CLEARED", txn["status"]?.jsonPrimitive?.content)
        assertNotNull(txn["account_id"])
        assertNotNull(txn["date"])
        assertNotNull(txn["tags"])
    }

    @Test
    fun serialize_categoriesHaveCorrectFields() {
        val root = serializeAndParse()
        val category = root["data"]!!.jsonObject["categories"]!!.jsonArray[0].jsonObject
        assertEquals("Groceries", category["name"]?.jsonPrimitive?.content)
        assertNotNull(category["is_income"])
        assertNotNull(category["is_system"])
    }

    @Test
    fun serialize_budgetsHaveCorrectFields() {
        val root = serializeAndParse()
        val budget = root["data"]!!.jsonObject["budgets"]!!.jsonArray[0].jsonObject
        assertEquals("Food Budget", budget["name"]?.jsonPrimitive?.content)
        assertEquals("MONTHLY", budget["period"]?.jsonPrimitive?.content)
        assertNotNull(budget["category_id"])
        assertNotNull(budget["start_date"])
    }

    @Test
    fun serialize_goalsHaveCorrectFields() {
        val root = serializeAndParse()
        val goal = root["data"]!!.jsonObject["goals"]!!.jsonArray[0].jsonObject
        assertEquals("Emergency Fund", goal["name"]?.jsonPrimitive?.content)
        assertEquals("ACTIVE", goal["status"]?.jsonPrimitive?.content)
        assertNotNull(goal["target_amount"])
        assertNotNull(goal["current_amount"])
    }

    // ═════════════════════════════════════════════════════════════════
    // Monetary values include amount, display, and currency
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_monetaryValuesContainAmountDisplayCurrency() {
        val root = serializeAndParse()
        val balance = root["data"]!!.jsonObject["accounts"]!!.jsonArray[0]
            .jsonObject["current_balance"]!!.jsonObject

        assertEquals(10000L, balance["amount"]?.jsonPrimitive?.long)
        assertEquals("100.00", balance["display"]?.jsonPrimitive?.content)
        assertEquals("USD", balance["currency"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_transactionAmountFormattedCorrectly() {
        val root = serializeAndParse()
        val amount = root["data"]!!.jsonObject["transactions"]!!.jsonArray[0]
            .jsonObject["amount"]!!.jsonObject

        assertEquals(1250L, amount["amount"]?.jsonPrimitive?.long)
        assertEquals("12.50", amount["display"]?.jsonPrimitive?.content)
        assertEquals("USD", amount["currency"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_goalAmountsFormattedCorrectly() {
        val root = serializeAndParse()
        val goal = root["data"]!!.jsonObject["goals"]!!.jsonArray[0].jsonObject

        val targetAmount = goal["target_amount"]!!.jsonObject
        assertEquals(100000L, targetAmount["amount"]?.jsonPrimitive?.long)
        assertEquals("1000.00", targetAmount["display"]?.jsonPrimitive?.content)

        val currentAmount = goal["current_amount"]!!.jsonObject
        assertEquals(25000L, currentAmount["amount"]?.jsonPrimitive?.long)
        assertEquals("250.00", currentAmount["display"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_zeroCurrencyDecimalPlaces_formatsCorrectly() {
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
        val root = serializeAndParse(data = data)
        val balance = root["data"]!!.jsonObject["accounts"]!!.jsonArray[0]
            .jsonObject["current_balance"]!!.jsonObject

        assertEquals(1000L, balance["amount"]?.jsonPrimitive?.long)
        assertEquals("1000", balance["display"]?.jsonPrimitive?.content)
        assertEquals("JPY", balance["currency"]?.jsonPrimitive?.content)
    }

    // ═════════════════════════════════════════════════════════════════
    // Dates formatted as ISO 8601
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_datesAsIso8601() {
        val root = serializeAndParse()
        val account = root["data"]!!.jsonObject["accounts"]!!.jsonArray[0].jsonObject
        assertEquals("2024-06-15T12:00:00Z", account["created_at"]?.jsonPrimitive?.content)
        assertEquals("2024-06-15T12:00:00Z", account["updated_at"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_transactionDateAsIso8601() {
        val root = serializeAndParse()
        val txn = root["data"]!!.jsonObject["transactions"]!!.jsonArray[0].jsonObject
        assertEquals("2024-06-15", txn["date"]?.jsonPrimitive?.content)
    }

    // ═════════════════════════════════════════════════════════════════
    // syncVersion and isSynced excluded
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_excludesSyncVersionFromAllEntities() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertFalse(content.contains("syncVersion"), "syncVersion should not appear in output")
        assertFalse(content.contains("sync_version"), "sync_version should not appear in output")
    }

    @Test
    fun serialize_excludesIsSyncedFromAllEntities() {
        val content = serializer.serialize(sampleData(), sampleMetadata())
        assertFalse(content.contains("isSynced"), "isSynced should not appear in output")
        assertFalse(content.contains("is_synced"), "is_synced should not appear in output")
    }

    // ═════════════════════════════════════════════════════════════════
    // Empty collections produce empty arrays
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_emptyCollections_produceEmptyArrays() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(TestFixtures.createAccount()), // need at least 1 entity total
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val root = serializeAndParse(data = data)
        val dataSection = root["data"]!!.jsonObject
        assertEquals(1, dataSection["accounts"]!!.jsonArray.size)
        assertEquals(0, dataSection["transactions"]!!.jsonArray.size)
        assertEquals(0, dataSection["categories"]!!.jsonArray.size)
        assertEquals(0, dataSection["budgets"]!!.jsonArray.size)
        assertEquals(0, dataSection["goals"]!!.jsonArray.size)
    }

    // ═════════════════════════════════════════════════════════════════
    // Special characters in strings
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_handlesQuotesInPayeeName() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = emptyList(),
            transactions = listOf(
                TestFixtures.createTransaction(
                    payee = "McDonald's \"Big Mac\" Deal",
                    note = "Lunch with \"friends\"",
                ),
            ),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        // Round-trip parse should succeed
        val parsed = jsonParser.parseToJsonElement(content).jsonObject
        val txn = parsed["data"]!!.jsonObject["transactions"]!!.jsonArray[0].jsonObject
        assertEquals("McDonald's \"Big Mac\" Deal", txn["payee"]?.jsonPrimitive?.content)
        assertEquals("Lunch with \"friends\"", txn["note"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_handlesUnicodeCharacters() {
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
        val parsed = jsonParser.parseToJsonElement(content).jsonObject
        val account = parsed["data"]!!.jsonObject["accounts"]!!.jsonArray[0].jsonObject
        assertEquals("Café Übermensch 日本語", account["name"]?.jsonPrimitive?.content)
    }

    @Test
    fun serialize_handlesNewlinesInNotes() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = emptyList(),
            transactions = listOf(
                TestFixtures.createTransaction(
                    note = "Line 1\nLine 2\nLine 3",
                ),
            ),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        val content = serializer.serialize(data, sampleMetadata())
        val parsed = jsonParser.parseToJsonElement(content).jsonObject
        val txn = parsed["data"]!!.jsonObject["transactions"]!!.jsonArray[0].jsonObject
        assertEquals("Line 1\nLine 2\nLine 3", txn["note"]?.jsonPrimitive?.content)
    }

    // ═════════════════════════════════════════════════════════════════
    // Format property
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun format_isJson() {
        assertEquals(ExportFormat.JSON, serializer.format)
    }

    // ═════════════════════════════════════════════════════════════════
    // Negative monetary values
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_negativeAmountFormattedCorrectly() {
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
        val root = serializeAndParse(data = data)
        val balance = root["data"]!!.jsonObject["accounts"]!!.jsonArray[0]
            .jsonObject["current_balance"]!!.jsonObject
        assertEquals(-15075L, balance["amount"]?.jsonPrimitive?.long)
        assertEquals("-150.75", balance["display"]?.jsonPrimitive?.content)
    }

    // ═════════════════════════════════════════════════════════════════
    // Transaction tags
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_transactionTagsAsArray() {
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
        val root = serializeAndParse(data = data)
        val tags = root["data"]!!.jsonObject["transactions"]!!.jsonArray[0]
            .jsonObject["tags"]!!.jsonArray
        assertEquals(3, tags.size)
        assertEquals("groceries", tags[0].jsonPrimitive.content)
        assertEquals("essential", tags[1].jsonPrimitive.content)
        assertEquals("weekly", tags[2].jsonPrimitive.content)
    }

    // ═════════════════════════════════════════════════════════════════
    // Null optional fields
    // ═════════════════════════════════════════════════════════════════

    @Test
    fun serialize_nullFieldsSerializedAsJsonNull() {
        val root = serializeAndParse()
        val account = root["data"]!!.jsonObject["accounts"]!!.jsonArray[0].jsonObject
        // icon and color default to null
        assertTrue(account["icon"] is JsonNull || account["icon"]?.jsonPrimitive?.contentOrNull == null)
        assertTrue(account["color"] is JsonNull || account["color"]?.jsonPrimitive?.contentOrNull == null)
    }
}
