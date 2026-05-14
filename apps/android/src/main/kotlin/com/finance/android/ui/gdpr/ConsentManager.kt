// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gdpr

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import timber.log.Timber

enum class ConsentCategory {
    ESSENTIAL,
    ANALYTICS,
    PERSONALIZATION,
    MARKETING,
}

data class ConsentState(
    val analytics: Boolean = false,
    val personalization: Boolean = false,
    val marketing: Boolean = false,
    val consentedAt: Instant? = null,
    val hasConsented: Boolean = false,
)

class ConsentManager(context: Context) {

    private val masterKeyAlias: String by lazy {
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    }

    private val prefs by lazy {
        EncryptedSharedPreferences.create(
            PREFS_FILE_NAME,
            masterKeyAlias,
            context.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val _consentState = MutableStateFlow(loadConsent())
    val consentState: StateFlow<ConsentState> = _consentState.asStateFlow()
    val hasConsented: Boolean get() = _consentState.value.hasConsented

    fun saveConsent(analytics: Boolean, personalization: Boolean, marketing: Boolean) {
        val now = Clock.System.now()
        prefs.edit()
            .putBoolean(KEY_HAS_CONSENTED, true)
            .putBoolean(KEY_ANALYTICS, analytics)
            .putBoolean(KEY_PERSONALIZATION, personalization)
            .putBoolean(KEY_MARKETING, marketing)
            .putString(KEY_CONSENTED_AT, now.toString())
            .apply()
        _consentState.value = ConsentState(analytics, personalization, marketing, now, true)
        Timber.i("GDPR consent saved")
    }

    fun revokeAllOptional() {
        saveConsent(analytics = false, personalization = false, marketing = false)
    }

    fun clearConsent() {
        prefs.edit().clear().apply()
        _consentState.value = ConsentState()
    }

    fun isConsentedTo(category: ConsentCategory): Boolean = when (category) {
        ConsentCategory.ESSENTIAL -> true
        ConsentCategory.ANALYTICS -> _consentState.value.analytics
        ConsentCategory.PERSONALIZATION -> _consentState.value.personalization
        ConsentCategory.MARKETING -> _consentState.value.marketing
    }

    private fun loadConsent(): ConsentState {
        val hasConsented = prefs.getBoolean(KEY_HAS_CONSENTED, false)
        if (!hasConsented) return ConsentState()
        return ConsentState(
            analytics = prefs.getBoolean(KEY_ANALYTICS, false),
            personalization = prefs.getBoolean(KEY_PERSONALIZATION, false),
            marketing = prefs.getBoolean(KEY_MARKETING, false),
            consentedAt = prefs.getString(KEY_CONSENTED_AT, null)?.let { runCatching { Instant.parse(it) }.getOrNull() },
            hasConsented = true,
        )
    }

    private companion object {
        const val PREFS_FILE_NAME = "finance_gdpr_consent"
        const val KEY_HAS_CONSENTED = "has_consented"
        const val KEY_ANALYTICS = "consent_analytics"
        const val KEY_PERSONALIZATION = "consent_personalization"
        const val KEY_MARKETING = "consent_marketing"
        const val KEY_CONSENTED_AT = "consented_at"
    }
}
