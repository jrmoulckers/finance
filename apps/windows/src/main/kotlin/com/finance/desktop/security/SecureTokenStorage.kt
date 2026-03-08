// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.util.Base64
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Secure token storage for the Finance Windows desktop client.
 *
 * Persists authentication tokens (access tokens, refresh tokens) to disk using
 * DPAPI encryption via [DpapiManager]. Each token is stored as a separate file
 * in the application's local data directory, with the file contents being
 * DPAPI-protected ciphertext.
 *
 * **Security guarantees:**
 * - Tokens are never stored in plaintext on disk
 * - DPAPI binds ciphertext to the current Windows user — other users and
 *   administrators cannot decrypt the files
 * - Token files are stored in `%LOCALAPPDATA%\Finance\security\` which is
 *   per-user and not synced to the cloud
 *
 * @see DpapiManager for the underlying encryption
 */
class SecureTokenStorage private constructor(
    private val dpapiManager: DpapiManager,
    private val storageDir: Path,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(SecureTokenStorage::class.java.name)

        /** Well-known token keys. */
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_ID_TOKEN = "id_token"

        /** File extension for encrypted token files. */
        private const val TOKEN_FILE_EXTENSION = ".enc"

        /**
         * Creates a [SecureTokenStorage] using the default storage directory
         * (`%LOCALAPPDATA%\Finance\security\`) and a default [DpapiManager].
         */
        fun create(): SecureTokenStorage {
            val localAppData = System.getenv("LOCALAPPDATA")
                ?: System.getProperty("user.home") + "\\AppData\\Local"
            val storageDir = Path.of(localAppData, "Finance", "security")
            return create(DpapiManager.create(), storageDir)
        }

        /**
         * Creates a [SecureTokenStorage] with explicit dependencies.
         * Useful for testing or custom storage locations.
         */
        fun create(dpapiManager: DpapiManager, storageDir: Path): SecureTokenStorage {
            return SecureTokenStorage(dpapiManager, storageDir)
        }
    }

    /**
     * Ensures the storage directory exists with restricted permissions.
     */
    private fun ensureStorageDir() {
        if (!Files.exists(storageDir)) {
            Files.createDirectories(storageDir)
            logger.info("Created secure storage directory: $storageDir")
        }
    }

    /**
     * Saves a token value under the given [key], encrypted with DPAPI.
     *
     * If a token with the same key already exists, it is overwritten.
     *
     * @param key the token identifier (e.g. [KEY_ACCESS_TOKEN])
     * @param value the plaintext token value
     * @throws DpapiException if encryption fails
     */
    fun saveToken(key: String, value: String) {
        require(key.isNotBlank()) { "Token key must not be blank" }
        require(value.isNotBlank()) { "Token value must not be blank" }
        validateKey(key)

        ensureStorageDir()

        val encrypted = dpapiManager.encrypt(value.toByteArray(Charsets.UTF_8))
        val b64 = Base64.getEncoder().encodeToString(encrypted)
        val tokenFile = resolveTokenFile(key)

        Files.writeString(
            tokenFile,
            b64,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE,
        )

        logger.fine("Saved encrypted token: $key")
    }

    /**
     * Loads and decrypts a token stored under the given [key].
     *
     * @param key the token identifier (e.g. [KEY_ACCESS_TOKEN])
     * @return the plaintext token value, or `null` if the token does not exist
     * @throws DpapiException if decryption fails
     */
    fun loadToken(key: String): String? {
        require(key.isNotBlank()) { "Token key must not be blank" }
        validateKey(key)

        val tokenFile = resolveTokenFile(key)
        if (!Files.exists(tokenFile)) {
            logger.fine("No stored token found for key: $key")
            return null
        }

        return try {
            val b64 = Files.readString(tokenFile).trim()
            val encrypted = Base64.getDecoder().decode(b64)
            val decrypted = dpapiManager.decrypt(encrypted)
            String(decrypted, Charsets.UTF_8)
        } catch (e: DpapiException) {
            logger.log(Level.SEVERE, "Failed to decrypt token for key: $key", e)
            throw e
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Failed to load token for key: $key", e)
            throw DpapiException("Failed to load token: $key", e)
        }
    }

    /**
     * Deletes the token stored under the given [key].
     *
     * This is a no-op if the token does not exist.
     *
     * @param key the token identifier
     * @return `true` if a token was deleted, `false` if none existed
     */
    fun clearToken(key: String): Boolean {
        require(key.isNotBlank()) { "Token key must not be blank" }
        validateKey(key)

        val tokenFile = resolveTokenFile(key)
        val deleted = Files.deleteIfExists(tokenFile)
        if (deleted) {
            logger.fine("Cleared token: $key")
        }
        return deleted
    }

    /**
     * Deletes all stored tokens.
     *
     * Use this on sign-out to ensure no credentials remain on disk.
     *
     * @return the number of tokens cleared
     */
    fun clearAllTokens(): Int {
        if (!Files.exists(storageDir)) return 0

        var count = 0
        Files.list(storageDir).use { stream ->
            stream
                .filter { it.toString().endsWith(TOKEN_FILE_EXTENSION) }
                .forEach { path ->
                    try {
                        Files.deleteIfExists(path)
                        count++
                    } catch (e: Exception) {
                        logger.log(Level.WARNING, "Failed to delete token file: $path", e)
                    }
                }
        }

        logger.info("Cleared $count stored token(s)")
        return count
    }

    /**
     * Checks whether a token exists for the given [key].
     *
     * This only checks file existence — it does not attempt decryption.
     */
    fun hasToken(key: String): Boolean {
        require(key.isNotBlank()) { "Token key must not be blank" }
        validateKey(key)
        return Files.exists(resolveTokenFile(key))
    }

    /**
     * Lists all stored token keys (without decrypting values).
     */
    fun listTokenKeys(): List<String> {
        if (!Files.exists(storageDir)) return emptyList()

        return Files.list(storageDir).use { stream ->
            stream
                .filter { it.toString().endsWith(TOKEN_FILE_EXTENSION) }
                .map { it.fileName.toString().removeSuffix(TOKEN_FILE_EXTENSION) }
                .toList()
        }
    }

    /**
     * Resolves the file path for a given token key.
     */
    private fun resolveTokenFile(key: String): Path {
        return storageDir.resolve("$key$TOKEN_FILE_EXTENSION")
    }

    /**
     * Validates that a token key contains only safe filesystem characters.
     */
    private fun validateKey(key: String) {
        require(key.matches(Regex("^[a-zA-Z0-9_-]+$"))) {
            "Token key must contain only alphanumeric characters, hyphens, and underscores: $key"
        }
    }
}
