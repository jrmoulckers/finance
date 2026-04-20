// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Cross-platform device attestation interface.
 *
 * The client generates an attestation token and sends it to the
 * server for verification. The client NEVER evaluates results directly.
 */
interface DeviceAttestor {
    val isSupported: Boolean
    suspend fun requestAttestation(nonce: String): Result<String>
}

data class AttestationVerdict(
    val deviceIntegrity: Boolean,
    val appIntegrity: Boolean,
    val attested: Boolean,
)

object NoOpDeviceAttestor : DeviceAttestor {
    override val isSupported: Boolean = false
    override suspend fun requestAttestation(nonce: String): Result<String> =
        Result.failure(UnsupportedOperationException("Attestation not supported"))
}