// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Cross-platform interface for cryptographic biometric binding.
 *
 * Binds biometric authentication events to hardware-backed key
 * operations, ensuring that a hooked callback cannot forge
 * biometric success without the actual hardware crypto operation.
 *
 * Each platform implements this using:
 * - Android: Keystore CryptoObject with BiometricPrompt
 * - iOS: Secure Enclave key with .biometryCurrentSet access control
 * - Windows: Windows Hello integrated crypto (no separate binding needed)
 */
interface BiometricCryptoBinding {

    /**
     * Whether cryptographic biometric binding is available.
     *
     * Returns false if the device lacks a hardware security module
     * or if biometric enrollment is not configured.
     */
    val isAvailable: Boolean

    /**
     * Generate or retrieve the biometric-bound key pair.
     *
     * The private key is stored in the hardware security module
     * (Keystore / Secure Enclave) and requires biometric authentication
     * for every use.
     *
     * @return The public key bytes for server-side registration, or
     *   failure if key generation is not possible.
     */
    suspend fun getOrCreateKeyPair(): Result<ByteArray>

    /**
     * Sign a server challenge with the biometric-bound private key.
     *
     * This triggers the platform biometric prompt. The signing operation
     * only succeeds if the user passes biometric authentication.
     *
     * @param challenge Server-generated nonce to sign.
     * @return The signature bytes, or failure if authentication was
     *   cancelled or biometric verification failed.
     */
    suspend fun signWithBiometric(challenge: ByteArray): Result<ByteArray>
}

/**
 * No-op implementation for platforms without cryptographic biometric binding.
 */
object NoOpBiometricCryptoBinding : BiometricCryptoBinding {
    override val isAvailable: Boolean = false
    override suspend fun getOrCreateKeyPair(): Result<ByteArray> =
        Result.failure(UnsupportedOperationException("Not supported"))
    override suspend fun signWithBiometric(challenge: ByteArray): Result<ByteArray> =
        Result.failure(UnsupportedOperationException("Not supported"))
}
