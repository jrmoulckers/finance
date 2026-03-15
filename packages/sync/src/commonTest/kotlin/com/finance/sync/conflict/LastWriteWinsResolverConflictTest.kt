// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for the [LastWriteWinsResolver.resolveConflict] high-level API.
 *
 * The low-level [LastWriteWinsResolver.resolve] tests remain in
 * [LastWriteWinsResolverTest].
 */
class LastWriteWinsResolverConflictTest {

    private val resolver = LastWriteWinsResolver()

    private fun conflict(
        localOp: MutationOperation = MutationOperation.UPDATE,
        serverOp: MutationOperation = MutationOperation.UPDATE,
        localData: Map<String, String?>? = mapOf("id" to "1", "name" to "Local"),
        serverData: Map<String, String?>? = mapOf("id" to "1", "name" to "Server"),
        localVersion: Long = 1L,
        serverVersion: Long = 2L,
        localTs: String = "2024-01-01T10:00:00Z",
        serverTs: String = "2024-01-01T12:00:00Z",
    ) = SyncConflict(
        tableName = "transactions",
        recordId = "1",
        localData = localData,
        serverData = serverData,
        localVersion = localVersion,
        serverVersion = serverVersion,
        localTimestamp = Instant.parse(localTs),
        serverTimestamp = Instant.parse(serverTs),
        localOperation = localOp,
        serverOperation = serverOp,
    )

    // --- DELETE handling ---

    @Test
    fun serverDeleteAlwaysWins() {
        val result = resolver.resolveConflict(
            conflict(serverOp = MutationOperation.DELETE, serverData = null),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun localDeleteWinsWhenLocalVersionHigherOrEqual() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                localData = null,
                localVersion = 5,
                serverVersion = 3,
            ),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun localDeleteLosesWhenServerVersionIsHigher() {
        // Server "revived" the record with a higher version.
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                localData = null,
                localVersion = 3,
                serverVersion = 5,
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server", result.data?.get("name"))
    }

    @Test
    fun localDeleteEqualVersionsResultsInDelete() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                localData = null,
                localVersion = 5,
                serverVersion = 5,
            ),
        )
        // Equal versions: local delete intent is preserved because server
        // didn't exceed the local version.
        assertIs<ConflictResolution.Delete>(result)
    }

    // --- Version comparison (non-DELETE) ---

    @Test
    fun higherServerVersionWins() {
        val result = resolver.resolveConflict(
            conflict(localVersion = 3, serverVersion = 5),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server", result.data?.get("name"))
    }

    @Test
    fun higherLocalVersionWins() {
        val result = resolver.resolveConflict(
            conflict(localVersion = 7, serverVersion = 5),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("Local", result.data?.get("name"))
    }

    @Test
    fun equalVersionsServerWinsAsTieBreaker() {
        val result = resolver.resolveConflict(
            conflict(localVersion = 5, serverVersion = 5),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    // --- Both DELETE ---

    @Test
    fun bothDeleteResultsInDelete() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                serverOp = MutationOperation.DELETE,
                localData = null,
                serverData = null,
            ),
        )
        assertIs<ConflictResolution.Delete>(result)
    }
}
