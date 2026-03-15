// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import kotlinx.datetime.Instant

/**
 * Determines which [ConflictResolver] to use for a given table.
 *
 * Tables containing shared/complex entities (e.g. budgets, goals) use
 * [MERGE] to attempt field-level reconciliation, while simpler entities
 * default to [LAST_WRITE_WINS].
 */
enum class ConflictStrategy(val resolver: ConflictResolver) {

    /** Server timestamp comparison — latest write wins. */
    LAST_WRITE_WINS(LastWriteWinsResolver()),

    /** Field-level merge — non-conflicting fields are combined. */
    MERGE(MergeResolver()),

    /** Server always wins — discard local changes on conflict. */
    SERVER_WINS(ServerWinsResolver()),

    /** Client always wins — local changes override server. */
    CLIENT_WINS(ClientWinsResolver());

    companion object {
        /**
         * Default strategy mapping per table name.
         *
         * Tables not listed here fall back to [LAST_WRITE_WINS].
         */
        private val TABLE_STRATEGIES: Map<String, ConflictStrategy> = mapOf(
            "budgets" to MERGE,
            "goals" to MERGE,
            "households" to MERGE,
        )

        /**
         * Returns the appropriate [ConflictResolver] for the given [tableName].
         */
        fun resolverFor(tableName: String): ConflictResolver =
            (TABLE_STRATEGIES[tableName] ?: LAST_WRITE_WINS).resolver
    }
}

/**
 * Represents a detected conflict between a local mutation and a server change
 * targeting the same record.
 *
 * This type captures all the information needed by a [ConflictResolver] to
 * decide how to reconcile the two versions.
 *
 * @property tableName The database table affected.
 * @property recordId The primary key of the conflicting record.
 * @property localData The locally-modified row data, or `null` for deletes.
 * @property serverData The server-originated row data, or `null` for deletes.
 * @property localVersion The sync version of the local mutation.
 * @property serverVersion The sync version from the server.
 * @property localTimestamp When the local mutation was created.
 * @property serverTimestamp When the server change was applied.
 * @property localOperation The type of local mutation (INSERT, UPDATE, DELETE).
 * @property serverOperation The type of server mutation (INSERT, UPDATE, DELETE).
 */
data class SyncConflict(
    val tableName: String,
    val recordId: String,
    val localData: Map<String, String?>?,
    val serverData: Map<String, String?>?,
    val localVersion: Long,
    val serverVersion: Long,
    val localTimestamp: Instant,
    val serverTimestamp: Instant,
    val localOperation: MutationOperation,
    val serverOperation: MutationOperation,
) {
    init {
        require(tableName.isNotBlank()) { "Table name cannot be blank" }
        require(recordId.isNotBlank()) { "Record ID cannot be blank" }
        require(localVersion >= 0) { "Local version must be non-negative, got $localVersion" }
        require(serverVersion >= 0) { "Server version must be non-negative, got $serverVersion" }
    }

    /**
     * `true` when both sides performed a DELETE — resolution is always [ConflictResolution.Delete].
     */
    val isBothDeleted: Boolean
        get() = localOperation == MutationOperation.DELETE &&
            serverOperation == MutationOperation.DELETE

    /**
     * `true` when at least one side performed a DELETE.
     */
    val involvesDelete: Boolean
        get() = localOperation == MutationOperation.DELETE ||
            serverOperation == MutationOperation.DELETE
}

/**
 * The outcome of resolving a [SyncConflict].
 *
 * Every branch is exhaustively handleable in a `when` expression. Consumers
 * inspect the resolution to decide which row data to persist locally.
 */
sealed class ConflictResolution {

    /**
     * Use the server's version of the record.
     *
     * @property data The server row data to apply, or `null` when the server deleted the record.
     */
    data class AcceptServer(val data: Map<String, String?>?) : ConflictResolution()

    /**
     * Use the local version of the record.
     *
     * @property data The local row data to keep, or `null` when the local side deleted the record.
     */
    data class AcceptLocal(val data: Map<String, String?>?) : ConflictResolution()

    /**
     * Use a merged version combining fields from both local and server.
     *
     * @property data The merged row data. Conflicting fields that were resolved via
     *   fallback are annotated with `__conflict_<field>` keys containing the rejected value.
     */
    data class Merged(val data: Map<String, String?>) : ConflictResolution()

    /**
     * Delete the record. Used when at least one side issued a DELETE and the
     * resolution strategy honours delete intent.
     */
    data object Delete : ConflictResolution()
}
