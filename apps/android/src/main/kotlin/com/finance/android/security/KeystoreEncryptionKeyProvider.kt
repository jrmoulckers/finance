// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.finance.db.EncryptionKeyProvider
import java.util.UUID

/**
 * Android [EncryptionKeyProvider] implementation backed by
 * [EncryptedSharedPreferences] and Android Keystore.
 *
 * Generates a random SQLCipher passphrase on first use and stores it
 * in an AES-256-GCM encrypted SharedPreferences file. The encryption
 * master key is managed by Android Keystore (hardware-backed where
 * available).
 *
 * @param context Application context used to create the encrypted prefs.
 */
class KeystoreEncryptionKeyProvider(
    private val context: Context,
) : EncryptionKeyProvider {

    private val masterKeyAlias: String by lazy {
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    }

    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            PREFS_FILE_NAME,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /** Retrieves existing key or generates a new one via Android Keystore. */
    override fun getOrCreateKey(): String {
        return prefs.getString(KEY_PREF, null) ?: run {
            val key = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_PREF, key).apply()
            key
        }
    }

    /** Checks if a key already exists in Android Keystore. */
    override fun hasKey(): Boolean = prefs.contains(KEY_PREF)

    /** Deletes the stored key (for crypto-shredding / account deletion). */
    override fun deleteKey() {
        prefs.edit().remove(KEY_PREF).apply()
    }

    private companion object {
        /** File name for the encrypted preferences storing the DB key. */
        const val PREFS_FILE_NAME = "finance_db_encryption"
        /** Preference key under which the SQLCipher passphrase is stored. */
        const val KEY_PREF = "db_encryption_key"
    }
}
