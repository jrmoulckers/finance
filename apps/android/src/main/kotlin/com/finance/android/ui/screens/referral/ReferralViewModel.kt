// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.referral

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.referral.Referral
import com.finance.core.referral.ReferralEngine
import com.finance.core.referral.ReferralStatus
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import timber.log.Timber

/**
 * UI state for the Referral Program screen (#1116).
 */
data class ReferralUiState(
    val isLoading: Boolean = true,
    val referralCode: String = "",
    val referralLink: String = "",
    val totalRewardsFormatted: String = "$0.00",
    val pendingCount: Int = 0,
    val acceptedCount: Int = 0,
    val rewardedCount: Int = 0,
    val referrals: List<ReferralItemUi> = emptyList(),
    val showCelebration: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * UI representation of a single referral.
 */
data class ReferralItemUi(
    val id: String,
    val refereeEmail: String,
    val status: ReferralStatus,
    val statusLabel: String,
    val rewardFormatted: String,
    val dateLabel: String,
)

/**
 * ViewModel for the Referral Program feature (#1116).
 *
 * Generates referral codes via KMP [ReferralEngine], tracks referral
 * states, and calculates rewards. Supports sharing via Android Sharesheet.
 *
 * @param householdIdProvider Provides the current user scope.
 */
class ReferralViewModel(
    private val householdIdProvider: HouseholdIdProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReferralUiState())
    val uiState: StateFlow<ReferralUiState> = _uiState.asStateFlow()

    private var referrals: List<Referral> = emptyList()

    init {
        loadReferralData()
    }

    private fun loadReferralData() {
        viewModelScope.launch {
            delay(300)
            val userId = householdIdProvider.householdId.value ?: run {
                Timber.w("No user ID — skipping referral load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            val code = ReferralEngine.generateCode(userId, Clock.System.now().toEpochMilliseconds().toString())
            val link = "https://finance.app/refer/$code"

            // Load existing referrals (simulated)
            val now = Clock.System.now()
            referrals = listOf(
                Referral(
                    id = SyncId("ref-1"),
                    referrerUserId = userId,
                    refereeUserId = SyncId("user-2"),
                    referralCode = code,
                    status = ReferralStatus.REWARDED,
                    rewardAmount = ReferralEngine.DEFAULT_REWARD,
                    createdAt = now,
                    updatedAt = now,
                    acceptedAt = now,
                    rewardedAt = now,
                ),
                Referral(
                    id = SyncId("ref-2"),
                    referrerUserId = userId,
                    referralCode = code,
                    status = ReferralStatus.ACCEPTED,
                    rewardAmount = ReferralEngine.DEFAULT_REWARD,
                    createdAt = now,
                    updatedAt = now,
                    acceptedAt = now,
                ),
                Referral(
                    id = SyncId("ref-3"),
                    referrerUserId = userId,
                    referralCode = code,
                    status = ReferralStatus.SENT,
                    rewardAmount = ReferralEngine.DEFAULT_REWARD,
                    createdAt = now,
                    updatedAt = now,
                ),
            )

            val totalRewards = ReferralEngine.totalRewardsEarned(referrals)
            val counts = ReferralEngine.statusCounts(referrals)

            _uiState.update {
                it.copy(
                    isLoading = false,
                    referralCode = code,
                    referralLink = link,
                    totalRewardsFormatted = CurrencyFormatter.format(totalRewards, Currency.USD),
                    pendingCount = counts[ReferralStatus.SENT] ?: 0,
                    acceptedCount = counts[ReferralStatus.ACCEPTED] ?: 0,
                    rewardedCount = counts[ReferralStatus.REWARDED] ?: 0,
                    referrals = referrals.map { ref ->
                        ReferralItemUi(
                            id = ref.id.value,
                            refereeEmail = ref.refereeUserId?.value ?: "Pending",
                            status = ref.status,
                            statusLabel = ref.status.name.lowercase()
                                .replaceFirstChar { c -> c.uppercaseChar() },
                            rewardFormatted = CurrencyFormatter.format(ref.rewardAmount, Currency.USD),
                            dateLabel = "Recently",
                        )
                    },
                )
            }
            Timber.d("Referral data loaded: code=%s, rewards=%s", code, totalRewards)
        }
    }

    fun generateNewCode() {
        viewModelScope.launch {
            val userId = householdIdProvider.householdId.value ?: return@launch
            val code = ReferralEngine.generateCode(userId, Clock.System.now().toEpochMilliseconds().toString())
            val link = "https://finance.app/refer/$code"
            _uiState.update { it.copy(referralCode = code, referralLink = link) }
            Timber.d("New referral code generated: %s", code)
        }
    }

    fun getShareText(): String {
        val state = _uiState.value
        return "Join Finance and we both get ${CurrencyFormatter.format(ReferralEngine.DEFAULT_REWARD, Currency.USD)}! " +
            "Use my referral link: ${state.referralLink}"
    }

    fun showCelebration() {
        _uiState.update { it.copy(showCelebration = true) }
        viewModelScope.launch {
            delay(3000)
            _uiState.update { it.copy(showCelebration = false) }
        }
    }

    fun dismissCelebration() {
        _uiState.update { it.copy(showCelebration = false) }
    }
}
