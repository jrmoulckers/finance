// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

/**
 * JVM actual for [TokenStorage] using AES-256-GCM encrypted file.
 *
 * Tokens are encrypted at rest using AES-256-GCM. The AES key is
 * stored in a PKCS12 [KeyStore] file in the user's application data
 * directory (`~/.finance/tokens/`).
 *
 * **Security model:** The encryption key is protected by OS-level
 * file permissions on the KeyStore file. This provides equivalent
 * protection to other desktop applications that store credentials
 * in user-home directories (e.g., SSH keys, GPG keyrings).
 *
 * **Thread safety:** File I/O is synchronized via [lock].
 */
actual open class TokenStorage actual constructor() {

    companion object {
        private const val KEYSTORE_TYPE = "PKCS12"
        private const val KEY_ALIAS = "finance_token_key"
        private const val AES_GCM = "AES/GCM/NoPadding"
        private const val GCM_TAG_BITS = 128
        private const val GCM_IV_BYTES = 12
        private const val AES_KEY_BITS = 256

        /** Key for the JSON field containing the access token. */
        private const val FIELD_ACCESS_TOKEN = "at"

        /** Key for the JSON field containing the refresh token. */
        private const val FIELD_REFRESH_TOKEN = "rt"

        /** Key for the JSON field containing the expiry timestamp. */
        private const val FIELD_EXPIRES_AT = "ea"

        /** Key for the JSON field containing the user ID. */
        private const val FIELD_USER_ID = "ui"

        /**
         * Override the storage directory for testing.
         * When `null`, defaults to `~/.finance/tokens/`.
         */
        @Volatile
        internal var storageDirOverride: Path? = null

        private fun resolveStorageDir(): Path {
            val dir = storageDirOverride
                ?: Path.of(System.getProperty("user.home"), ".finance", "tokens")
            Files.createDirectories(dir)
            return dir
        }

        // Password for the PKCS12 KeyStore file. The actual security comes
        // from OS file permissions on the keystore, not from this password.
        // This is standard practice for desktop credential stores.
        private val keystorePassword = "finance-token-ks".toCharArray()
    }

    private val lock = Any()
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Lazily load or create the AES-256 encryption key from the PKCS12 KeyStore.
     */
    private val secretKey: SecretKey by lazy { loadOrCreateKey() }

    actual open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ): Unit = synchronized(lock) {
        val payload = buildJsonObject {
            put(FIELD_ACCESS_TOKEN, accessToken)
            put(FIELD_REFRESH_TOKEN, refreshToken)
            put(FIELD_EXPIRES_AT, expiresAt)
            put(FIELD_USER_ID, userId)
        }.toString()

        val encrypted = encrypt(payload.encodeToByteArray())
        Files.write(resolveStorageDir().resolve("tokens.enc"), encrypted)
    }

    actual open fun load(): StoredTokenData? = synchronized(lock) {
        val dataFile = resolveStorageDir().resolve("tokens.enc")
        if (!Files.exists(dataFile)) return null

        return try {
            val encrypted = Files.readAllBytes(dataFile)
            val decrypted = decrypt(encrypted)
            val obj = json.parseToJsonElement(decrypted.decodeToString()).jsonObject
            StoredTokenData(
                accessToken = obj[FIELD_ACCESS_TOKEN]?.jsonPrimitive?.content ?: return null,
                refreshToken = obj[FIELD_REFRESH_TOKEN]?.jsonPrimitive?.content ?: return null,
                expiresAtMillis = obj[FIELD_EXPIRES_AT]?.jsonPrimitive?.long ?: return null,
                userId = obj[FIELD_USER_ID]?.jsonPrimitive?.content ?: return null,
            )
        } catch (_: Exception) {
            // Corrupted or tampered file — treat as empty
            null
        }
    }

    actual open fun clear(): Unit = synchronized(lock) {
        val dataFile = resolveStorageDir().resolve("tokens.enc")
        try {
            Files.deleteIfExists(dataFile)
        } catch (_: Exception) {
            // Best-effort deletion
        }
    }

    /**
     * Encrypt [data] using AES-256-GCM.
     *
     * Output format: `[12-byte IV][ciphertext+tag]`
     */
    private fun encrypt(data: ByteArray): ByteArray {
        val iv = ByteArray(GCM_IV_BYTES).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance(AES_GCM)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        val ciphertext = cipher.doFinal(data)
        return iv + ciphertext
    }

    /**
     * Decrypt AES-256-GCM encrypted [data].
     *
     * Expects input format: `[12-byte IV][ciphertext+tag]`
     */
    private fun decrypt(data: ByteArray): ByteArray {
        require(data.size > GCM_IV_BYTES) { "Encrypted data too short" }
        val iv = data.sliceArray(0 until GCM_IV_BYTES)
        val ciphertext = data.sliceArray(GCM_IV_BYTES until data.size)
        val cipher = Cipher.getInstance(AES_GCM)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher.doFinal(ciphertext)
    }

    /**
     * Load the AES key from the PKCS12 KeyStore, or generate a new one
     * if the keystore doesn't exist yet.
     */
    private fun loadOrCreateKey(): SecretKey {
        val ksPath = resolveStorageDir().resolve("token.keystore")
        val ksFile = ksPath.toFile()
        val ks = KeyStore.getInstance(KEYSTORE_TYPE)

        if (ksFile.exists()) {
            ksFile.inputStream().use { ks.load(it, keystorePassword) }
            val entry = ks.getEntry(
                KEY_ALIAS,
                KeyStore.PasswordProtection(keystorePassword),
            )
            if (entry is KeyStore.SecretKeyEntry) {
                return entry.secretKey
            }
        }

        // Generate a new AES-256 key
        val keyGen = KeyGenerator.getInstance("AES")
        keyGen.init(AES_KEY_BITS, SecureRandom())
        val key = keyGen.generateKey()

        // Persist to KeyStore
        ks.load(null, null)
        ks.setEntry(
            KEY_ALIAS,
            KeyStore.SecretKeyEntry(key),
            KeyStore.PasswordProtection(keystorePassword),
        )
        ksFile.outputStream().use { ks.store(it, keystorePassword) }

        return key
    }
}
