package com.finance.sync.delta

/**
 * Persists the last-synced sequence number for each table.
 *
 * Backed by an interface so the storage mechanism is pluggable --
 * in-memory for tests, SQLite or MMKV in production.
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
}

/**
 * Simple in-memory implementation for testing and bootstrap scenarios.
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
}