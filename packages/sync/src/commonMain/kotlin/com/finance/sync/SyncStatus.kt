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

    /**
     * A sync cycle is actively running.
     *
     * @property progress A normalised value in `0.0..1.0` indicating completion,
     *   or `null` when indeterminate.
     */
    data class Syncing(val progress: Double? = null) : SyncStatus() {
        init {
            if (progress != null) {
                require(progress in 0.0..1.0) {
                    "Sync progress must be in 0.0..1.0, got $progress"
                }
            }
        }
    }

    /** A non-recoverable (or not-yet-recovered) error occurred during sync. */
    data class Error(val exception: Throwable) : SyncStatus()

    /** The engine has an active, healthy connection to the sync backend. */
    data object Connected : SyncStatus()

    /** The engine is not connected to the sync backend. */
    data object Disconnected : SyncStatus()
}
