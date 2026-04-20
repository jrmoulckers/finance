// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import com.finance.core.security.DeviceAttestor

/**
 * Windows device attestation via TPM 2.0 (stub).
 */
class TpmAttestor : DeviceAttestor {
    override val isSupported: Boolean get() = isTpmAvailable()
    override suspend fun requestAttestation(nonce: String): Result<String> {
        if (!isSupported) return Result.failure(UnsupportedOperationException("No TPM"))
        return Result.failure(NotImplementedError("TPM attestation not yet implemented"))
    }
    private fun isTpmAvailable(): Boolean {
        return try {
            val process = ProcessBuilder(
                "powershell", "-Command",
                "Get-Tpm | Select-Object -ExpandProperty TpmPresent",
            ).redirectErrorStream(true).start()
            val output = process.inputStream.bufferedReader().readText().trim()
            process.waitFor()
            output.equals("True", ignoreCase = true)
        } catch (_: Exception) {
            false
        }
    }
}