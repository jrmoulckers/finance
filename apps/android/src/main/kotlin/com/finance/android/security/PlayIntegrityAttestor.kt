// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import com.finance.core.security.DeviceAttestor

/**
 * Android device attestation via Play Integrity API.
 *
 * Called during:
 * 1. Initial authentication (after successful passkey/OAuth)
 * 2. Periodic re-attestation (configurable interval, default 24h)
 * 3. Before high-value operations (account deletion, data export)
 *
 * The integrity token is sent to the backend for server-side verification.
 * The client NEVER evaluates the token directly.
 */
class PlayIntegrityAttestor : DeviceAttestor {
    override val isSupported: Boolean = true

    /**
     * Request an integrity token with a server-generated nonce.
     *
     * @param nonce Server-generated, single-use nonce (base64url, min 16 bytes).
     * @return The integrity token string to send to the backend.
     */
    override suspend fun requestAttestation(nonce: String): Result<String> {
        @Suppress("TooGenericExceptionCaught") // Multiple exception types possible
        return try {
            // TODO(#1296): Wire Play Integrity API dependency
            // val integrityManager = IntegrityManagerFactory.create(context)
            // val request = IntegrityTokenRequest.builder()
            //     .setNonce(nonce)
            //     .setCloudProjectNumber(cloudProjectNumber)
            //     .build()
            // val response = integrityManager.requestIntegrityToken(request).await()
            // Result.success(response.token())
            Result.failure(NotImplementedError("Play Integrity API not yet wired"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
