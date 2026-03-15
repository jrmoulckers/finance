// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ServerWinsResolverTest {

    private val resolver = ServerWinsResolver()

    private fun conflict(
        localOp: MutationOperation = MutationOperation.UPDATE,
        serverOp: MutationOperation = MutationOperation.UPDATE,
        localData: Map<String, String?>? = mapOf("id" to "1", "name" to "Local"),
        serverData: Map<String, String?>? = mapOf("id" to "1", "name" to "Server"),
        localVersion: Long = 1L,
        serverVersion: Long = 2L,
    ) = SyncConflict(
        tableName = "accounts",
        recordId = "1",
        localData = localData,
        serverData = serverData,
        localVersion = localVersion,
        serverVersion = serverVersion,
        localTimestamp = Instant.parse("2024-01-01T10:00:00Z"),
        serverTimestamp = Instant.parse("2024-01-01T12:00:00Z"),
        localOperation = localOp,
        serverOperation = serverOp,
    )

    @Test
    fun serverUpdateAlwaysWinsOverLocalUpdate() {
        val result = resolver.resolveConflict(conflict())
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server", result.data?.get("name"))
    }

    @Test
    fun serverUpdateWinsEvenWhenLocalVersionIsHigher() {
        val result = resolver.resolveConflict(
            conflict(localVersion = 10, serverVersion = 1),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun serverDeleteWins() {
        val result = resolver.resolveConflict(
            conflict(serverOp = MutationOperation.DELETE, serverData = null),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun serverInsertWinsOverLocalInsert() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.INSERT,
                serverOp = MutationOperation.INSERT,
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun serverUpdateWinsOverLocalDelete() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                localData = null,
                serverOp = MutationOperation.UPDATE,
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server", result.data?.get("name"))
    }
}
