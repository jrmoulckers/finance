// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import java.io.File
import java.util.Base64
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Windows DPAPI (Data Protection API) credential storage manager.
 *
 * DPAPI encrypts data using a key derived from the current user's credentials,
 * ensuring that only the same Windows user account can decrypt the data.
 * This is the recommended approach for storing sensitive financial data at rest
 * on Windows — credentials are never stored in plaintext or user-accessible files.
 *
 * ## Implementation Strategy
 *
 * This implementation delegates to PowerShell's `[System.Security.Cryptography.ProtectedData]`
 * class, which wraps the Win32 `CryptProtectData` / `CryptUnprotectData` APIs. This avoids
 * a hard JNA dependency while still using real DPAPI encryption under the hood.
 *
 * For production deployments requiring higher throughput or avoiding process spawning,
 * swap in the [DpapiEncryptionProvider] JNA-based implementation.
 *
 * @see SecureTokenStorage for the token persistence layer built on top of this manager
 */
class DpapiManager private constructor(
    private val provider: DpapiEncryptionProvider,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(DpapiManager::class.java.name)

        /**
         * Creates a [DpapiManager] using the default PowerShell-based DPAPI provider.
         * This works on any standard Windows 10/11 installation without additional native
         * libraries.
         */
        fun create(): DpapiManager = DpapiManager(PowerShellDpapiProvider())

        /**
         * Creates a [DpapiManager] with a custom [DpapiEncryptionProvider].
         * Use this to inject a JNA-based provider or a test double.
         */
        fun create(provider: DpapiEncryptionProvider): DpapiManager = DpapiManager(provider)
    }

    /**
     * Encrypts [data] using Windows DPAPI with `CurrentUser` scope.
     *
     * The returned bytes are opaque ciphertext that can only be decrypted on the
     * same Windows user account and machine.
     *
     * @param data plaintext bytes to protect
     * @return DPAPI-protected ciphertext bytes
     * @throws DpapiException if encryption fails
     */
    fun encrypt(data: ByteArray): ByteArray {
        require(data.isNotEmpty()) { "Cannot encrypt empty data" }
        return try {
            provider.protect(data)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "DPAPI encryption failed", e)
            throw DpapiException("Failed to encrypt data with DPAPI", e)
        }
    }

    /**
     * Decrypts [data] previously encrypted with [encrypt].
     *
     * @param data DPAPI-protected ciphertext bytes
     * @return original plaintext bytes
     * @throws DpapiException if decryption fails (wrong user, corrupted data, etc.)
     */
    fun decrypt(data: ByteArray): ByteArray {
        require(data.isNotEmpty()) { "Cannot decrypt empty data" }
        return try {
            provider.unprotect(data)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "DPAPI decryption failed", e)
            throw DpapiException("Failed to decrypt data with DPAPI", e)
        }
    }

    /**
     * Convenience: encrypts a UTF-8 string and returns Base64-encoded ciphertext.
     */
    fun encryptString(plaintext: String): String {
        val encrypted = encrypt(plaintext.toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(encrypted)
    }

    /**
     * Convenience: decrypts a Base64-encoded ciphertext string back to UTF-8 plaintext.
     */
    fun decryptString(base64Ciphertext: String): String {
        val encrypted = Base64.getDecoder().decode(base64Ciphertext)
        return String(decrypt(encrypted), Charsets.UTF_8)
    }
}

/**
 * Abstraction over the DPAPI encrypt/decrypt primitives.
 *
 * Implementations:
 * - [PowerShellDpapiProvider] — ships by default; no native deps.
 * - A future JNA-based provider can call `CryptProtectData` / `CryptUnprotectData` directly.
 */
interface DpapiEncryptionProvider {
    /** Encrypts [data] using DPAPI `CurrentUser` scope. */
    fun protect(data: ByteArray): ByteArray

    /** Decrypts [data] previously protected with [protect]. */
    fun unprotect(data: ByteArray): ByteArray
}

/**
 * DPAPI provider that delegates to PowerShell's `ProtectedData` class.
 *
 * Each call spawns a short-lived `powershell.exe` process. This is acceptable for
 * infrequent operations like token storage but should be replaced with JNA for
 * high-frequency use cases.
 */
internal class PowerShellDpapiProvider : DpapiEncryptionProvider {

    companion object {
        private val logger: Logger = Logger.getLogger(PowerShellDpapiProvider::class.java.name)

        /** Maximum allowed plaintext size (1 MB) to prevent abuse. */
        private const val MAX_DATA_SIZE = 1_048_576
    }

    override fun protect(data: ByteArray): ByteArray {
        require(data.size <= MAX_DATA_SIZE) {
            "Data exceeds maximum allowed size of $MAX_DATA_SIZE bytes"
        }

        val b64Input = Base64.getEncoder().encodeToString(data)

        // PowerShell script:
        //   1. Loads the System.Security assembly
        //   2. Decodes the Base64 input to a byte array
        //   3. Encrypts with DPAPI (CurrentUser scope, no optional entropy)
        //   4. Returns Base64-encoded ciphertext
        val script = buildString {
            append("Add-Type -AssemblyName System.Security; ")
            append("${'$'}bytes = [Convert]::FromBase64String('$b64Input'); ")
            append("${'$'}enc = [System.Security.Cryptography.ProtectedData]::Protect(")
            append("${'$'}bytes, ${'$'}null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); ")
            append("[Convert]::ToBase64String(${'$'}enc)")
        }

        val result = executePowerShell(script)
        return Base64.getDecoder().decode(result.trim())
    }

    override fun unprotect(data: ByteArray): ByteArray {
        val b64Input = Base64.getEncoder().encodeToString(data)

        val script = buildString {
            append("Add-Type -AssemblyName System.Security; ")
            append("${'$'}bytes = [Convert]::FromBase64String('$b64Input'); ")
            append("${'$'}dec = [System.Security.Cryptography.ProtectedData]::Unprotect(")
            append("${'$'}bytes, ${'$'}null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); ")
            append("[Convert]::ToBase64String(${'$'}dec)")
        }

        val result = executePowerShell(script)
        return Base64.getDecoder().decode(result.trim())
    }

    /**
     * Executes a PowerShell script and returns its stdout.
     *
     * @throws DpapiException if the process exits with a non-zero code or produces
     *         no output
     */
    private fun executePowerShell(script: String): String {
        val process = ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        )
            .redirectErrorStream(false)
            .start()

        val stdout = process.inputStream.bufferedReader().readText()
        val stderr = process.errorStream.bufferedReader().readText()
        val exitCode = process.waitFor()

        if (exitCode != 0) {
            logger.log(Level.SEVERE, "PowerShell DPAPI command failed (exit=$exitCode): $stderr")
            throw DpapiException(
                "PowerShell DPAPI operation failed with exit code $exitCode: ${stderr.take(200)}"
            )
        }

        if (stdout.isBlank()) {
            throw DpapiException("PowerShell DPAPI operation returned empty output")
        }

        return stdout
    }
}

/**
 * Exception thrown when a DPAPI operation fails.
 */
class DpapiException(message: String, cause: Throwable? = null) : Exception(message, cause)
