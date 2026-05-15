// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import timber.log.Timber

/**
 * Provides [EncryptedSharedPreferences] instances with automatic migration
 * from legacy plain-text [SharedPreferences].
 *
 * On first access after an app update, any existing plain-text preferences
 * are copied into the new encrypted store and the old file is cleared. This
 * ensures a seamless upgrade path with no data loss.
 *
 * Uses AES256-SIV for key encryption and AES256-GCM for value encryption,
 * backed by the Android Keystore via [MasterKeys].
 */
object EncryptedPrefsProvider {

    /** Cached master key alias — created once per process lifetime. */
    private val masterKeyAlias: String by lazy {
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    }

    /**
     * Returns an [EncryptedSharedPreferences] instance for the given [fileName].
     *
     * If a plain-text [SharedPreferences] file with the same [fileName] already
     * exists and contains data, its entries are migrated into the encrypted store
     * and the plain file is cleared.
     *
     * @param context Application or activity context.
     * @param fileName The logical preferences file name (e.g. `"finance_settings"`).
     * @return A [SharedPreferences] instance backed by [EncryptedSharedPreferences].
     */
    fun get(context: Context, fileName: String): SharedPreferences {
        val appContext = context.applicationContext

        // Create the encrypted preferences store.
        val encryptedPrefs = EncryptedSharedPreferences.create(
            "${fileName}_encrypted",
            masterKeyAlias,
            appContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

        // Migrate from the legacy plain-text file if it still has data.
        migratePlainPrefs(appContext, fileName, encryptedPrefs)

        return encryptedPrefs
    }

    /**
     * Copies all entries from the legacy plain-text preferences file into
     * [encryptedPrefs], then clears the plain file.
     *
     * The migration is idempotent — if the plain file is empty (either because
     * it never existed or was already migrated), this is a no-op.
     *
     * **Important:** Sensitive values (user name, email, balances) are never
     * logged. Only the migration event and key count are recorded.
     */
    private fun migratePlainPrefs(
        context: Context,
        fileName: String,
        encryptedPrefs: SharedPreferences,
    ) {
        val plainPrefs = context.getSharedPreferences(fileName, Context.MODE_PRIVATE)
        val allEntries = plainPrefs.all

        if (allEntries.isEmpty()) return

        Timber.i(
            "Migrating %d preference keys from plain '%s' to encrypted store",
            allEntries.size,
            fileName,
        )

        val editor = encryptedPrefs.edit()
        for ((key, value) in allEntries) {
            // Only migrate keys that don't already exist in the encrypted store,
            // so we never overwrite data the user may have changed post-migration.
            if (encryptedPrefs.contains(key)) continue

            when (value) {
                is String -> editor.putString(key, value)
                is Boolean -> editor.putBoolean(key, value)
                is Int -> editor.putInt(key, value)
                is Long -> editor.putLong(key, value)
                is Float -> editor.putFloat(key, value)
                is Set<*> -> {
                    @Suppress("UNCHECKED_CAST")
                    editor.putStringSet(key, value as Set<String>)
                }
                else -> Timber.w("Skipping unsupported preference type for key: %s", key)
            }
        }
        editor.apply()

        // Clear the plain-text file so PII is no longer stored unencrypted.
        plainPrefs.edit().clear().apply()
        Timber.i("Plain preferences '%s' cleared after migration", fileName)
    }
}
