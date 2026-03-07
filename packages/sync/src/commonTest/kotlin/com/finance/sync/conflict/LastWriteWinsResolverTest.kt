package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class LastWriteWinsResolverTest {

    private val resolver = LastWriteWinsResolver()

    // -- Helpers --

    private fun change(
        updatedAt: String?,
        serverTimestamp: String = "2024-01-01T00:00:00Z",
        seq: Long = 1L,
        extraData: Map<String, String?> = emptyMap(),
    ): SyncChange = SyncChange(
        tableName = "accounts",
        operation = MutationOperation.UPDATE,
        rowData = buildMap {
            put("id", "row-1")
            if (updatedAt != null) put("updated_at", updatedAt)
            putAll(extraData)
        },
        serverTimestamp = Instant.parse(serverTimestamp),
        sequenceNumber = seq,
    )

    // -- Tests --

    @Test
    fun remoteWinsWhenRemoteUpdatedAtIsLater() {
        val local = change(updatedAt = "2024-01-01T10:00:00Z")
        val remote = change(updatedAt = "2024-01-01T12:00:00Z")

        val result = resolver.resolve(local, remote)

        assertEquals(remote, result)
    }

    @Test
    fun localWinsWhenLocalUpdatedAtIsLater() {
        val local = change(updatedAt = "2024-01-01T14:00:00Z")
        val remote = change(updatedAt = "2024-01-01T12:00:00Z")

        val result = resolver.resolve(local, remote)

        assertEquals(local, result)
    }

    @Test
    fun tieBreakUsesServerTimestamp_remoteServerIsLater() {
        val local = change(
            updatedAt = "2024-01-01T12:00:00Z",
            serverTimestamp = "2024-01-01T12:00:01Z",
        )
        val remote = change(
            updatedAt = "2024-01-01T12:00:00Z",
            serverTimestamp = "2024-01-01T12:00:02Z",
        )

        val result = resolver.resolve(local, remote)

        assertEquals(remote, result, "Remote should win when its server timestamp is later")
    }

    @Test
    fun tieBreakUsesServerTimestamp_localServerIsLater() {
        val local = change(
            updatedAt = "2024-01-01T12:00:00Z",
            serverTimestamp = "2024-01-01T12:00:03Z",
        )
        val remote = change(
            updatedAt = "2024-01-01T12:00:00Z",
            serverTimestamp = "2024-01-01T12:00:02Z",
        )

        val result = resolver.resolve(local, remote)

        assertEquals(local, result, "Local should win when its server timestamp is later")
    }

    @Test
    fun absoluteTieFavorsRemote() {
        val timestamp = "2024-01-01T12:00:00Z"
        val local = change(updatedAt = timestamp, serverTimestamp = timestamp)
        val remote = change(updatedAt = timestamp, serverTimestamp = timestamp)

        val result = resolver.resolve(local, remote)

        assertEquals(remote, result, "Remote should win on absolute tie (server authority)")
    }

    @Test
    fun missingLocalUpdatedAtFavorsRemote() {
        val local = change(updatedAt = null)
        val remote = change(updatedAt = "2024-01-01T12:00:00Z")

        val result = resolver.resolve(local, remote)

        assertEquals(remote, result)
    }

    @Test
    fun missingRemoteUpdatedAtFavorsRemote() {
        val local = change(updatedAt = "2024-01-01T12:00:00Z")
        val remote = change(updatedAt = null)

        val result = resolver.resolve(local, remote)

        assertEquals(remote, result, "Remote wins when updated_at is missing (server authority)")
    }

    @Test
    fun bothMissingUpdatedAtFavorsRemote() {
        val local = change(updatedAt = null)
        val remote = change(updatedAt = null)

        val result = resolver.resolve(local, remote)

        assertEquals(remote, result)
    }
}
