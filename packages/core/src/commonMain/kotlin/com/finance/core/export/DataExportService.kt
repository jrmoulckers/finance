// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.types.SyncId
import kotlinx.datetime.*

/**
 * Orchestrates financial data export from local storage to portable formats.
 *
 * This service coordinates validating data, delegating to format-specific
 * [ExportSerializer] implementations, and computing integrity checksums.
 *
 * Exports run entirely client-side from local SQLite — no server round-trip.
 * Internal sync fields (`syncVersion`, `isSynced`) are never included in output;
 * the [ExportSerializer] implementation is responsible for stripping them.
 * Soft-deleted records (`deletedAt != null`) must be pre-filtered by the caller.
 *
 * Usage:
 * ```
 * val result = DataExportService.export(
 *     data = ExportData(accounts, transactions, categories, budgets, goals),
 *     serializer = jsonSerializer,
 *     userId = currentUserId,
 *     appVersion = "1.0.0",
 * )
 * when (result) {
 *     is ExportOutcome.Success -> handleExport(result.export)
 *     is ExportOutcome.Failure -> showError(result.error)
 * }
 * ```
 *
 * @see ExportSerializer for format-specific serialization
 * @see ExportData for the input data container
 * @see ExportOutcome for the result type
 */
object DataExportService {

    /** Current export schema version. Increment on breaking changes to the export format. */
    const val SCHEMA_VERSION = "1.0"

    /**
     * Exports all financial data using the specified serializer.
     *
     * The export pipeline proceeds in four phases:
     * 1. **GATHERING_DATA** — validates that [data] is non-empty and builds metadata.
     * 2. **SERIALIZING** — delegates to [serializer] to produce the content string.
     * 3. **COMPUTING_CHECKSUM** — computes SHA-256 hex digest of the content.
     * 4. **COMPLETE** — packages everything into [ExportResult].
     *
     * Progress is reported via [onProgress] at each phase boundary.
     *
     * @param data All financial data to export (pre-filtered, no deleted records).
     * @param serializer Format-specific serializer implementation.
     * @param userId The authenticated user's ID (will be SHA-256 hashed in metadata).
     * @param appVersion Current application version string.
     * @param exportInstant Override for the export timestamp. Defaults to [Clock.System.now].
     *                      Exposed for deterministic testing.
     * @param onProgress Optional callback for progress updates.
     * @return [ExportOutcome.Success] with the export result, or [ExportOutcome.Failure]
     *         with error details.
     */
    fun export(
        data: ExportData,
        serializer: ExportSerializer,
        userId: SyncId,
        appVersion: String,
        exportInstant: Instant = Clock.System.now(),
        onProgress: ((ExportProgress) -> Unit)? = null,
    ): ExportOutcome {
        // Phase 1: Validate data
        if (data.isEmpty) {
            return ExportOutcome.Failure(ExportError.NoData())
        }

        val totalPhases = ExportPhase.entries.size

        onProgress?.invoke(ExportProgress(ExportPhase.GATHERING_DATA, 1, totalPhases))

        // Build metadata
        val metadata = ExportMetadata(
            exportDate = exportInstant,
            appVersion = appVersion,
            schemaVersion = SCHEMA_VERSION,
            userIdHash = hashUserId(userId),
            entityCounts = ExportEntityCounts(
                accounts = data.accounts.size,
                transactions = data.transactions.size,
                categories = data.categories.size,
                budgets = data.budgets.size,
                goals = data.goals.size,
            ),
        )

        // Phase 2: Serialize
        onProgress?.invoke(ExportProgress(ExportPhase.SERIALIZING, 2, totalPhases))

        val content: String = try {
            serializer.serialize(data, metadata)
        } catch (e: Exception) {
            return ExportOutcome.Failure(
                ExportError.SerializationFailed(e.message ?: "Unknown serialization error"),
            )
        }

        // Phase 3: Compute checksum
        onProgress?.invoke(ExportProgress(ExportPhase.COMPUTING_CHECKSUM, 3, totalPhases))

        val checksum: String = try {
            computeChecksum(content)
        } catch (e: Exception) {
            return ExportOutcome.Failure(
                ExportError.ChecksumFailed(e.message ?: "Unknown checksum error"),
            )
        }

        // Phase 4: Complete
        val result = ExportResult(
            content = content,
            format = serializer.format,
            filename = generateFilename(serializer.format, exportInstant),
            metadata = metadata,
            checksum = checksum,
            sizeBytes = content.encodeToByteArray().size.toLong(),
        )

        onProgress?.invoke(ExportProgress(ExportPhase.COMPLETE, totalPhases, totalPhases))

        return ExportOutcome.Success(result)
    }

    /**
     * Generates a timestamped filename for the export.
     *
     * Format: `finance-export-{yyyy-MM-dd}.{extension}`
     *
     * Uses the UTC date from [exportDate] to ensure consistent filenames
     * regardless of the user's time zone.
     *
     * @param format The export format (determines the file extension).
     * @param exportDate The instant to derive the date from.
     * @return A filename string, e.g., "finance-export-2026-03-15.json".
     */
    internal fun generateFilename(format: ExportFormat, exportDate: Instant): String {
        val date = exportDate.toLocalDateTime(TimeZone.UTC).date
        return "finance-export-${date}.${format.extension}"
    }

    /**
     * Creates an anonymised user identifier by SHA-256 hashing the raw user ID.
     *
     * The result is prefixed with `"sha256:"` for clarity and self-documentation
     * when inspecting export files.
     *
     * @param userId The raw user ID to hash.
     * @return A string like `"sha256:e3b0c44298fc1c149afbf4c8996fb924..."`.
     */
    internal fun hashUserId(userId: SyncId): String {
        return "sha256:${Sha256.hexDigest(userId.value)}"
    }

    /**
     * Computes the SHA-256 hex digest of the given content string.
     *
     * The content is UTF-8 encoded before hashing.
     *
     * @param content The string to hash.
     * @return 64-character lowercase hexadecimal digest.
     */
    internal fun computeChecksum(content: String): String {
        return Sha256.hexDigest(content)
    }
}

/**
 * Outcome of an export operation — either [Success] with the result or [Failure] with an error.
 *
 * Follows the project-wide pattern of sealed class outcomes for exhaustive `when` handling,
 * avoiding exceptions for business-logic errors.
 */
sealed class ExportOutcome {
    /** Export completed successfully. */
    data class Success(val export: ExportResult) : ExportOutcome()

    /** Export failed with a domain-specific error. */
    data class Failure(val error: ExportError) : ExportOutcome()
}
