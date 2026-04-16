// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlin.test.*

/**
 * Tests for [ExportComplianceValidator] — GDPR compliance validation
 * of export output, sync field stripping, user ID anonymization,
 * checksum integrity.
 */
class ExportComplianceValidatorTest {

    private val fixedInstant = Instant.parse("2026-03-15T10:30:00Z")
    private val testUserId = SyncId("user-abc-123")

    private fun createSampleData(): ExportData {
        TestFixtures.reset()
        return ExportData(
            accounts = listOf(TestFixtures.createAccount()),
            transactions = listOf(TestFixtures.createExpense()),
            categories = listOf(
                Category(
                    id = TestFixtures.nextId(),
                    householdId = SyncId("household-1"),
                    name = "Food",
                    createdAt = fixedInstant,
                    updatedAt = fixedInstant,
                ),
            ),
            budgets = listOf(TestFixtures.createBudget()),
            goals = emptyList(),
        )
    }

    // ── JSON export compliance ────────────────────────────────────────

    @Test
    fun jsonExportPassesCompliance() {
        val data = createSampleData()
        val serializer = JsonExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val violations = ExportComplianceValidator.validate(outcome.export)
        assertTrue(
            violations.isEmpty(),
            "JSON export should be compliant, but found: ${violations.map { it.message }}",
        )
    }

    @Test
    fun jsonExportDoesNotContainSyncVersion() {
        val data = createSampleData()
        val serializer = JsonExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertFalse(
            outcome.export.content.contains("syncVersion"),
            "Export content must not contain 'syncVersion'",
        )
        assertFalse(
            outcome.export.content.contains("sync_version"),
            "Export content must not contain 'sync_version'",
        )
    }

    @Test
    fun jsonExportDoesNotContainIsSynced() {
        val data = createSampleData()
        val serializer = JsonExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        assertFalse(
            outcome.export.content.contains("isSynced"),
            "Export content must not contain 'isSynced'",
        )
        assertFalse(
            outcome.export.content.contains("is_synced"),
            "Export content must not contain 'is_synced'",
        )
    }

    // ── CSV export compliance ────────────────────────────────────────

    @Test
    fun csvExportPassesCompliance() {
        val data = createSampleData()
        val serializer = CsvExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val violations = ExportComplianceValidator.validate(outcome.export)
        assertTrue(
            violations.isEmpty(),
            "CSV export should be compliant, but found: ${violations.map { it.message }}",
        )
    }

    @Test
    fun csvExportDoesNotContainSyncFields() {
        val data = createSampleData()
        val serializer = CsvExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val content = outcome.export.content
        assertFalse(content.contains("sync_version"), "CSV must not contain 'sync_version'")
        assertFalse(content.contains("is_synced"), "CSV must not contain 'is_synced'")
        assertFalse(content.contains("syncVersion"), "CSV must not contain 'syncVersion'")
        assertFalse(content.contains("isSynced"), "CSV must not contain 'isSynced'")
    }

    // ── User ID anonymization ────────────────────────────────────────

    @Test
    fun userIdIsAnonymizedInMetadata() {
        val data = createSampleData()
        val serializer = JsonExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        // Raw user ID must not appear in the content
        assertFalse(
            outcome.export.content.contains(testUserId.value),
            "Raw user ID '${testUserId.value}' must not appear in export content",
        )
        // But the hashed version should
        assertTrue(outcome.export.metadata.userIdHash.startsWith("sha256:"))
    }

    // ── Checksum integrity ───────────────────────────────────────────

    @Test
    fun checksumMatchesContent() {
        val data = createSampleData()
        val serializer = JsonExportSerializer()

        val outcome = DataExportService.export(
            data = data,
            serializer = serializer,
            userId = testUserId,
            appVersion = "1.0.0",
            exportInstant = fixedInstant,
        )

        assertIs<ExportOutcome.Success>(outcome)
        val expectedChecksum = Sha256.hexDigest(outcome.export.content)
        assertEquals(expectedChecksum, outcome.export.checksum)
    }

    // ── Violation detection ──────────────────────────────────────────

    @Test
    fun detectsProhibitedField() {
        // Construct a fake export result with prohibited content
        val result = ExportResult(
            content = """{"syncVersion": 5, "data": []}""",
            format = ExportFormat.JSON,
            filename = "test.json",
            metadata = ExportMetadata(
                exportDate = fixedInstant,
                appVersion = "1.0.0",
                schemaVersion = "1.0",
                userIdHash = "sha256:${Sha256.hexDigest("test")}",
                entityCounts = ExportEntityCounts(0, 0, 0, 0, 0),
            ),
            checksum = Sha256.hexDigest("""{"syncVersion": 5, "data": []}"""),
            sizeBytes = 30,
        )

        val violations = ExportComplianceValidator.validate(result)
        assertTrue(violations.any { it is ComplianceViolation.ProhibitedFieldPresent })
    }

    @Test
    fun detectsBadUserIdHash() {
        val content = "{}"
        val result = ExportResult(
            content = content,
            format = ExportFormat.JSON,
            filename = "test.json",
            metadata = ExportMetadata(
                exportDate = fixedInstant,
                appVersion = "1.0.0",
                schemaVersion = "1.0",
                userIdHash = "raw-user-id-not-hashed",
                entityCounts = ExportEntityCounts(0, 0, 0, 0, 0),
            ),
            checksum = Sha256.hexDigest(content),
            sizeBytes = 2,
        )

        val violations = ExportComplianceValidator.validate(result)
        assertTrue(violations.any { it is ComplianceViolation.UserIdNotAnonymized })
    }

    @Test
    fun detectsChecksumMismatch() {
        val content = """{"data": "test"}"""
        val result = ExportResult(
            content = content,
            format = ExportFormat.JSON,
            filename = "test.json",
            metadata = ExportMetadata(
                exportDate = fixedInstant,
                appVersion = "1.0.0",
                schemaVersion = "1.0",
                userIdHash = "sha256:${Sha256.hexDigest("test")}",
                entityCounts = ExportEntityCounts(0, 0, 0, 0, 0),
            ),
            checksum = "0000000000000000000000000000000000000000000000000000000000000000",
            sizeBytes = content.length.toLong(),
        )

        val violations = ExportComplianceValidator.validate(result)
        assertTrue(violations.any { it is ComplianceViolation.ChecksumMismatch })
    }
}
