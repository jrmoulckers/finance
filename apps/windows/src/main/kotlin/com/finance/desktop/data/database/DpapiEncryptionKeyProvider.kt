// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.database

import com.finance.db.EncryptionKeyProvider
import com.finance.desktop.security.DpapiManager
import java.security.SecureRandom
import java.util.Base64
import java.util.logging.Level
import java.util.logging.Logger

/**
 * DPAPI-backed [EncryptionKeyProvider] for SQLCipher database encryption.
 *
 * Generates a 256-bit random key on first use, encrypts it with DPAPI
 * (CurrentUser scope), and stores it in `%LOCALAPPDATA%\Finance\security\`.
 * On subsequent calls, loads and decrypts the stored key.
 *
 * This ensures the SQLite database is encrypted at rest with a key that
 * only the current Windows user can decrypt.
 *
 * @param dpapiManager DPAPI encryption manager for key protection.
 * @param secureTokenStorage Token storage for persisting the encrypted key.
 */
class DpapiEncryptionKeyProvider(
    private val dpapiManager: DpapiManager,
) : EncryptionKeyProvider {

    companion object {
        private val logger: Logger = Logger.getLogger(DpapiEncryptionKeyProvider::class.java.name)
        private const val KEY_NAME = "db_encryption_key"
        private const val KEY_SIZE_BYTES = 32 // 256-bit
        private val secureRandom = SecureRandom()

        private fun resolveKeyDir(): java.nio.file.Path {
            val localAppData = System.getenv("LOCALAPPDATA")
                ?: System.getProperty("user.home") + "\\AppData\\Local"
            return java.nio.file.Path.of(localAppData, "Finance", "security")
        }
    }

    private val keyFile: java.nio.file.Path
        get() = resolveKeyDir().resolve("$KEY_NAME.enc")

    @Volatile
    private var cachedKey: String? = null

    @Suppress("ReturnCount") // Key derivation with validation steps
    override fun getOrCreateKey(): String {
        cachedKey?.let { return it }

        return synchronized(this) {
            cachedKey?.let { return it }

            val key = if (java.nio.file.Files.exists(keyFile)) {
                loadKey()
            } else {
                generateAndStoreKey()
            }
            cachedKey = key
            key
        }
    }

    override fun hasKey(): Boolean {
        return java.nio.file.Files.exists(keyFile)
    }

    override fun deleteKey() {
        synchronized(this) {
            @Suppress("TooGenericExceptionCaught") // DPAPI operations may throw various native errors
            try {
                java.nio.file.Files.deleteIfExists(keyFile)
                cachedKey = null
                logger.info("Database encryption key deleted (crypto-shredding)")
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Failed to delete encryption key", e)
                throw e
            }
        }
    }

    private fun generateAndStoreKey(): String {
        val keyBytes = ByteArray(KEY_SIZE_BYTES)
        secureRandom.nextBytes(keyBytes)
        val hexKey = keyBytes.joinToString("") { "%02x".format(it) }

        val dir = resolveKeyDir()
        if (!java.nio.file.Files.exists(dir)) {
            java.nio.file.Files.createDirectories(dir)
        }

        val encrypted = dpapiManager.encrypt(hexKey.toByteArray(Charsets.UTF_8))
        val b64 = Base64.getEncoder().encodeToString(encrypted)
        java.nio.file.Files.writeString(
            keyFile,
            b64,
            java.nio.file.StandardOpenOption.CREATE,
            java.nio.file.StandardOpenOption.TRUNCATE_EXISTING,
        )
        logger.info("Generated and stored new database encryption key via DPAPI")
        return hexKey
    }

    private fun loadKey(): String {
        val b64 = java.nio.file.Files.readString(keyFile).trim()
        val encrypted = Base64.getDecoder().decode(b64)
        val decrypted = dpapiManager.decrypt(encrypted)
        return String(decrypted, Charsets.UTF_8)
    }
}
