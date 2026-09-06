// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.android.auth.HouseholdIdProvider
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.MinimizedEntitlementCodec
import com.finance.sync.auth.AuthManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.datetime.Clock
import java.util.concurrent.atomic.AtomicLong
import timber.log.Timber

/** Resolves the household scope the projection should be read for. */
fun interface EntitlementHouseholdScopeProvider {
    /** A household proven by the session, or `null` for the purchaser scope. */
    suspend fun verifiedHouseholdId(): String?
}

/** Resolves the authenticated Finance user that owns a cached snapshot. */
fun interface EntitlementUserScopeProvider {
    /** The current authenticated user's stable ID, or `null` when signed out. */
    suspend fun authenticatedUserId(): String?
}

/** Household scope taken only from an authenticated, verified membership. */
class AuthenticatedEntitlementHouseholdScopeProvider(
    private val householdIdProvider: HouseholdIdProvider,
) : EntitlementHouseholdScopeProvider {
    override suspend fun verifiedHouseholdId(): String? =
        householdIdProvider.verifiedHouseholdId.value?.value
}

/** User scope taken directly from the authenticated Finance session. */
class AuthenticatedEntitlementUserScopeProvider(
    private val authManager: AuthManager,
) : EntitlementUserScopeProvider {
    override suspend fun authenticatedUserId(): String? =
        authManager.currentSession.value?.userId
}

/**
 * Single source of entitlement **display** state for the Android app (#4403).
 *
 * It reads the shared minimized contract through [EntitlementRepository],
 * keeps one display-only snapshot bounded by the server-issued
 * `validity.refresh_after`, and drops to Free presentation at the
 * server-proved `downgrade.effective_at`. No RevenueCat or Play state, product
 * identifier, tier ordinal, feature flag, cached response echo, or device
 * clock reading is ever an authority here: every cost-incurring server action
 * re-reads the projection server-side.
 *
 * Nothing in this class logs an identifier or an entitlement payload.
 */
class EntitlementCoordinator(
    private val repository: EntitlementRepository,
    private val snapshotStore: EntitlementSnapshotStore = InMemoryEntitlementSnapshotStore(),
    private val householdScopeProvider: EntitlementHouseholdScopeProvider =
        EntitlementHouseholdScopeProvider { null },
    private val userScopeProvider: EntitlementUserScopeProvider =
        EntitlementUserScopeProvider { null },
    private val clock: Clock = Clock.System,
) {
    private val _state = MutableStateFlow(EntitlementDisplayState.PENDING)

    /** Display-only entitlement presentation. Never an authorization input. */
    val state: StateFlow<EntitlementDisplayState> = _state.asStateFlow()

    private val mutex = Mutex()
    private val operations = AtomicLong()
    private var appliedOperation = 0L
    private var cached: EntitlementEnvelope? = null
    private var cachedUserScope: String? = null
    private var cachedScope: String? = null

    /**
     * Hydrate the in-memory snapshot from persistent storage.
     *
     * This never publishes a tier on its own: until a live read answers, the
     * UI stays [EntitlementDisplayStatus.PENDING]. A snapshot that no longer
     * validates, or that belongs to a different household scope, is discarded.
     */
    suspend fun restoreCachedSnapshot() {
        val userScope = userScopeProvider.authenticatedUserId()
        val scope = householdScopeProvider.verifiedHouseholdId()
        val stored = snapshotStore.read() ?: return
        mutex.withLock {
            if (userScope == null ||
                stored.userScope != userScope ||
                stored.householdScope != scope
            ) {
                discardCache()
                return
            }
            when (val restored = MinimizedEntitlementCodec.decode(stored.payload)) {
                is EntitlementResult.Available -> {
                    cached = restored.envelope
                    cachedUserScope = stored.userScope
                    cachedScope = stored.householdScope
                }

                is EntitlementResult.Unavailable -> {
                    Timber.w("Cached entitlement snapshot was discarded")
                    discardCache()
                }
            }
        }
    }

    /** Read `entitlements-v1` and republish the display state. */
    suspend fun refresh() {
        val operation = operations.incrementAndGet()
        val userScope = userScopeProvider.authenticatedUserId()
        val scope = householdScopeProvider.verifiedHouseholdId()
        val result =
            if (userScope == null) {
                EntitlementResult.Unavailable(EntitlementUnavailableReason.UNAUTHENTICATED)
            } else {
                repository.load(scope)
            }
        apply(result, userScope, scope, operation)
    }

    /**
     * Refresh only when the current presentation asks for it — the server
     * refresh deadline passed, the last read failed, or nothing was read yet.
     */
    suspend fun refreshIfNeeded() {
        val current = _state.value
        if (current.isPending || current.needsRefresh || isPastRefreshBound(current)) {
            refresh()
        }
    }

    /** Forget everything on sign-out or account switch. */
    suspend fun clear() {
        mutex.withLock {
            appliedOperation = operations.incrementAndGet()
            discardCache()
            _state.value = EntitlementDisplayState.PENDING
        }
    }

    private fun isPastRefreshBound(current: EntitlementDisplayState): Boolean {
        val bound = current.refreshAfter ?: return false
        return clock.now() >= bound
    }

    private suspend fun apply(
        result: EntitlementResult,
        userScope: String?,
        scope: String?,
        operation: Long,
    ) {
        mutex.withLock {
            // A slower earlier read must never overwrite a newer answer.
            if (operation < appliedOperation) return
            appliedOperation = operation

            when (result) {
                is EntitlementResult.Available -> {
                    checkNotNull(userScope)
                    cached = result.envelope
                    cachedUserScope = userScope
                    cachedScope = scope
                    snapshotStore.write(
                        CachedEntitlementSnapshot(
                            userScope = userScope,
                            householdScope = scope,
                            payload = MinimizedEntitlementCodec.encode(result.envelope),
                        ),
                    )
                }

                is EntitlementResult.Unavailable -> {
                    // Identity, membership, or scope changes disprove the
                    // cached subject; every other failure leaves it standing
                    // because it has not been disproven.
                    if (isSubjectDisproven(result.reason, userScope, scope)) discardCache()
                }
            }

            _state.value = EntitlementDisplayState.from(result, cached, clock.now())
        }
    }

    private fun isSubjectDisproven(
        reason: EntitlementUnavailableReason,
        userScope: String?,
        scope: String?,
    ): Boolean =
        reason == EntitlementUnavailableReason.UNAUTHENTICATED ||
            reason == EntitlementUnavailableReason.FORBIDDEN ||
            userScope != cachedUserScope ||
            scope != cachedScope

    private suspend fun discardCache() {
        cached = null
        cachedUserScope = null
        cachedScope = null
        snapshotStore.clear()
    }
}
