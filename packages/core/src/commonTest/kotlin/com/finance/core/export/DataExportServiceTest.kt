// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.core.TestFixtures
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

class DataExportServiceTest {

    // ── Test helpers ──────────────────────────────────────────────────

    /** Minimal mock serializer that concatenates entity counts as its "serialized" output. */
    private class MockSerializer(
        override val format: ExportFormat = ExportFormat.JSON,
    ) : ExportSerializer {
        var serializeCalled = false
            private set
        var lastData: ExportData? = null
            private set
        var lastMetadata: ExportMetadata? = null
            private set

        override fun serialize(data: ExportData, metadata: ExportMetadata): String {
            serializeCalled = true
            lastData = data
            lastMetadata = metadata
            return """{"accounts":${data.accounts.size},"transactions":${data.transactions.size}}"""
        }
    }

    /** A serializer that always throws, for error-path testing. */
    private class FailingSerializer(
        override val format: ExportFormat = ExportFormat.JSON,
        private val errorMessage: String = "serialization boom",
    ) : ExportSerializer {
        override fun serialize(data: ExportData, metadata: ExportMetadata): String {
            throw IllegalStateException(errorMessage)
        }
    }

    private val fixedInstant = Instant.parse("2026-03-15T10:30:00Z")
    private val testUserId = SyncId("user-abc-123")
    private val testAppVersion = "2.1.0"

    private fun createSampleData(): ExportData {
        TestFixtures.reset()
        return ExportData(
            accounts = listOf(
                TestFixtures.createAccount(name = "Checking"),
                TestFixtures.createAccount(name = "Savings"),
            ),
            transactions = listOf(
                TestFixtures.createExpense(),
                TestFixtures.createIncome(),
                TestFixtures.createExpense(),
            ),
            categories = listOf(
                // Create minimal categories via the model directly
                com.finance.models.Category(
                    id = TestFixtures.nextId(),
                    householdId = SyncId("household-1"),
                    name = "Food",
                    createdAt = TestFixtures.fixedInstant,
                    updatedAt = TestFixtures.fixedInstant,
                ),
            ),
            budgets = listOf(
                TestFixtures.createBudget(),
            ),
            goals = listOf(
                com.finance.models.Goal(
                    id = TestFixtures.nextId(),
                    householdId = SyncId("household-1"),
                    name = "Emergency Fund",
                    targetAmount = com.finance.models.types.Cents(100000),
                    currency = com.finance.models.types.Currency.USD,
                    createdAt = TestFixtures.fixedInstant,
                    updatedAt = TestFixtures.fixedInstant,
                ),
            ),
        )
    }

    private fun createEmptyData(): ExportData = ExportData(
        accounts = emptyList(),
        transactions = emptyList(),
        categories = emptyList(),
        budgets = emptyList(),
        goals = emptyList(),
    )

    // ═══════════════════════════════════════════════════════════════════
    // export() — success cases
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_withValidData_returnsSuccess() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertTrue(serializer.serializeCalled)
    }

    @Test
    fun export_returnsCorrectFormat() {
        val data = createSampleData()
        val serializer = MockSerializer(format = ExportFormat.CSV)

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals(ExportFormat.CSV, outcome.export.format)
    }

    @Test
    fun export_contentMatchesSerializerOutput() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals("""{"accounts":2,"transactions":3}""", outcome.export.content)
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — empty data
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_withEmptyData_returnsNoDataError() {
        val data = createEmptyData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
        )

        assertIs<ExportOutcome.Failure>(outcome)
        assertIs<ExportError.NoData>(outcome.error)
        assertFalse(serializer.serializeCalled)
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — metadata
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_metadataContainsCorrectEntityCounts() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val counts = outcome.export.metadata.entityCounts
        assertEquals(2, counts.accounts)
        assertEquals(3, counts.transactions)
        assertEquals(1, counts.categories)
        assertEquals(1, counts.budgets)
        assertEquals(1, counts.goals)
        assertEquals(8, counts.total)
    }

    @Test
    fun export_metadataContainsSchemaVersion() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals(DataExportService.SCHEMA_VERSION, outcome.export.metadata.schemaVersion)
        assertEquals("1.0", outcome.export.metadata.schemaVersion)
    }

    @Test
    fun export_metadataContainsAppVersion() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals(testAppVersion, outcome.export.metadata.appVersion)
    }

    @Test
    fun export_metadataContainsExportDate() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals(fixedInstant, outcome.export.metadata.exportDate)
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — user ID hashing
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_hashesUserId_prefixedWithSha256() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertTrue(outcome.export.metadata.userIdHash.startsWith("sha256:"))
    }

    @Test
    fun export_userIdHashIsNotRawUserId() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertFalse(outcome.export.metadata.userIdHash.contains(testUserId.value))
    }

    @Test
    fun export_userIdHashIs64HexCharsAfterPrefix() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val hashPart = outcome.export.metadata.userIdHash.removePrefix("sha256:")
        assertEquals(64, hashPart.length)
        assertTrue(hashPart.all { it in '0'..'9' || it in 'a'..'f' })
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — checksum
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_checksumIsSha256Hex() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals(64, outcome.export.checksum.length)
        assertTrue(outcome.export.checksum.all { it in '0'..'9' || it in 'a'..'f' })
    }

    @Test
    fun export_checksumIsDeterministic() {
        val data = createSampleData()

        val outcome1 = DataExportService.export(
            data = data,
            serializer = MockSerializer(),
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )
        val outcome2 = DataExportService.export(
            data = data,
            serializer = MockSerializer(),
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome1)
        assertIs<ExportOutcome.Success>(outcome2)
        assertEquals(outcome1.export.checksum, outcome2.export.checksum)
    }

    @Test
    fun export_sizeMatchesContentByteLength() {
        val data = createSampleData()
        val serializer = MockSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val expectedSize = outcome.export.content.encodeToByteArray().size.toLong()
        assertEquals(expectedSize, outcome.export.sizeBytes)
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — filename
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_generatesCorrectFilenameForJson() {
        val data = createSampleData()
        val serializer = MockSerializer(format = ExportFormat.JSON)

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals("finance-export-2026-03-15.json", outcome.export.filename)
    }

    @Test
    fun export_generatesCorrectFilenameForCsv() {
        val data = createSampleData()
        val serializer = MockSerializer(format = ExportFormat.CSV)

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertEquals("finance-export-2026-03-15.csv", outcome.export.filename)
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — progress callback
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_callsProgressInCorrectOrder() {
        val data = createSampleData()
        val serializer = MockSerializer()
        val phases = mutableListOf<ExportPhase>()

        DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
            onProgress = { phases.add(it.phase) },
        )

        assertEquals(
            listOf(
                ExportPhase.GATHERING_DATA,
                ExportPhase.SERIALIZING,
                ExportPhase.COMPUTING_CHECKSUM,
                ExportPhase.COMPLETE,
            ),
            phases,
        )
    }

    @Test
    fun export_progressFractionIncreasesMonotonically() {
        val data = createSampleData()
        val serializer = MockSerializer()
        val fractions = mutableListOf<Float>()

        DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
            onProgress = { fractions.add(it.fraction) },
        )

        // Fractions should be strictly increasing
        for (i in 1 until fractions.size) {
            assertTrue(
                fractions[i] > fractions[i - 1],
                "Expected fraction[${i}] (${fractions[i]}) > fraction[${i - 1}] (${fractions[i - 1]})",
            )
        }
        // Last fraction should be 1.0
        assertEquals(1.0f, fractions.last())
    }

    @Test
    fun export_noProgressCallbackDoesNotCrash() {
        val data = createSampleData()
        val serializer = MockSerializer()

        // Just verify it doesn't throw when onProgress is null
        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
            onProgress = null,
        )

        assertIs<ExportOutcome.Success>(outcome)
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — serializer failure
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_serializerThrows_returnsSerializationFailed() {
        val data = createSampleData()
        val serializer = FailingSerializer(errorMessage = "unexpected format error")

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Failure>(outcome)
        assertIs<ExportError.SerializationFailed>(outcome.error)
        assertTrue(outcome.error.message.contains("unexpected format error"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // export() — serializer receives correct data
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun export_passesDataAndMetadataToSerializer() {
        val data = createSampleData()
        val serializer = MockSerializer()

        DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = testAppVersion,
            exportInstant = fixedInstant,
        )

        assertNotNull(serializer.lastData)
        assertNotNull(serializer.lastMetadata)
        assertEquals(2, serializer.lastData!!.accounts.size)
        assertEquals(3, serializer.lastData!!.transactions.size)
        assertEquals(testAppVersion, serializer.lastMetadata!!.appVersion)
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateFilename()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generateFilename_jsonFormat() {
        val filename = DataExportService.generateFilename(ExportFormat.JSON, fixedInstant)
        assertEquals("finance-export-2026-03-15.json", filename)
    }

    @Test
    fun generateFilename_csvFormat() {
        val filename = DataExportService.generateFilename(ExportFormat.CSV, fixedInstant)
        assertEquals("finance-export-2026-03-15.csv", filename)
    }

    @Test
    fun generateFilename_usesUtcDate() {
        // 2026-03-15T23:30:00Z is March 15 in UTC but could be March 16 in UTC+2
        val lateNight = Instant.parse("2026-03-15T23:30:00Z")
        val filename = DataExportService.generateFilename(ExportFormat.JSON, lateNight)
        assertEquals("finance-export-2026-03-15.json", filename)
    }

    // ═══════════════════════════════════════════════════════════════════
    // hashUserId()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun hashUserId_startsWithPrefix() {
        val hash = DataExportService.hashUserId(SyncId("test-user"))
        assertTrue(hash.startsWith("sha256:"))
    }

    @Test
    fun hashUserId_producesValidHex() {
        val hash = DataExportService.hashUserId(SyncId("test-user"))
        val hexPart = hash.removePrefix("sha256:")
        assertEquals(64, hexPart.length)
        assertTrue(hexPart.all { it in '0'..'9' || it in 'a'..'f' })
    }

    @Test
    fun hashUserId_deterministicForSameInput() {
        val hash1 = DataExportService.hashUserId(SyncId("same-user"))
        val hash2 = DataExportService.hashUserId(SyncId("same-user"))
        assertEquals(hash1, hash2)
    }

    @Test
    fun hashUserId_differentForDifferentInput() {
        val hash1 = DataExportService.hashUserId(SyncId("user-a"))
        val hash2 = DataExportService.hashUserId(SyncId("user-b"))
        assertNotEquals(hash1, hash2)
    }

    // ═══════════════════════════════════════════════════════════════════
    // computeChecksum()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun computeChecksum_returnsValidHex() {
        val checksum = DataExportService.computeChecksum("hello world")
        assertEquals(64, checksum.length)
        assertTrue(checksum.all { it in '0'..'9' || it in 'a'..'f' })
    }

    @Test
    fun computeChecksum_deterministicForSameInput() {
        val c1 = DataExportService.computeChecksum("same content")
        val c2 = DataExportService.computeChecksum("same content")
        assertEquals(c1, c2)
    }

    @Test
    fun computeChecksum_differentForDifferentInput() {
        val c1 = DataExportService.computeChecksum("content A")
        val c2 = DataExportService.computeChecksum("content B")
        assertNotEquals(c1, c2)
    }

    @Test
    fun computeChecksum_knownTestVector() {
        // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        val checksum = DataExportService.computeChecksum("")
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", checksum)
    }

    // ═══════════════════════════════════════════════════════════════════
    // ExportData
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exportData_isEmpty_allEmpty() {
        val data = createEmptyData()
        assertTrue(data.isEmpty)
        assertEquals(0, data.totalRecords)
    }

    @Test
    fun exportData_isNotEmpty_whenHasAccounts() {
        TestFixtures.reset()
        val data = ExportData(
            accounts = listOf(TestFixtures.createAccount()),
            transactions = emptyList(),
            categories = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
        )
        assertFalse(data.isEmpty)
        assertEquals(1, data.totalRecords)
    }

    @Test
    fun exportData_totalRecords_sumsAllEntities() {
        val data = createSampleData()
        assertEquals(8, data.totalRecords)
    }

    // ═══════════════════════════════════════════════════════════════════
    // ExportProgress
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exportProgress_fractionComputation() {
        val progress = ExportProgress(ExportPhase.SERIALIZING, 2, 4)
        assertEquals(0.5f, progress.fraction)
    }

    @Test
    fun exportProgress_fractionZeroWhenTotalZero() {
        val progress = ExportProgress(ExportPhase.GATHERING_DATA, 0, 0)
        assertEquals(0f, progress.fraction)
    }

    // ═══════════════════════════════════════════════════════════════════
    // ExportEntityCounts
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exportEntityCounts_totalSumsAll() {
        val counts = ExportEntityCounts(
            accounts = 2,
            transactions = 10,
            categories = 5,
            budgets = 3,
            goals = 1,
        )
        assertEquals(21, counts.total)
    }
}
