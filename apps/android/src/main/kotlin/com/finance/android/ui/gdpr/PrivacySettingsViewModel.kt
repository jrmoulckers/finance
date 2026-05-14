// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gdpr

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.SupabaseAuthManager
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import timber.log.Timber

class PrivacySettingsViewModel(
    private val consentManager: ConsentManager,
    private val authManager: SupabaseAuthManager,
) : ViewModel() {

    val consentState: StateFlow<ConsentState> = consentManager.consentState

    fun updateAnalytics(enabled: Boolean) {
        val s = consentManager.consentState.value
        consentManager.saveConsent(enabled, s.personalization, s.marketing)
    }

    fun updatePersonalization(enabled: Boolean) {
        val s = consentManager.consentState.value
        consentManager.saveConsent(s.analytics, enabled, s.marketing)
    }

    fun updateMarketing(enabled: Boolean) {
        val s = consentManager.consentState.value
        consentManager.saveConsent(s.analytics, s.personalization, enabled)
    }

    fun deleteAccount() {
        viewModelScope.launch {
            Timber.i("Account deletion requested")
            authManager.deleteAccount().onSuccess {
                consentManager.clearConsent()
                Timber.i("Account deleted")
            }.onFailure { Timber.e(it, "Account deletion failed") }
        }
    }
}
