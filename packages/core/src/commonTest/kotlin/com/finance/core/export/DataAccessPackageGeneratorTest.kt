// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.core.TestFixtures
import com.finance.models.Transaction
import com.finance.models.types.Cents
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.measureTime

class DataAccessPackageGeneratorTest {
    private val generatedAt = Instant.parse("2026-05-26T12:00:00Z")

    @Test
    fun generate_buildsZipWithManifestReadmeAndEveryRequiredDomain() {
        val result = DataAccessPackageGenerator().generate(sampleData(), options())
        val names = ZipArchive.listEntryNames(result.zipBytes)

        assertTrue("manifest.json" in names)
        assertTrue("README.md" in names)
        DataAccessDomain.entries
            .filterNot { it == DataAccessDomain.MOOD_TAGS }
            .forEach { domain ->
                assertTrue("data/${domain.fileName}" in names, "Missing ${domain.fileName}")
            }
        assertTrue(names.any { it.startsWith("attachments/receipt-1-") })
        assertEquals(DATA_ACCESS_PACKAGE_SCHEMA_VERSION, result.manifest.schemaVersion)
        assertEquals(generatedAt.toString(), result.manifest.generatedAt)
        assertEquals(generatedAt.plus(7, DateTimeUnit.DAY, TimeZone.UTC).toString(), result.manifest.expiresAt)
        assertNotNull(result.manifest.contents.firstOrNull { it.path == "data/transactions.json" })
    }

    @Test
    fun generate_representsAllDomainsInManifestInventory() {
        val result = DataAccessPackageGenerator().generate(sampleData(), options(includeMoodTags = true))
        val manifestPaths = result.manifest.contents.map { it.path }.toSet()

        assertEquals(1, result.manifest.contents.first { it.path == "data/transactions.json" }.recordCount)
        assertEquals(2, result.manifest.contents.first { it.path == "data/tags.json" }.recordCount)
        assertTrue("data/mood_tags.json" in manifestPaths)
        assertTrue("attachments/receipt-1-receipt.txt" in manifestPaths)
        assertTrue(result.manifest.privacy.protectedCategoriesIncluded)
        assertTrue(result.manifest.privacy.moodTagsIncluded)
        assertTrue(result.manifest.coordinationNotes.any { it.contains("#1719") })
    }

    @Test
    fun retention_warnsDuringFinalDayAndDeletesAtExpiration() {
        val expiresAt = generatedAt.plus(7, DateTimeUnit.DAY, TimeZone.UTC)

        assertFalse(DataAccessPackageRetention.shouldWarnWithin24Hours(generatedAt, expiresAt))
        assertTrue(
            DataAccessPackageRetention.shouldWarnWithin24Hours(
                generatedAt.plus(6, DateTimeUnit.DAY, TimeZone.UTC),
                expiresAt,
            ),
        )
        assertFalse(DataAccessPackageRetention.shouldAutoDelete(expiresAt.plus(-1, DateTimeUnit.DAY, TimeZone.UTC), expiresAt))
        assertTrue(DataAccessPackageRetention.shouldAutoDelete(expiresAt, expiresAt))
    }

    @Test
    fun generate_finishesWithinSlaFor100kTransactions() {
        val transactions = List(100_000) { index -> sampleTransaction(index) }
        val data = DataAccessExportData(transactions = transactions)
        val elapsed = measureTime {
            val result = DataAccessPackageGenerator().generate(data, options())
            assertTrue(result.zipBytes.isNotEmpty())
            assertEquals(100_000, result.manifest.contents.first { it.path == "data/transactions.json" }.recordCount)
        }

        assertTrue(elapsed.inWholeSeconds < 60, "100k transaction export exceeded 60s SLA: $elapsed")
    }

    @Test
    fun generate_doesNotUseNetworkEgress() {
        val failingProbe = NetworkEgressProbe { url -> error("Unexpected HTTP egress during export: $url") }
        val result = DataAccessPackageGenerator(failingProbe).generate(sampleData(), options())

        assertTrue(result.zipBytes.isNotEmpty())
        assertFalse(result.manifest.contents.any { it.path.startsWith("http") })
    }

    private fun options(includeMoodTags: Boolean = false) = DataAccessRequestOptions(
        appVersion = "0.1.0",
        generatedAt = generatedAt,
        includeMoodTags = includeMoodTags,
    )

    private fun sampleData(): DataAccessExportData {
        TestFixtures.reset()
        return DataAccessExportData(
            accounts = listOf(TestFixtures.createAccount(id = com.finance.models.types.SyncId("account-1"))),
            transactions = listOf(sampleTransaction(1)),
            budgets = listOf(TestFixtures.createBudget()),
            goals = listOf(TestFixtures.createGoal()),
            categories = listOf(
                com.finance.models.Category(
                    id = com.finance.models.types.SyncId("category-1"),
                    householdId = com.finance.models.types.SyncId("household-1"),
                    ownerId = com.finance.models.types.SyncId("owner-1"),
                    name = "Groceries",
                    createdAt = TestFixtures.fixedInstant,
                    updatedAt = TestFixtures.fixedInstant,
                ),
            ),
            recurringRules = listOf(jsonRecord("id", "rule-1")),
            preferences = listOf(jsonRecord("currency", "USD")),
            settings = listOf(jsonRecord("theme", "system")),
            auditLog = listOf(jsonRecord("event", "export_requested")),
            syncMetadata = listOf(jsonRecord("device", "test-device")),
            attachments = listOf(
                DataAccessAttachment(
                    id = "receipt-1",
                    fileName = "receipt.txt",
                    contentType = "text/plain",
                    bytes = "receipt".encodeToByteArray(),
                ),
            ),
            moodTags = listOf(jsonRecord("mood_tag", "calm")),
        )
    }

    private fun sampleTransaction(index: Int): Transaction = TestFixtures.createTransaction(
        id = com.finance.models.types.SyncId("txn-$index"),
        accountId = com.finance.models.types.SyncId("account-1"),
        amount = Cents(100 + index.toLong()),
        payee = "Payee $index",
        note = "Export SLA sample",
    ).copy(tags = listOf("tag-a", "tag-b"))

    private fun jsonRecord(key: String, value: String): DataAccessJsonRecord = DataAccessJsonRecord(
        buildJsonObject { put(key, value) },
    )
}
