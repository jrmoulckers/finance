// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Supported export file formats.
 *
 * Each format specifies its file extension and MIME type for downstream
 * consumers (e.g., share-sheet integration, file pickers).
 */
enum class ExportFormat(val extension: String, val mimeType: String) {
    /** Full-fidelity JSON export containing all entities and metadata. */
    JSON("json", "application/json"),

    /**
     * CSV export — actually produces a ZIP archive containing one CSV per entity type.
     * The [extension] is "zip" to reflect the real file format.
     */
    CSV("zip", "text/csv"),
}

/**
 * Metadata included in every export, providing provenance and integrity information.
 *
 * The [userIdHash] is a SHA-256 hex digest of the raw user ID, ensuring the export
 * does not contain PII while still allowing correlation across exports by the same user.
 */
@Serializable
data class ExportMetadata(
    /** Timestamp when the export was generated. */
    val exportDate: Instant,
    /** Application version that produced the export (e.g., "1.0.0"). */
    val appVersion: String,
    /** Schema version for the export format. Increment on breaking changes. */
    val schemaVersion: String,
    /** SHA-256 hex digest of the user's ID, prefixed with "sha256:". */
    val userIdHash: String,
    /** Counts of each entity type included in the export. */
    val entityCounts: ExportEntityCounts,
)

/**
 * Per-entity-type record counts included in [ExportMetadata].
 */
@Serializable
data class ExportEntityCounts(
    val accounts: Int,
    val transactions: Int,
    val categories: Int,
    val budgets: Int,
    val goals: Int,
) {
    /** Total number of records across all entity types. */
    val total: Int get() = accounts + transactions + categories + budgets + goals
}

/**
 * Successful export result containing the serialized content and integrity data.
 *
 * @property content The serialized data — a JSON string for [ExportFormat.JSON],
 *                   or a base64-encoded ZIP for [ExportFormat.CSV].
 * @property format  The format that produced [content].
 * @property filename Suggested filename (e.g., "finance-export-2026-03-15.json").
 * @property metadata Provenance and entity-count metadata.
 * @property checksum SHA-256 hex digest of [content] for integrity verification.
 * @property sizeBytes Length of [content] in bytes (UTF-8 encoded).
 */
data class ExportResult(
    val content: String,
    val format: ExportFormat,
    val filename: String,
    val metadata: ExportMetadata,
    val checksum: String,
    val sizeBytes: Long,
)

/**
 * Progress update emitted during an export operation.
 *
 * @property phase   The current phase of the export pipeline.
 * @property current Number of completed steps within this phase.
 * @property total   Total steps expected in this phase.
 */
data class ExportProgress(
    val phase: ExportPhase,
    val current: Int,
    val total: Int,
) {
    /** Completion fraction in [0.0, 1.0]. Returns 0 when [total] is zero. */
    val fraction: Float get() = if (total > 0) current.toFloat() / total else 0f
}

/**
 * Phases of the export pipeline, reported via [ExportProgress].
 */
enum class ExportPhase {
    /** Validating and gathering data for export. */
    GATHERING_DATA,
    /** Converting data to the target format (JSON, CSV, etc.). */
    SERIALIZING,
    /** Computing SHA-256 checksum of the serialized content. */
    COMPUTING_CHECKSUM,
    /** Export completed successfully. */
    COMPLETE,
}

/**
 * Sealed hierarchy of export errors for exhaustive `when` handling.
 *
 * Follows the project-wide pattern established by [com.finance.core.validation.ValidationError]:
 * sealed base class with a human-readable [message] and concrete data subclasses.
 */
sealed class ExportError(val message: String) {
    /** No exportable data was found — all entity lists are empty. */
    data class NoData(
        val detail: String = "No exportable data found",
    ) : ExportError(detail)

    /** The [ExportSerializer] failed to serialize the data. */
    data class SerializationFailed(
        val cause: String,
    ) : ExportError("Serialization failed: $cause")

    /** SHA-256 checksum computation failed unexpectedly. */
    data class ChecksumFailed(
        val cause: String,
    ) : ExportError("Checksum computation failed: $cause")
}
