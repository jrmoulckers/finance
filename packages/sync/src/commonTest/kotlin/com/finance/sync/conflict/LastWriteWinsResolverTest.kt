package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class LastWriteWinsResolverTest {

    private val resolver = LastWriteWinsResolver()

    private fun change(
        updatedAt: String?,
        serverTimestamp: String = "2024-01-01T00:00:00Z",
        seq: Long = 1L,
    ): SyncChange = SyncChange(
        tableName = "accounts",
        operation = MutationOperation.UPDATE,
        rowData = buildMap {
            put("id", "row-1")
            if (updatedAt != null) put("updated_at", updatedAt)
        },
        serverTimestamp = Instant.parse(serverTimestamp),
        sequenceNumber = seq,
    )

    @Test
    fun remoteWinsWhenRemoteUpdatedAtIsLater() {
        val local = change(updatedAt = "2024-01-01T10:00:00Z")
        val remote = change(updatedAt = "2024-01-01T12:00:00Z")
        assertEquals(remote, resolver.resolve(local, remote))
    }

    @Test
    fun localWinsWhenLocalUpdatedAtIsLater() {
        val local = change(updatedAt = "2024-01-01T14:00:00Z")
        val remote = change(updatedAt = "2024-01-01T12:00:00Z")
        assertEquals(local, resolver.resolve(local, remote))
    }

    @Test
    fun tieBreakUsesServerTimestamp_remoteServerIsLater() {
        val local = change(updatedAt = "2024-01-01T12:00:00Z", serverTimestamp = "2024-01-01T12:00:01Z")
        val remote = change(updatedAt = "2024-01-01T12:00:00Z", serverTimestamp = "2024-01-01T12:00:02Z")
        assertEquals(remote, resolver.resolve(local, remote), "Remote should win when its server timestamp is later")
    }

    @Test
    fun tieBreakUsesServerTimestamp_localServerIsLater() {
        val local = change(updatedAt = "2024-01-01T12:00:00Z", serverTimestamp = "2024-01-01T12:00:03Z")
        val remote = change(updatedAt = "2024-01-01T12:00:00Z", serverTimestamp = "2024-01-01T12:00:02Z")
        assertEquals(local, resolver.resolve(local, remote), "Local should win when its server timestamp is later")
    }

    @Test
    fun absoluteTieFavorsRemote() {
        val ts = "2024-01-01T12:00:00Z"
        val local = change(updatedAt = ts, serverTimestamp = ts)
        val remote = change(updatedAt = ts, serverTimestamp = ts)
        assertEquals(remote, resolver.resolve(local, remote), "Remote should win on absolute tie")
    }

    @Test
    fun missingLocalUpdatedAtFavorsRemote() {
        val local = change(updatedAt = null)
        val remote = change(updatedAt = "2024-01-01T12:00:00Z")
        assertEquals(remote, resolver.resolve(local, remote))
    }

    @Test
    fun missingRemoteUpdatedAtFavorsRemote() {
        val local = change(updatedAt = "2024-01-01T12:00:00Z")
        val remote = change(updatedAt = null)
        assertEquals(remote, resolver.resolve(local, remote))
    }

    @Test
    fun bothMissingUpdatedAtFavorsRemote() {
        val local = change(updatedAt = null)
        val remote = change(updatedAt = null)
        assertEquals(remote, resolver.resolve(local, remote))
    }
}