// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Referral Program UI State — Sprint 19 (#342)
// ─────────────────────────────────────────────────────────────────────────────

/** Status of a single referral invitation. */
enum class ReferralStatus { PENDING, SIGNED_UP, ACTIVATED, EXPIRED }

/** UI model for one referral entry. */
data class ReferralItemUi(
    val id: String,
    val recipientEmail: String,
    val status: ReferralStatus,
    val sentDate: String,
    val rewardEarned: String?,
)

/** Tier information for the referral rewards programme. */
data class ReferralTierUi(
    val name: String,
    val referralsNeeded: Int,
    val reward: String,
    val isUnlocked: Boolean,
)

data class ReferralUiState(
    val isLoading: Boolean = true,
    val referralCode: String = "",
    val referralLink: String = "",
    val totalReferrals: Int = 0,
    val activatedReferrals: Int = 0,
    val pendingReferrals: Int = 0,
    val totalRewardsEarned: String = "$0.00",
    val referrals: List<ReferralItemUi> = emptyList(),
    val tiers: List<ReferralTierUi> = emptyList(),
    val codeCopied: Boolean = false,
    val linkCopied: Boolean = false,
)

/**
 * ViewModel for the Referral Program screen.
 *
 * Manages referral code display, share actions, status tracking,
 * and reward tier progression.
 */
class ReferralViewModel : DesktopViewModel() {

    private val _uiState = MutableStateFlow(ReferralUiState())
    val uiState: StateFlow<ReferralUiState> = _uiState.asStateFlow()

    init {
        loadReferralData()
    }

    private fun loadReferralData() {
        viewModelScope.launch {
            val referrals = listOf(
                ReferralItemUi("r1", "jane@example.com", ReferralStatus.ACTIVATED, "2025-01-10", "$5.00"),
                ReferralItemUi("r2", "mike@example.com", ReferralStatus.SIGNED_UP, "2025-02-14", null),
                ReferralItemUi("r3", "lisa@example.com", ReferralStatus.PENDING, "2025-03-01", null),
                ReferralItemUi("r4", "tom@example.com", ReferralStatus.ACTIVATED, "2025-01-22", "$5.00"),
                ReferralItemUi("r5", "emma@example.com", ReferralStatus.EXPIRED, "2024-11-05", null),
            )

            val tiers = listOf(
                ReferralTierUi("Bronze", 3, "1 month free", isUnlocked = true),
                ReferralTierUi("Silver", 5, "3 months free", isUnlocked = false),
                ReferralTierUi("Gold", 10, "1 year free", isUnlocked = false),
                ReferralTierUi("Platinum", 25, "Lifetime free", isUnlocked = false),
            )

            _uiState.value = ReferralUiState(
                isLoading = false,
                referralCode = "FINANCE-AJ7K2X",
                referralLink = "https://finance.app/ref/AJ7K2X",
                totalReferrals = referrals.size,
                activatedReferrals = referrals.count { it.status == ReferralStatus.ACTIVATED },
                pendingReferrals = referrals.count { it.status == ReferralStatus.PENDING || it.status == ReferralStatus.SIGNED_UP },
                totalRewardsEarned = "$10.00",
                referrals = referrals,
                tiers = tiers,
            )
        }
    }

    fun onCodeCopied() {
        _uiState.value = _uiState.value.copy(codeCopied = true)
        viewModelScope.launch {
            kotlinx.coroutines.delay(2000)
            _uiState.value = _uiState.value.copy(codeCopied = false)
        }
    }

    fun onLinkCopied() {
        _uiState.value = _uiState.value.copy(linkCopied = true)
        viewModelScope.launch {
            kotlinx.coroutines.delay(2000)
            _uiState.value = _uiState.value.copy(linkCopied = false)
        }
    }
}
