// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.delta

/**
 * Persists the last-synced sequence number / sync version for each table.
 *
 * Backed by an interface so the storage mechanism is pluggable —
 * in-memory for tests, SQLite or MMKV in production.
 *
 * The interface exposes `suspend` functions because production implementations
 * (e.g. SQLite-backed) perform I/O. In-memory implementations can delegate to
 * simple map operations.
 */
interface SequenceTracker {

    /**
     * Return the last successfully synced sequence number for [tableName],
     * or `null` if the table has never been synced.
     */
    suspend fun getLastSequence(tableName: String): Long?

    /**
     * Persist [sequenceNumber] as the last successfully synced sequence
     * for [tableName].
     */
    suspend fun setLastSequence(tableName: String, sequenceNumber: Long)

    /**
     * Clear all tracked sequences, forcing a full resync on next pull.
     */
    suspend fun reset()

    /**
     * Clear the tracked sequence for a single table, forcing a full resync
     * for that table on next pull.
     */
    suspend fun resetTable(tableName: String)

    // ── Extended API ────────────────────────────────────────────────

    /**
     * All table names that currently have a tracked version.
     *
     * Returns a snapshot; subsequent mutations do not affect the returned set.
     * Default implementation returns an empty set — override in implementations
     * that maintain an index of tracked tables.
     */
    suspend fun trackedTables(): Set<String> = emptySet()

    /**
     * Get the last-known sync version for [tableName].
     *
     * Convenience wrapper around [getLastSequence] that returns `0L` instead
     * of `null` when the table has never been synced, matching the common
     * pattern of "pull everything with `syncVersion > 0`" on first sync.
     *
     * @return The last synced version, or `0L` if the table has never been synced.
     */
    suspend fun getVersion(tableName: String): Long =
        getLastSequence(tableName) ?: 0L

    /**
     * Get all tracked versions as a map suitable for passing directly to
     * [com.finance.sync.SyncProvider.pullChanges].
     *
     * @return Map of table name → last synced version.
     */
    suspend fun getAllVersions(): Map<String, Long> = emptyMap()

    /**
     * Update the version for a single table after a successful pull.
     *
     * Only records forward progress — if [version] is not greater than the
     * currently tracked value, the call is a no-op.
     *
     * @param tableName The table whose version to update.
     * @param version The new sync version.
     */
    suspend fun updateVersion(tableName: String, version: Long) {
        val current = getLastSequence(tableName)
        if (current == null || version > current) {
            setLastSequence(tableName, version)
        }
    }

    /**
     * Batch update versions, typically from
     * [com.finance.sync.PullResult.newVersions].
     *
     * Each entry is applied via [updateVersion], so only forward progress
     * is recorded.
     *
     * @param versions Map of table name → new sync version.
     */
    suspend fun updateVersions(versions: Map<String, Long>) {
        for ((table, version) in versions) {
            updateVersion(table, version)
        }
    }

    /**
     * Reset all tracked versions, forcing a full re-sync of every table.
     *
     * Alias for [reset] that follows the naming convention used by
     * [DeltaSyncManager.resetSync].
     */
    suspend fun resetAll() {
        reset()
    }

    /**
     * Check if any table has been synced at least once.
     *
     * @return `true` if at least one table has a tracked version.
     */
    suspend fun hasEverSynced(): Boolean =
        trackedTables().isNotEmpty()
}

/**
 * Simple in-memory [SequenceTracker] for testing and bootstrap scenarios.
 *
 * All state is held in a [MutableMap] and lost on process exit. For production
 * use, the state should be persisted to SQLite (via SQLDelight) so that sync
 * resumes from the correct point after app restart.
 */
class InMemorySequenceTracker : SequenceTracker {

    private val sequences = mutableMapOf<String, Long>()

    override suspend fun getLastSequence(tableName: String): Long? =
        sequences[tableName]

    override suspend fun setLastSequence(tableName: String, sequenceNumber: Long) {
        sequences[tableName] = sequenceNumber
    }

    override suspend fun reset() {
        sequences.clear()
    }

    override suspend fun resetTable(tableName: String) {
        sequences.remove(tableName)
    }

    // ── Extended overrides ──────────────────────────────────────────

    override suspend fun trackedTables(): Set<String> =
        sequences.keys.toSet()

    override suspend fun getAllVersions(): Map<String, Long> =
        sequences.toMap()

    override suspend fun hasEverSynced(): Boolean =
        sequences.isNotEmpty()
}