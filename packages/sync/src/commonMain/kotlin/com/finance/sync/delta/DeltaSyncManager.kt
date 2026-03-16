// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.delta

import com.finance.sync.PushFailure
import com.finance.sync.PushResult
import com.finance.sync.SyncChange
import com.finance.sync.SyncConfig
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.conflict.SyncConflict

// ── Result types ────────────────────────────────────────────────────

/**
 * Result of validating a batch of incoming changes for sequence continuity
 * and data integrity.
 *
 * Returned by [DeltaSyncManager.processChanges] on a per-table basis.
 */
sealed class ChangeValidationResult {
    /**
     * All changes were applied successfully.
     *
     * @property appliedCount Number of changes applied in this batch.
     */
    data class Success(val appliedCount: Int) : ChangeValidationResult()

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
    ) : ChangeValidationResult()

    /**
     * One or more rows failed checksum verification.
     *
     * @property tableName The table containing the corrupt row(s).
     * @property failedRowIds The IDs of rows whose checksums didn't match.
     */
    data class ChecksumMismatch(
        val tableName: String,
        val failedRowIds: List<String>,
    ) : ChangeValidationResult()
}

/**
 * Result of a delta sync pull cycle.
 *
 * Produced by [DeltaSyncManager.executePullCycle] and consumed by the
 * sync engine to decide which changes to apply and which conflicts to
 * resolve before pushing.
 *
 * @property changes All changes pulled from the server across all pages.
 * @property conflicts Conflicts detected between pulled server changes and
 *   pending local mutations (same `tableName` + `recordId`).
 * @property newVersions Updated per-table sync versions after the pull.
 *   Already persisted in the [SequenceTracker] by the time this result
 *   is returned.
 * @property checksum A hex-encoded CRC-32 checksum of all pulled changes,
 *   or `null` when no changes were pulled. Useful for verifying that the
 *   client and server agree on the same data set.
 */
data class DeltaSyncResult(
    val changes: List<SyncChange>,
    val conflicts: List<SyncConflict>,
    val newVersions: Map<String, Long>,
    val checksum: String?,
)

// ── Manager ─────────────────────────────────────────────────────────

/**
 * Manages delta (incremental) synchronisation.
 *
 * Instead of pulling the full dataset on every sync, [DeltaSyncManager]
 * tracks the last sequence number per table and only requests changes after
 * that point.
 *
 * Coordinates the pull → conflict detection → push cycle:
 * 1. **Pull**: Request changes since last-known version per table, handling
 *    pagination when the server indicates [com.finance.sync.PullResult.hasMore].
 * 2. **Detect conflicts**: Compare pulled changes against pending local
 *    mutations to find records modified on both sides.
 * 3. **Push**: Send local mutations to the server in batches that respect
 *    [SyncConfig.batchSize].
 *
 * Conflict *resolution* is intentionally left to the caller (typically the
 * [com.finance.sync.SyncEngine]) so that the resolution strategy can vary
 * per table or be overridden by the user.
 *
 * @property provider The sync backend provider (e.g. PowerSync).
 * @property sequenceTracker Persists per-table sequence numbers across sessions.
 * @property config Sync configuration (batch size, retry policy, etc.).
 */
class DeltaSyncManager(
    private val provider: SyncProvider,
    private val sequenceTracker: SequenceTracker,
    private val config: SyncConfig,
) {

    // ── Pull ────────────────────────────────────────────────────────

    /**
     * Pull changes from the server since last-known versions.
     *
     * Handles pagination: when the server sets
     * [com.finance.sync.PullResult.hasMore] to `true`, additional pages are
     * fetched until the server indicates all changes have been delivered.
     *
     * On success, the [SequenceTracker] is updated with the new per-table
     * versions so the next pull starts from the correct point.
     *
     * @return All changes pulled across all pages.
     */
    suspend fun pullChanges(): List<SyncChange> {
        val allChanges = mutableListOf<SyncChange>()
        var hasMore = true

        while (hasMore) {
            val currentVersions = sequenceTracker.getAllVersions()
            val result = provider.pullChanges(currentVersions)
            allChanges.addAll(result.changes)
            sequenceTracker.updateVersions(result.newVersions)
            hasMore = result.hasMore
        }

        return allChanges
    }

    // ── Push ────────────────────────────────────────────────────────

    /**
     * Push local mutations to the server in batches.
     *
     * Mutations are chunked according to [SyncConfig.batchSize] and pushed
     * sequentially. Results from all batches are aggregated into a single
     * [PushResult].
     *
     * @param mutations The mutations to push.
     * @return Aggregate push result across all batches.
     */
    suspend fun pushMutations(mutations: List<SyncMutation>): PushResult {
        if (mutations.isEmpty()) {
            return PushResult(succeeded = emptyList(), failed = emptyList())
        }

        val allSucceeded = mutableListOf<String>()
        val allFailed = mutableListOf<PushFailure>()

        val batches = mutations.chunked(config.batchSize)
        for (batch in batches) {
            val result = provider.pushMutations(batch)
            allSucceeded.addAll(result.succeeded)
            allFailed.addAll(result.failed)
        }

        return PushResult(succeeded = allSucceeded, failed = allFailed)
    }

    // ── Conflict detection ──────────────────────────────────────────

    /**
     * Detect conflicts between pulled server changes and pending local
     * mutations.
     *
     * A conflict exists when a server change and a local mutation reference
     * the same record (same `tableName` + `recordId`). For each such pair,
     * a [SyncConflict] is created with both sides' data, versions, timestamps,
     * and operations so that the caller can resolve the conflict using a
     * [com.finance.sync.conflict.ConflictResolver].
     *
     * @param serverChanges Changes received from the server.
     * @param localMutations Pending local mutations.
     * @return List of detected conflicts; empty if there are no overlapping
     *   records.
     */
    fun detectConflicts(
        serverChanges: List<SyncChange>,
        localMutations: List<SyncMutation>,
    ): List<SyncConflict> {
        if (serverChanges.isEmpty() || localMutations.isEmpty()) return emptyList()

        // Index local mutations by "tableName:recordId" for O(1) lookup.
        val localByKey = buildMap<String, SyncMutation> {
            for (mutation in localMutations) {
                val recordId = mutation.recordId.ifBlank {
                    mutation.rowData["id"] ?: mutation.id
                }
                put("${mutation.tableName}:$recordId", mutation)
            }
        }

        val conflicts = mutableListOf<SyncConflict>()

        for (change in serverChanges) {
            val key = "${change.tableName}:${change.effectiveRecordId}"
            val localMutation = localByKey[key] ?: continue

            conflicts.add(
                SyncConflict(
                    tableName = change.tableName,
                    recordId = change.effectiveRecordId,
                    localData = localMutation.rowData,
                    serverData = change.rowData,
                    // Local mutations haven't been synced yet → version 0
                    localVersion = 0L,
                    serverVersion = change.syncVersion,
                    localTimestamp = localMutation.timestamp,
                    serverTimestamp = change.serverTimestamp,
                    localOperation = localMutation.operation,
                    serverOperation = change.operation,
                ),
            )
        }

        return conflicts
    }

    // ── Full pull cycle ─────────────────────────────────────────────

    /**
     * Execute a full pull cycle: pull → detect conflicts → compute checksum.
     *
     * Does **NOT** push — pushing is the [com.finance.sync.SyncEngine]'s
     * responsibility after conflict resolution.
     *
     * @param pendingMutations Current pending local mutations, used for
     *   conflict detection against the pulled server changes.
     * @return A [DeltaSyncResult] with all pulled changes, detected conflicts,
     *   updated version markers, and an integrity checksum.
     */
    suspend fun executePullCycle(
        pendingMutations: List<SyncMutation>,
    ): DeltaSyncResult {
        val changes = pullChanges()
        val conflicts = detectConflicts(changes, pendingMutations)
        val checksum = if (changes.isNotEmpty()) {
            SyncChecksum.computeForChanges(changes)
        } else {
            null
        }

        return DeltaSyncResult(
            changes = changes,
            conflicts = conflicts,
            newVersions = sequenceTracker.getAllVersions(),
            checksum = checksum,
        )
    }

    // ── Reset ───────────────────────────────────────────────────────

    /**
     * Force a full re-sync by resetting all sequence tracking.
     *
     * The next [pullChanges] or [executePullCycle] call will request all
     * records from version 0 for every table.
     */
    suspend fun resetSync() {
        sequenceTracker.resetAll()
    }

    // ── Change validation (sequence + checksum) ─────────────────────

    /**
     * Validate a batch of incoming [changes] for sequence continuity
     * and checksum integrity.
     *
     * For each table represented in the batch:
     * 1. Verify that the first change's sequence number follows the last
     *    known sequence (no gaps).
     * 2. Optionally verify row checksums when a `__checksum` field is present.
     * 3. Update the sequence tracker with the highest sequence seen.
     *
     * @return A [ChangeValidationResult] per table, keyed by table name.
     */
    suspend fun processChanges(
        changes: List<SyncChange>,
    ): Map<String, ChangeValidationResult> {
        if (changes.isEmpty()) return emptyMap()

        val byTable = changes.groupBy { it.tableName }
        val results = mutableMapOf<String, ChangeValidationResult>()

        for ((tableName, tableChanges) in byTable) {
            val sorted = tableChanges.sortedBy { it.sequenceNumber }
            val result = processTableChanges(tableName, sorted)
            results[tableName] = result
        }

        return results
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

    // ── Internal helpers ────────────────────────────────────────────

    /**
     * Process changes for a single table, validating sequence continuity
     * and checksums.
     */
    private suspend fun processTableChanges(
        tableName: String,
        sortedChanges: List<SyncChange>,
    ): ChangeValidationResult {
        val lastKnownSeq = sequenceTracker.getLastSequence(tableName)

        // --- Sequence gap detection ---
        val firstSeq = sortedChanges.first().sequenceNumber
        val expectedFirstSeq = if (lastKnownSeq != null) lastKnownSeq + 1 else firstSeq

        if (firstSeq != expectedFirstSeq) {
            // Gap detected — trigger a full resync for this table.
            sequenceTracker.resetTable(tableName)
            return ChangeValidationResult.SequenceGap(
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
                return ChangeValidationResult.SequenceGap(
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
            return ChangeValidationResult.ChecksumMismatch(
                tableName = tableName,
                failedRowIds = checksumFailures,
            )
        }

        // --- Success: advance the sequence tracker ---
        val highestSeq = sortedChanges.last().sequenceNumber
        sequenceTracker.setLastSequence(tableName, highestSeq)

        return ChangeValidationResult.Success(appliedCount = sortedChanges.size)
    }
}