// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.MinimizedEntitlementCodec
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class FakeEntitlementRepository(
    var result: EntitlementResult =
        MinimizedEntitlementCodec.decode(EntitlementFixtures.premium()),
) : EntitlementRepository {
    val households = mutableListOf<String?>()

    override suspend fun load(householdId: String?): EntitlementResult {
        households += householdId
        return result
    }
}

private class FixedClock(var instant: Instant) : Clock {
    override fun now(): Instant = instant
}

class EntitlementCoordinatorTest {
    private val insideBounds = Instant.parse("2026-09-20T12:00:00Z")
    private val pastRefreshBound = Instant.parse("2026-10-06T12:00:01Z")
    private val household = "44010000-0000-4000-8000-000000000001"

    private fun coordinator(
        repository: EntitlementRepository,
        store: EntitlementSnapshotStore = InMemoryEntitlementSnapshotStore(),
        scope: String? = null,
        userScope: String? = "user-a",
        clock: Clock = FixedClock(insideBounds),
    ) = EntitlementCoordinator(
        repository = repository,
        snapshotStore = store,
        householdScopeProvider = { scope },
        userScopeProvider = { userScope },
        clock = clock,
    )

    @Test
    fun `a live read publishes the server confirmed tier and caches it`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        val repository = FakeEntitlementRepository()

        val coordinator = coordinator(repository, store)
        assertTrue(coordinator.state.value.isPending)
        coordinator.refresh()

        assertEquals(EntitlementDisplayStatus.CURRENT, coordinator.state.value.status)
        assertEquals(EntitlementTier.PREMIUM, coordinator.state.value.tier)
        assertTrue(store.read() != null)
    }

    @Test
    fun `an offline read falls back to the cached snapshot only`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        val repository = FakeEntitlementRepository()
        val coordinator = coordinator(repository, store)
        coordinator.refresh()

        repository.result =
            EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE)
        coordinator.refresh()

        assertEquals(EntitlementDisplayStatus.OFFLINE_VALID, coordinator.state.value.status)
        assertEquals(EntitlementTier.PREMIUM, coordinator.state.value.tier)
    }

    @Test
    fun `an offline read past the proven boundary displays Free and asks to refresh`() = runTest {
        val clock = FixedClock(insideBounds)
        val repository = FakeEntitlementRepository()
        val coordinator = coordinator(repository, clock = clock)
        coordinator.refresh()

        clock.instant = pastRefreshBound
        repository.result =
            EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE)
        coordinator.refresh()

        assertEquals(
            EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED,
            coordinator.state.value.status,
        )
        assertEquals(EntitlementTier.FREE, coordinator.state.value.tier)
        assertTrue(coordinator.state.value.needsRefresh)
    }

    @Test
    fun `an unauthenticated answer erases the cached snapshot`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        val repository = FakeEntitlementRepository()
        val coordinator = coordinator(repository, store)
        coordinator.refresh()

        repository.result =
            EntitlementResult.Unavailable(EntitlementUnavailableReason.UNAUTHENTICATED)
        coordinator.refresh()

        assertEquals(EntitlementDisplayStatus.UNAVAILABLE, coordinator.state.value.status)
        assertEquals(EntitlementTier.FREE, coordinator.state.value.tier)
        assertNull(store.read())
    }

    @Test
    fun `a household scope change never shows the previous subject's snapshot`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        val repository = FakeEntitlementRepository(
            MinimizedEntitlementCodec.decode(EntitlementFixtures.family()),
        )
        val coordinator =
            EntitlementCoordinator(
                repository = repository,
                snapshotStore = store,
                householdScopeProvider = { household },
                userScopeProvider = { "user-a" },
                clock = FixedClock(insideBounds),
            )
        coordinator.refresh()
        assertEquals(EntitlementTier.FAMILY, coordinator.state.value.tier)

        // The membership ends: the next read is purchaser-scoped and fails.
        val purchaserScoped =
            EntitlementCoordinator(
                repository = repository.also {
                    it.result =
                        EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE)
                },
                snapshotStore = store,
                householdScopeProvider = { null },
                userScopeProvider = { "user-a" },
                clock = FixedClock(insideBounds),
            )
        purchaserScoped.restoreCachedSnapshot()
        purchaserScoped.refresh()

        assertEquals(EntitlementTier.FREE, purchaserScoped.state.value.tier)
        assertNull(store.read())
    }

    @Test
    fun `a cached snapshot is restored for display but never published on its own`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        store.write(
            CachedEntitlementSnapshot(
                userScope = "user-a",
                householdScope = null,
                payload = EntitlementFixtures.premium(),
            ),
        )
        val repository = FakeEntitlementRepository(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE),
        )
        val coordinator = coordinator(repository, store)

        coordinator.restoreCachedSnapshot()
        assertTrue(coordinator.state.value.isPending)

        coordinator.refresh()
        assertEquals(EntitlementDisplayStatus.OFFLINE_VALID, coordinator.state.value.status)
        assertEquals(EntitlementTier.PREMIUM, coordinator.state.value.tier)
    }

    @Test
    fun `a corrupted cached snapshot is discarded rather than displayed`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        store.write(
            CachedEntitlementSnapshot(
                userScope = "user-a",
                householdScope = null,
                payload = "{ not an envelope",
            ),
        )
        val repository = FakeEntitlementRepository(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE),
        )
        val coordinator = coordinator(repository, store)

        coordinator.restoreCachedSnapshot()
        coordinator.refresh()

        assertEquals(EntitlementDisplayStatus.UNAVAILABLE, coordinator.state.value.status)
        assertEquals(EntitlementTier.FREE, coordinator.state.value.tier)
        assertNull(store.read())
    }

    @Test
    fun `refreshIfNeeded re-reads once the server issued bound has passed`() = runTest {
        val clock = FixedClock(insideBounds)
        val repository = FakeEntitlementRepository()
        val coordinator = coordinator(repository, clock = clock)

        coordinator.refreshIfNeeded()
        assertEquals(1, repository.households.size)

        coordinator.refreshIfNeeded()
        assertEquals(1, repository.households.size)

        clock.instant = pastRefreshBound
        coordinator.refreshIfNeeded()
        assertEquals(2, repository.households.size)
    }

    @Test
    fun `sign out clears the display state and the cache`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        val coordinator = coordinator(FakeEntitlementRepository(), store)
        coordinator.refresh()

        coordinator.clear()

        assertTrue(coordinator.state.value.isPending)
        assertNull(store.read())
    }

    @Test
    fun `an account switch cannot restore the previous users snapshot`() = runTest {
        val store = InMemoryEntitlementSnapshotStore()
        val firstUser = coordinator(FakeEntitlementRepository(), store, userScope = "user-a")
        firstUser.refresh()

        val secondUser =
            coordinator(
                FakeEntitlementRepository(
                    EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE),
                ),
                store,
                userScope = "user-b",
            )
        secondUser.restoreCachedSnapshot()
        secondUser.refresh()

        assertEquals(EntitlementTier.FREE, secondUser.state.value.tier)
        assertNull(store.read())
    }

    @Test
    fun `the cached snapshot never renders into a log line`() {
        val snapshot =
            CachedEntitlementSnapshot(
                userScope = "user-a",
                householdScope = household,
                payload = EntitlementFixtures.premium(),
            )

        assertTrue("premium" !in snapshot.toString())
        assertTrue(household !in snapshot.toString())
    }
}
