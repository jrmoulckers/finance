// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * Android actual for [TokenStorage] using [EncryptedSharedPreferences].
 *
 * Tokens are encrypted at rest using AES-256-GCM for values and
 * AES-256-SIV for keys, backed by the Android Keystore's
 * hardware-backed master key (AES256-GCM).
 *
 * **Initialization:** The Android app must call [initialize] with an
 * application [Context] before any [TokenStorage] instance is used.
 * This is typically done in `Application.onCreate()`:
 *
 * ```kotlin
 * class FinanceApp : Application() {
 *     override fun onCreate() {
 *         super.onCreate()
 *         TokenStorage.initialize(this)
 *     }
 * }
 * ```
 *
 * **Thread safety:** [EncryptedSharedPreferences] handles its own
 * synchronization. The `apply()` call for writes is asynchronous
 * but thread-safe.
 */
actual open class TokenStorage actual constructor() {

    companion object {
        private const val PREFS_FILE = "finance_secure_tokens"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_USER_ID = "user_id"

        @Volatile
        private var appContext: Context? = null

        /**
         * Initialize with the application context.
         *
         * Must be called once before any [TokenStorage] operations, typically
         * in `Application.onCreate()`. Uses `applicationContext` to avoid
         * leaking Activity references.
         *
         * @param context Any Android context (application context will be extracted).
         */
        fun initialize(context: Context) {
            appContext = context.applicationContext
        }
    }

    /**
     * Lazily create the [EncryptedSharedPreferences] instance.
     *
     * The master key is generated and stored in the Android Keystore
     * (hardware-backed when available). The AES256-GCM scheme provides
     * authenticated encryption with tamper detection.
     */
    private val prefs: SharedPreferences by lazy {
        val context = requireNotNull(appContext) {
            "TokenStorage.initialize(context) must be called before use. " +
                "Call it in Application.onCreate()."
        }
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            PREFS_FILE,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    actual open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_EXPIRES_AT, expiresAt)
            .putString(KEY_USER_ID, userId)
            .apply()
    }

    actual open fun load(): StoredTokenData? {
        val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return null
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, null) ?: return null
        if (!prefs.contains(KEY_EXPIRES_AT)) return null
        val expiresAt = prefs.getLong(KEY_EXPIRES_AT, 0L)
        val userId = prefs.getString(KEY_USER_ID, null) ?: return null
        return StoredTokenData(accessToken, refreshToken, expiresAt, userId)
    }

    actual open fun clear() {
        prefs.edit().clear().apply()
    }
}
