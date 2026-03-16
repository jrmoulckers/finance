// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ClientWinsResolverTest {

    private val resolver = ClientWinsResolver()

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
    fun localUpdateAlwaysWinsOverServerUpdate() {
        val result = resolver.resolveConflict(conflict())
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("Local", result.data?.get("name"))
    }

    @Test
    fun localUpdateWinsEvenWhenServerVersionIsHigher() {
        val result = resolver.resolveConflict(
            conflict(localVersion = 1, serverVersion = 100),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
    }

    @Test
    fun localDeleteWins() {
        val result = resolver.resolveConflict(
            conflict(localOp = MutationOperation.DELETE, localData = null),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun localInsertWinsOverServerInsert() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.INSERT,
                serverOp = MutationOperation.INSERT,
            ),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
    }

    @Test
    fun localUpdateWinsOverServerDelete() {
        val result = resolver.resolveConflict(
            conflict(
                serverOp = MutationOperation.DELETE,
                serverData = null,
            ),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("Local", result.data?.get("name"))
    }
}
