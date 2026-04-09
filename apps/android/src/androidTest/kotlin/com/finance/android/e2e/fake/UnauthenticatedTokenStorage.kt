// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.fake

import com.finance.sync.auth.StoredTokenData
import com.finance.sync.auth.TokenStorage

/**
 * In-memory [TokenStorage] for E2E tests that starts unauthenticated.
 *
 * Unlike [FakeTokenStorage] (which pre-populates a session), this
 * implementation starts with no stored tokens. This forces the app
 * into the [AuthState.Unauthenticated] state, allowing E2E tests
 * to verify the login screen and sign-in flow UI.
 */
class UnauthenticatedTokenStorage : TokenStorage() {

    private var data: StoredTokenData? = null

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
