// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.privacy

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.ui.couple.CoupleProfile
import com.finance.android.ui.couple.CoupleProfileRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * A single classifiable item shown in the privacy control list.
 *
 * @property id Stable identifier used to persist the classification.
 * @property type Entity kind (account, budget, goal, debt).
 * @property name Display name.
 * @property subtitle Secondary line (e.g. formatted balance / target).
 * @property visibility Current "yours, mine, ours" classification.
 */
data class PrivacyItemUi(
    val id: String,
    val type: PrivacyEntityType,
    val name: String,
    val subtitle: String,
    val visibility: PrivacyVisibility,
)

/**
 * UI state for the "yours, mine, ours" privacy screen (#2142).
 */
data class CouplePrivacyUiState(
    val isLoading: Boolean = true,
    val profile: CoupleProfile = CoupleProfile(),
    val items: List<PrivacyItemUi> = emptyList(),
    val includePrivateInNetWorth: Boolean = true,
    val summaryOnlySharing: Boolean = true,
    val combinedNetWorthFormatted: String = "$0.00",
    val sharedNetWorthFormatted: String = "$0.00",
    val privateItemCount: Int = 0,
)

/**
 * ViewModel for the couple privacy model (#2142).
 *
 * Loads accounts, budgets, and goals at household scope and lets each partner
 * classify them as Yours / Mine / Ours. Computes a combined net-worth view that
 * can include or exclude privately-owned accounts, and exposes the
 * summary-only sharing default so partner visibility respects consent.
 */
class CouplePrivacyViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val goalRepository: GoalRepository,
    private val privacyRepository: CouplePrivacyRepository,
    private val profileRepository: CoupleProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CouplePrivacyUiState())
    val uiState: StateFlow<CouplePrivacyUiState> = _uiState.asStateFlow()

    private val currency: Currency = Currency.USD

    init {
        load()
    }

    fun refresh() = load()

    /** Cycles an item's classification Mine → Yours → Ours → Mine. */
    fun cycleVisibility(item: PrivacyItemUi) {
        val next = when (item.visibility) {
            PrivacyVisibility.MINE -> PrivacyVisibility.YOURS
            PrivacyVisibility.YOURS -> PrivacyVisibility.OURS
            PrivacyVisibility.OURS -> PrivacyVisibility.MINE
        }
        privacyRepository.setVisibility(item.type, item.id, next)
        load()
    }

    /** Sets an explicit classification for an item. */
    fun setVisibility(item: PrivacyItemUi, visibility: PrivacyVisibility) {
        privacyRepository.setVisibility(item.type, item.id, visibility)
        load()
    }

    fun setIncludePrivateInNetWorth(include: Boolean) {
        privacyRepository.setIncludePrivateInNetWorth(include)
        load()
    }

    fun setSummaryOnlySharing(summaryOnly: Boolean) {
        privacyRepository.setSummaryOnlySharing(summaryOnly)
        _uiState.update { it.copy(summaryOnlySharing = summaryOnly) }
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID — skipping privacy load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            @Suppress("TooGenericExceptionCaught")
            try {
                val accounts = accountRepository.observeAll(householdId).first()
                val budgets = budgetRepository.observeAll(householdId).first()
                val goals = goalRepository.observeAll(householdId).first()

                val items = buildList {
                    accounts.forEach { a ->
                        add(
                            PrivacyItemUi(
                                id = a.id.value,
                                type = PrivacyEntityType.ACCOUNT,
                                name = a.name,
                                subtitle = CurrencyFormatter.format(a.currentBalance, currency),
                                visibility = privacyRepository.visibilityFor(
                                    PrivacyEntityType.ACCOUNT, a.id.value,
                                ),
                            ),
                        )
                    }
                    budgets.forEach { b ->
                        add(
                            PrivacyItemUi(
                                id = b.id.value,
                                type = PrivacyEntityType.BUDGET,
                                name = b.name,
                                subtitle = CurrencyFormatter.format(b.amount, currency),
                                visibility = privacyRepository.visibilityFor(
                                    PrivacyEntityType.BUDGET, b.id.value,
                                ),
                            ),
                        )
                    }
                    goals.forEach { g ->
                        add(
                            PrivacyItemUi(
                                id = g.id.value,
                                type = PrivacyEntityType.GOAL,
                                name = g.name,
                                subtitle = CurrencyFormatter.format(g.targetAmount, currency),
                                visibility = privacyRepository.visibilityFor(
                                    PrivacyEntityType.GOAL, g.id.value,
                                ),
                            ),
                        )
                    }
                }

                val includePrivate = privacyRepository.includePrivateInNetWorth()

                // Net worth is derived from account balances only.
                val sharedNet = accounts
                    .filter { privacyRepository.visibilityFor(PrivacyEntityType.ACCOUNT, it.id.value).isShared }
                    .fold(Cents.ZERO) { acc, a -> acc + a.currentBalance }
                val privateNet = accounts
                    .filterNot { privacyRepository.visibilityFor(PrivacyEntityType.ACCOUNT, it.id.value).isShared }
                    .fold(Cents.ZERO) { acc, a -> acc + a.currentBalance }
                val combined = if (includePrivate) sharedNet + privateNet else sharedNet

                val privateCount = items.count { !it.visibility.isShared }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        profile = profileRepository.load(),
                        items = items,
                        includePrivateInNetWorth = includePrivate,
                        summaryOnlySharing = privacyRepository.summaryOnlySharing(),
                        combinedNetWorthFormatted = CurrencyFormatter.format(combined, currency),
                        sharedNetWorthFormatted = CurrencyFormatter.format(sharedNet, currency),
                        privateItemCount = privateCount,
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load privacy data")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }
}
