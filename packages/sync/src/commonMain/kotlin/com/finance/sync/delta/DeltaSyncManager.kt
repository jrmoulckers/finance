package com.finance.sync.delta

import com.finance.sync.SyncChange

/**
 * Result of applying a batch of delta changes.
 */
sealed class DeltaSyncResult {
    /**
     * All changes were applied successfully.
     *
     * @property appliedCount Number of changes applied in this batch.
     */
    data class Success(val appliedCount: Int) : DeltaSyncResult()

    /**
     * A sequence gap was detected. The affected table requires a full resync.
     *
     * @property tableName The table with the gap.
     * @property expectedSequence The sequence number we expected next.
     * @property actualSequence The sequence number we received.
     */
    data class SequenceGap(
        val tableName: String,
        val expectedSequence: Long,
        val actualSequence: Long,
    ) : DeltaSyncResult()

    /**
     * One or more rows failed checksum verification.
     *
     * @property tableName The table containing the corrupt row(s).
     * @property failedRowIds The IDs of rows whose checksums didn't match.
     */
    data class ChecksumMismatch(
        val tableName: String,
        val failedRowIds: List<String>,
    ) : DeltaSyncResult()
}

/**
 * Manages delta (incremental) synchronisation.
 *
 * Instead of pulling the full dataset on every sync, [DeltaSyncManager] tracks
 * the last sequence number per table and only requests changes after that point.
 *
 * @property sequenceTracker Persists per-table sequence numbers across sessions.
 */
class DeltaSyncManager(
    private val sequenceTracker: SequenceTracker,
) {

    /**
     * Process a batch of incoming [changes] from the sync backend.
     *
     * For each table represented in the batch:
     * 1. Verify that the first change's sequence number follows the last
     *    known sequence (no gaps).
     * 2. Optionally verify row checksums when a `__checksum` field is present.
     * 3. Update the sequence tracker with the highest sequence seen.
     *
     * @return A [DeltaSyncResult] per table, keyed by table name.
     */
    suspend fun processChanges(changes: List<SyncChange>): Map<String, DeltaSyncResult> {
        if (changes.isEmpty()) return emptyMap()

        val byTable = changes.groupBy { it.tableName }
        val results = mutableMapOf<String, DeltaSyncResult>()

        for ((tableName, tableChanges) in byTable) {
            val sorted = tableChanges.sortedBy { it.sequenceNumber }
            val result = processTableChanges(tableName, sorted)
            results[tableName] = result
        }

        return results
    }

    /**
     * Process changes for a single table, validating sequence continuity
     * and checksums.
     */
    private suspend fun processTableChanges(
        tableName: String,
        sortedChanges: List<SyncChange>,
    ): DeltaSyncResult {
        val lastKnownSeq = sequenceTracker.getLastSequence(tableName)

        // --- Sequence gap detection ---
        val firstSeq = sortedChanges.first().sequenceNumber
        val expectedFirstSeq = if (lastKnownSeq != null) lastKnownSeq + 1 else firstSeq

        if (firstSeq != expectedFirstSeq) {
            // Gap detected -- trigger a full resync for this table.
            sequenceTracker.resetTable(tableName)
            return DeltaSyncResult.SequenceGap(
                tableName = tableName,
                expectedSequence = expectedFirstSeq,
                actualSequence = firstSeq,
            )
        }

        // Verify intra-batch continuity.
        for (i in 1 until sortedChanges.size) {
            val prev = sortedChanges[i - 1].sequenceNumber
            val curr = sortedChanges[i].sequenceNumber
            if (curr != prev + 1) {
                sequenceTracker.resetTable(tableName)
                return DeltaSyncResult.SequenceGap(
                    tableName = tableName,
                    expectedSequence = prev + 1,
                    actualSequence = curr,
                )
            }
        }

        // --- Checksum verification ---
        val checksumFailures = mutableListOf<String>()
        for (change in sortedChanges) {
            val expectedChecksum = change.rowData["__checksum"]
            if (expectedChecksum != null) {
                val dataWithoutChecksum = change.rowData.filterKeys { it != "__checksum" }
                val expected = expectedChecksum.toLongOrNull() ?: continue
                if (!SyncChecksum.verifyRowChecksum(dataWithoutChecksum, expected)) {
                    val rowId = change.rowData["id"] ?: change.sequenceNumber.toString()
                    checksumFailures.add(rowId)
                }
            }
        }

        if (checksumFailures.isNotEmpty()) {
            return DeltaSyncResult.ChecksumMismatch(
                tableName = tableName,
                failedRowIds = checksumFailures,
            )
        }

        // --- Success: advance the sequence tracker ---
        val highestSeq = sortedChanges.last().sequenceNumber
        sequenceTracker.setLastSequence(tableName, highestSeq)

        return DeltaSyncResult.Success(appliedCount = sortedChanges.size)
    }

    /**
     * Force a full resync for the given [tableName] by clearing its
     * tracked sequence.
     */
    suspend fun requestFullResync(tableName: String) {
        sequenceTracker.resetTable(tableName)
    }

    /**
     * Force a full resync for all tables.
     */
    suspend fun requestFullResyncAll() {
        sequenceTracker.reset()
    }

    /**
     * Returns the last synced sequence number for [tableName], or `null`
     * if the table has never been synced.
     */
    suspend fun getLastSequence(tableName: String): Long? =
        sequenceTracker.getLastSequence(tableName)
}