// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.security.AutoLockManager
import com.finance.desktop.widgets.AiFinanceWidgetProvider
import com.finance.desktop.widgets.AiSpendWidgetDisplay
import com.finance.desktop.widgets.AiSpendWidgetFormatter
import com.finance.desktop.widgets.AiWidgetAction
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.logging.Level
import java.util.logging.Logger

/**
 * UI state for the AI spend/forecast widget surface.
 *
 * @property isLoading True before the first snapshot resolves.
 * @property display Fully formatted, privacy-aware view, or null while loading.
 * @property errorMessage Non-null when the last refresh failed.
 */
data class AiInsightWidgetUiState(
    val isLoading: Boolean = true,
    val display: AiSpendWidgetDisplay? = null,
    val errorMessage: String? = null,
)

/**
 * ViewModel backing the AI-powered "Today & Forecast" widget card.
 *
 * Mirrors the Android ViewModel pattern: constructor-injected dependencies,
 * [StateFlow] state, and no Android types. It coordinates three concerns:
 * - the on-device [AiFinanceWidgetProvider] (data + prediction),
 * - the deterministic [AiSpendWidgetFormatter] (display strings),
 * - the [AutoLockManager] lock state (privacy masking).
 *
 * Deep-link activation is delegated to the caller via [onDeepLink] so the
 * ViewModel stays free of navigation/UI concerns.
 */
class AiInsightWidgetViewModel(
    private val provider: AiFinanceWidgetProvider,
    private val autoLockManager: AutoLockManager,
    private val currency: Currency = Currency.USD,
    private val nowProvider: () -> Long = { System.currentTimeMillis() },
) : DesktopViewModel() {

    companion object {
        private val logger: Logger =
            Logger.getLogger(AiInsightWidgetViewModel::class.java.name)
    }

    private val _uiState = MutableStateFlow(AiInsightWidgetUiState())
    val uiState: StateFlow<AiInsightWidgetUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    /** Re-reads on-device data, re-runs prediction, and re-formats the card. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            @Suppress("TooGenericExceptionCaught") // Widget refresh error boundary
            try {
                val snapshot = provider.snapshot()
                val display = AiSpendWidgetFormatter.format(
                    snapshot = snapshot,
                    currency = currency,
                    nowEpochMs = nowProvider(),
                    locked = autoLockManager.isLocked.value,
                )
                _uiState.value = AiInsightWidgetUiState(isLoading = false, display = display)
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "AI widget refresh failed", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "Failed to refresh: ${e.message}",
                )
            }
        }
    }

    /** Resolves the `finance://` deep link for a widget [action]. */
    fun deepLinkFor(action: AiWidgetAction): String = action.deepLink

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
