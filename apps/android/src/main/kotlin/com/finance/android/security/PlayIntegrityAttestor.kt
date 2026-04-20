// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import com.finance.core.security.DeviceAttestor

/**
 * Android device attestation via Play Integrity API.
 */
class PlayIntegrityAttestor(
    private val cloudProjectNumber: Long,
) : DeviceAttestor {
    override val isSupported: Boolean = true
    override suspend fun requestAttestation(nonce: String): Result<String> {
        return try {
            // TODO: Wire Play Integrity API dependency
            Result.failure(NotImplementedError("Play Integrity API not yet wired"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}