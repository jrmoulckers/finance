// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Manages AES-256-GCM encryption keys in the Android Keystore.
 *
 * Keys are hardware-backed when possible (StrongBox on supported devices).
 * The master key is used for encrypting sensitive data such as tokens and
 * cached financial records.
 *
 * @see SecureTokenStorage for token-specific encrypted storage
 */
class KeystoreManager {

    /**
     * Encrypts [data] using the Keystore-backed AES-256-GCM master key.
     *
     * @param data The plaintext bytes to encrypt.
     * @return The IV prepended to the ciphertext (IV_LENGTH bytes IV + ciphertext).
     */
    fun encrypt(data: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(data)
        // Prepend IV to ciphertext for self-contained decryption
        return iv + ciphertext
    }

    /**
     * Decrypts [data] that was previously encrypted with [encrypt].
     *
     * @param data The IV + ciphertext bytes produced by [encrypt].
     * @return The original plaintext bytes.
     * @throws javax.crypto.AEADBadTagException if the data has been tampered with.
     */
    fun decrypt(data: ByteArray): ByteArray {
        val iv = data.copyOfRange(0, GCM_IV_LENGTH)
        val ciphertext = data.copyOfRange(GCM_IV_LENGTH, data.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_LENGTH, iv))
        return cipher.doFinal(ciphertext)
    }

    /**
     * Retrieves the existing master key from Android Keystore, or generates
     * a new one if it does not yet exist.
     *
     * The key is configured for AES-256-GCM with no user-authentication
     * requirement (biometric gating is handled at a higher layer via
     * [BiometricAuthManager]).
     *
     * StrongBox is preferred; the implementation falls back to TEE-backed
     * storage if StrongBox is unavailable on the device.
     */
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existingKey != null) return existingKey
        return generateKey()
    }

    private fun generateKey(): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE,
        )

        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(AES_KEY_SIZE)
            .setIsStrongBoxBacked(true)
            .build()

        return try {
            keyGenerator.init(spec)
            keyGenerator.generateKey()
        } catch (_: StrongBoxUnavailableException) {
            // StrongBox not available — fall back to TEE-backed key
            val fallbackSpec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(AES_KEY_SIZE)
                .build()

            keyGenerator.init(fallbackSpec)
            keyGenerator.generateKey()
        }
    }

    companion object {
        /** Android Keystore provider name. */
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"

        /** Alias under which the master encryption key is stored. */
        const val KEY_ALIAS = "finance_master_key"

        /** AES-GCM transformation string. */
        private const val TRANSFORMATION = "AES/GCM/NoPadding"

        /** AES key size in bits. */
        private const val AES_KEY_SIZE = 256

        /** GCM initialisation vector length in bytes. */
        private const val GCM_IV_LENGTH = 12

        /** GCM authentication tag length in bits. */
        private const val GCM_TAG_LENGTH = 128
    }
}
