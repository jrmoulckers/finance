// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import android.content.SharedPreferences
import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A previously fetched minimized entitlement, kept only to keep the UI
 * coherent while a fresh read is impossible.
 *
 * The cache is **display-only**. It is bounded by the server-issued
 * `validity.refresh_after` and, for a proven reduction, by
 * `downgrade.effective_at`; it never authorizes a cost-incurring action and
 * is never consulted by the server.
 *
 * @property userScope the authenticated Finance user the snapshot belongs to.
 * @property householdScope the household the snapshot was read for, so a
 *   snapshot can never be shown for a different subject.
 * @property payload the verbatim `entitlements-v1` envelope, re-validated by
 *   the shared codec on every read.
 */
data class CachedEntitlementSnapshot(
    val userScope: String,
    val householdScope: String?,
    val payload: String,
) {
    /** Never render the cached projection into a log or crash report. */
    override fun toString(): String = "CachedEntitlementSnapshot(redacted)"
}

/** Persistence boundary for the display-only entitlement snapshot. */
interface EntitlementSnapshotStore {
    suspend fun read(): CachedEntitlementSnapshot?

    suspend fun write(snapshot: CachedEntitlementSnapshot)

    suspend fun clear()
}

/** Process-lifetime store used by tests and by unconfigured builds. */
class InMemoryEntitlementSnapshotStore(
    @Volatile private var snapshot: CachedEntitlementSnapshot? = null,
) : EntitlementSnapshotStore {
    override suspend fun read(): CachedEntitlementSnapshot? = snapshot

    override suspend fun write(snapshot: CachedEntitlementSnapshot) {
        this.snapshot = snapshot
    }

    override suspend fun clear() {
        snapshot = null
    }
}

/**
 * Snapshot store backed by the app's Android Keystore encrypted preferences.
 *
 * The minimized projection carries no financial value and no provider or
 * ledger identifier, but it is still account state, so it is written to the
 * encrypted store rather than a plain file.
 */
class EncryptedEntitlementSnapshotStore(
    private val preferences: SharedPreferences,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : EntitlementSnapshotStore {
    override suspend fun read(): CachedEntitlementSnapshot? = withContext(ioDispatcher) {
        val payload = preferences.getString(PAYLOAD_KEY, null) ?: return@withContext null
        val userScope = preferences.getString(USER_SCOPE_KEY, null) ?: return@withContext null
        CachedEntitlementSnapshot(
            userScope = userScope,
            householdScope = preferences.getString(SCOPE_KEY, null),
            payload = payload,
        )
    }

    override suspend fun write(snapshot: CachedEntitlementSnapshot) {
        withContext(ioDispatcher) {
            preferences.edit()
                .putString(PAYLOAD_KEY, snapshot.payload)
                .putString(USER_SCOPE_KEY, snapshot.userScope)
                .putString(SCOPE_KEY, snapshot.householdScope)
                .apply()
        }
    }

    override suspend fun clear() {
        withContext(ioDispatcher) {
            preferences.edit()
                .remove(PAYLOAD_KEY)
                .remove(USER_SCOPE_KEY)
                .remove(SCOPE_KEY)
                .apply()
        }
    }

    @VisibleForTesting
    internal companion object {
        const val PREFS_NAME = "finance_entitlement_cache"
        const val PAYLOAD_KEY = "entitlement.snapshot.v1"
        const val USER_SCOPE_KEY = "entitlement.snapshot.user"
        const val SCOPE_KEY = "entitlement.snapshot.scope"
    }
}
