// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.delta

import com.finance.sync.SyncChange

/**
 * Utility for computing and verifying checksums for sync data integrity.
 *
 * Uses a CRC-32 hash of canonically serialised data to detect accidental
 * corruption during transmission. This is intentionally *not* a cryptographic
 * hash — it only needs to catch accidental corruption, not adversarial
 * tampering (TLS handles that).
 *
 * The algorithm is a Kotlin-multiplatform-friendly implementation that
 * avoids `java.util.zip.CRC32` (JVM-only).
 */
object SyncChecksum {

    /**
     * Pre-computed CRC-32 lookup table (IEEE / ISO 3309 polynomial).
     */
    private val CRC_TABLE: IntArray by lazy {
        IntArray(256) { n ->
            var crc = n
            repeat(8) {
                crc = if (crc and 1 != 0) {
                    (crc ushr 1) xor 0xEDB88320.toInt()
                } else {
                    crc ushr 1
                }
            }
            crc
        }
    }

    /**
     * Compute a CRC-32 checksum of the given [data] bytes.
     *
     * @return The CRC-32 value as an unsigned [Long] in `0..0xFFFFFFFF`.
     */
    fun crc32(data: ByteArray): Long {
        var crc = 0xFFFFFFFF.toInt()
        for (byte in data) {
            val index = (crc xor byte.toInt()) and 0xFF
            crc = (crc ushr 8) xor CRC_TABLE[index]
        }
        return (crc xor 0xFFFFFFFF.toInt()).toLong() and 0xFFFFFFFFL
    }

    /**
     * Compute a checksum for a row represented as a map of column → value.
     *
     * The map keys are sorted to ensure deterministic ordering, then each
     * `key=value` pair is joined with `\n` and encoded to UTF-8 before
     * computing CRC-32.
     *
     * @return The CRC-32 value as an unsigned [Long].
     */
    fun computeRowChecksum(rowData: Map<String, String?>): Long {
        val canonical = rowData.keys
            .sorted()
            .joinToString(separator = "\n") { key -> "$key=${rowData[key] ?: "NULL"}" }
        return crc32(canonical.encodeToByteArray())
    }

    /**
     * Verify that the [expected] checksum matches the actual checksum of [rowData].
     *
     * @return `true` if the checksums match.
     */
    fun verifyRowChecksum(rowData: Map<String, String?>, expected: Long): Boolean =
        computeRowChecksum(rowData) == expected

    // ── Hex-string API (for DeltaSyncResult) ────────────────────────

    /**
     * Compute a checksum for a single record's data.
     *
     * Keys are sorted alphabetically for deterministic output, identical to
     * [computeRowChecksum] but returning a zero-padded, 8-character hex string
     * suitable for embedding in [DeltaSyncResult.checksum].
     *
     * @param data The record data as key-value pairs.
     * @return A hex-encoded CRC-32 checksum string (e.g. `"a3f0bc12"`).
     */
    fun computeForRecord(data: Map<String, String?>): String =
        computeRowChecksum(data).toHexString()

    /**
     * Compute a checksum for a collection of [SyncChange]s.
     *
     * Uses a stable ordering (sorted by `tableName`, then `effectiveRecordId`)
     * to ensure deterministic checksums regardless of receive order. Each
     * change contributes its table name, record ID, operation, and data
     * checksum to the combined hash.
     *
     * @param changes The sync changes to checksum.
     * @return A hex-encoded CRC-32 checksum string.
     */
    fun computeForChanges(changes: List<SyncChange>): String {
        if (changes.isEmpty()) return EMPTY_CHECKSUM

        val sorted = changes.sortedWith(
            compareBy({ it.tableName }, { it.effectiveRecordId }),
        )
        val combined = sorted.joinToString(separator = "|") { change ->
            "${change.tableName}:${change.effectiveRecordId}:" +
                "${change.operation}:${computeForRecord(change.rowData)}"
        }
        return crc32(combined.encodeToByteArray()).toHexString()
    }

    /**
     * Verify that a set of [changes] matches an [expectedChecksum].
     *
     * @return `true` if the computed checksum matches [expectedChecksum].
     */
    fun verify(changes: List<SyncChange>, expectedChecksum: String): Boolean =
        computeForChanges(changes) == expectedChecksum

    // ── Helpers ─────────────────────────────────────────────────────

    /**
     * Checksum value used for empty change sets.
     */
    private const val EMPTY_CHECKSUM = "00000000"

    /**
     * Format a CRC-32 [Long] value as a zero-padded, lower-case, 8-char hex string.
     */
    private fun Long.toHexString(): String =
        this.toString(16).padStart(8, '0')
}