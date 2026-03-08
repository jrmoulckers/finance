// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.delta

/**
 * Utility for computing and verifying row-level checksums.
 *
 * Uses a simple CRC-style hash of the serialised row data to detect
 * data corruption during sync. This is intentionally *not* a cryptographic
 * hash -- it only needs to catch accidental corruption, not adversarial
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
     * Compute a checksum for a row represented as a map of column -> value.
     *
     * The map keys are sorted to ensure deterministic ordering, then each
     * `key=value` pair is joined with `\n` and encoded to UTF-8 before
     * computing CRC-32.
     */
    fun computeRowChecksum(rowData: Map<String, String?>): Long {
        val canonical = rowData.keys
            .sorted()
            .joinToString(separator = "\n") { key -> "$key=${rowData[key] ?: "NULL"}" }
        return crc32(canonical.encodeToByteArray())
    }

    /**
     * Verify that the [expected] checksum matches the actual checksum of [rowData].
     */
    fun verifyRowChecksum(rowData: Map<String, String?>, expected: Long): Boolean =
        computeRowChecksum(rowData) == expected
}