// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

/**
 * Represents the current state of the sync engine.
 *
 * Modelled as a sealed class for exhaustive `when` handling — callers are
 * forced to handle every possible state at compile time.
 */
sealed class SyncStatus {

    /** The engine is idle; no sync activity in progress. */
    data object Idle : SyncStatus()

    /** The engine is establishing a connection to the sync backend. */
    data object Connecting : SyncStatus()

    /**
     * A sync cycle is actively running.
     *
     * @property progress Structured progress information including phase,
     *   processed records, and optional total record count.
     */
    data class Syncing(val progress: SyncProgress) : SyncStatus()

    /** The engine has an active, healthy connection to the sync backend. */
    data object Connected : SyncStatus()

    /**
     * A non-recoverable (or not-yet-recovered) error occurred during sync.
     *
     * @property error Structured error information. Uses [SyncError] sealed
     *   hierarchy instead of raw [Throwable] for multiplatform safety and
     *   exhaustive handling.
     */
    data class Error(val error: SyncError) : SyncStatus()

    /** The engine is not connected to the sync backend. */
    data object Disconnected : SyncStatus()
}

/**
 * Structured progress information for an active sync cycle.
 *
 * @property phase The current phase of the sync cycle.
 * @property processedRecords Number of records processed so far in this phase.
 * @property totalRecords Total number of records expected in this phase,
 *   or `null` when the total is indeterminate (e.g. streaming pull).
 */
data class SyncProgress(
    val phase: SyncPhase,
    val processedRecords: Int,
    val totalRecords: Int?,
) {
    init {
        require(processedRecords >= 0) {
            "Processed records must be non-negative, got $processedRecords"
        }
        if (totalRecords != null) {
            require(totalRecords >= 0) {
                "Total records must be non-negative, got $totalRecords"
            }
        }
    }

    /**
     * Normalised progress value in `0.0..1.0`, or `null` when indeterminate.
     */
    val fraction: Double?
        get() = if (totalRecords != null && totalRecords > 0) {
            (processedRecords.toDouble() / totalRecords).coerceIn(0.0, 1.0)
        } else {
            null
        }
}

/**
 * Phases within a single sync cycle, executed in order:
 * pull → conflict resolution → push.
 */
enum class SyncPhase {
    /** Pulling changes from the remote server. */
    PULLING,

    /** Pushing local mutations to the remote server. */
    PUSHING,

    /** Resolving conflicts between local and remote changes. */
    RESOLVING_CONFLICTS,
}

/**
 * Structured error types for sync failures.
 *
 * Uses a sealed class hierarchy instead of raw exceptions for
 * multiplatform compatibility and exhaustive `when` handling.
 */
sealed class SyncError {

    /** A network-level error (timeout, DNS, connection refused, etc.). */
    data class NetworkError(val message: String) : SyncError()

    /** An authentication or authorization error (expired token, revoked access). */
    data class AuthError(val message: String) : SyncError()

    /** One or more conflicts were detected that could not be auto-resolved. */
    data class ConflictError(val conflicts: Int) : SyncError()

    /** The server returned an error response. */
    data class ServerError(val statusCode: Int, val message: String) : SyncError()

    /** An unexpected or unclassified error. */
    data class Unknown(val cause: String) : SyncError()
}
