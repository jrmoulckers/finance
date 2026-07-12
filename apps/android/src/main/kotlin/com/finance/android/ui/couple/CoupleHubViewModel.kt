// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** UI state for the couple hub — partner personalization. */
data class CoupleHubUiState(
    val profile: CoupleProfile = CoupleProfile(),
    val isEditing: Boolean = false,
)

/**
 * ViewModel for the couple hub (engaged-couples batch).
 *
 * Owns the locally-configured [CoupleProfile] (partner names + shared label)
 * shared by every couple feature. No account PII is ever touched.
 */
class CoupleHubViewModel(
    private val profileRepository: CoupleProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CoupleHubUiState(profile = profileRepository.load()))
    val uiState: StateFlow<CoupleHubUiState> = _uiState.asStateFlow()

    fun startEditing() = _uiState.update { it.copy(isEditing = true) }

    fun cancelEditing() =
        _uiState.update { it.copy(isEditing = false, profile = profileRepository.load()) }

    fun updatePartnerAName(name: String) =
        _uiState.update { it.copy(profile = it.profile.copy(partnerAName = name)) }

    fun updatePartnerBName(name: String) =
        _uiState.update { it.copy(profile = it.profile.copy(partnerBName = name)) }

    fun updateSharedLabel(label: String) =
        _uiState.update { it.copy(profile = it.profile.copy(sharedLabel = label)) }

    fun save() {
        profileRepository.save(_uiState.value.profile)
        _uiState.update { it.copy(isEditing = false, profile = profileRepository.load()) }
    }
}
