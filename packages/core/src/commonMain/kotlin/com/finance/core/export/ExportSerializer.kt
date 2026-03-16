// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

/**
 * Format-specific serializer for financial data export.
 *
 * Implementations handle the actual conversion of [ExportData] to a string
 * representation in a specific format (JSON, CSV, etc.).
 *
 * Sync-internal fields (`syncVersion`, `isSynced`) on the domain models
 * **must not** appear in the serialized output. Implementations are responsible
 * for stripping or mapping these fields during serialization.
 *
 * Implementations:
 * - JSON serializer (issue #350) — produces a formatted JSON string.
 * - CSV serializer (issue #355) — produces a multi-section RFC 4180-compliant
 *   CSV string.
 *
 * @see DataExportService for orchestration
 */
interface ExportSerializer {

    /** The format this serializer produces. */
    val format: ExportFormat

    /**
     * Serializes export data with metadata into a string representation.
     *
     * For [ExportFormat.JSON]: produces a pretty-printed JSON string.
     * For [ExportFormat.CSV]: produces a multi-section RFC 4180-compliant CSV string.
     *
     * @param data The financial data to serialize (pre-filtered, no deleted records).
     * @param metadata Export metadata to include in the output.
     * @return The serialized content as a string.
     * @throws IllegalStateException if the data cannot be serialized.
     */
    fun serialize(data: ExportData, metadata: ExportMetadata): String
}
