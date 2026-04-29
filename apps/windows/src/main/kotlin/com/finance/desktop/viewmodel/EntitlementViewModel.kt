// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.entitlement.EntitlementEngine
import com.finance.desktop.entitlement.EntitlementResult
import com.finance.desktop.entitlement.PremiumFeature
import com.finance.desktop.entitlement.SubscriptionTier
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class FeatureStatusUi(
    val feature: PremiumFeature,
    val isGranted: Boolean,
    val currentUsage: Int? = null,
    val limit: Int? = null,
)

data class EntitlementUiState(
    val isLoading: Boolean = true,
    val currentTier: SubscriptionTier = SubscriptionTier.FREE,
    val featureStatuses: List<FeatureStatusUi> = emptyList(),
    val showUpgradeDialog: Boolean = false,
    val upgradeFeature: PremiumFeature? = null,
)

/**
 * ViewModel for freemium feature gating.
 *
 * Evaluates the user's subscription tier against feature entitlements
 * using [EntitlementEngine] and the KMP shared [FeatureFlagEngine]
 * concepts. Manages upgrade prompt state.
 */
class EntitlementViewModel(
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(EntitlementUiState())
    val uiState: StateFlow<EntitlementUiState> = _uiState.asStateFlow()

    private val householdId = SyncId("d1")

    // In production, this would come from DPAPI-encrypted storage / server
    private var _tier = SubscriptionTier.FREE

    init {
        loadEntitlements()
    }

    fun refresh() {
        loadEntitlements()
    }

    /**
     * Check if a specific feature is accessible. If not, show upgrade prompt.
     *
     * @return true if feature is granted, false if gated.
     */
    fun checkFeatureAccess(feature: PremiumFeature, currentUsage: Int = 0): Boolean {
        val result = EntitlementEngine.checkAccess(_tier, feature, currentUsage)
        return when (result) {
            is EntitlementResult.Granted -> true
            is EntitlementResult.Gated -> {
                showUpgradePrompt(feature)
                false
            }
        }
    }

    fun showUpgradePrompt(feature: PremiumFeature) {
        _uiState.value = _uiState.value.copy(
            showUpgradeDialog = true,
            upgradeFeature = feature,
        )
    }

    fun dismissUpgradePrompt() {
        _uiState.value = _uiState.value.copy(
            showUpgradeDialog = false,
            upgradeFeature = null,
        )
    }

    fun handleUpgrade() {
        // In production: launch Microsoft Store purchase flow
        // For now, simulate upgrade
        _tier = SubscriptionTier.PREMIUM
        _uiState.value = _uiState.value.copy(
            showUpgradeDialog = false,
            upgradeFeature = null,
        )
        loadEntitlements()
    }

    private fun loadEntitlements() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            val accounts = accountRepository.observeAll(householdId).first()
            val budgets = budgetRepository.observeAll(householdId).first()
            val categories = categoryRepository.observeAll(householdId).first()

            val statuses = EntitlementEngine.getAllFeatureStatuses(
                tier = _tier,
                accountCount = accounts.size,
                budgetCount = budgets.size,
                categoryCount = categories.size,
            ).map { (feature, result) ->
                when (result) {
                    is EntitlementResult.Granted -> FeatureStatusUi(
                        feature = feature,
                        isGranted = true,
                    )
                    is EntitlementResult.Gated -> FeatureStatusUi(
                        feature = feature,
                        isGranted = false,
                        currentUsage = result.currentUsage,
                        limit = result.limit,
                    )
                }
            }

            _uiState.value = EntitlementUiState(
                isLoading = false,
                currentTier = _tier,
                featureStatuses = statuses,
            )
        }
    }
}
