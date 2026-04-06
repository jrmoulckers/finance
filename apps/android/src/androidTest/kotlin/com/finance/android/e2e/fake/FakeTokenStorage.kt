// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.fake

import com.finance.sync.auth.StoredTokenData
import com.finance.sync.auth.TokenStorage
import kotlinx.datetime.Clock
import kotlin.time.Duration.Companion.hours

/**
 * In-memory [TokenStorage] for E2E tests.
 *
 * Pre-populated with a fake authenticated session so that
 * [SupabaseAuthManager.init] finds stored tokens and the app
 * transitions straight to the authenticated state.
 */
class FakeTokenStorage : TokenStorage() {

    private var data: StoredTokenData? = StoredTokenData(
        accessToken = "fake-access-token-e2e",
        refreshToken = "fake-refresh-token-e2e",
        expiresAtMillis = Clock.System.now().plus(1.hours).toEpochMilliseconds(),
        userId = "test-user-e2e",
    )

    override fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        data = StoredTokenData(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtMillis = expiresAt,
            userId = userId,
        )
    }

    override fun load(): StoredTokenData? = data

    override fun clear() {
        data = null
    }
}
